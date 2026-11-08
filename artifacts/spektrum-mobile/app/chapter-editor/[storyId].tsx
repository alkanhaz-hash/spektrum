import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getChapter,
  getStory,
  getAllChapters,
  createChapter,
  updateChapter,
  updateStory,
  Chapter,
} from "@/lib/firestore-service";
import { moderateText } from "@/lib/moderation-service";
import ChapterAudioSection from "@/components/ChapterAudioSection";

type ModerationStatus = "idle" | "checking" | "approved" | "pending_review" | "rejected";

export default function ChapterEditorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { storyId, chapterId } = useLocalSearchParams<{ storyId: string; chapterId?: string }>();
  const { user, profile } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!!chapterId);
  const [saving, setSaving] = useState(false);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>("idle");
  const [moderationReason, setModerationReason] = useState<string | null>(null);
  const [nextOrder, setNextOrder] = useState(1);
  const [isPaid, setIsPaid] = useState(false);
  const [storyLanguage, setStoryLanguage] = useState<"tr" | "en">("tr");
  const [loadedChapterId, setLoadedChapterId] = useState<string | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishedRef = useRef(false);
  const savedTextRef = useRef({ title: "", content: "" });
  const [autoSaveLabel, setAutoSaveLabel] = useState<"saved" | "saving" | null>(null);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const chapterPrice = Math.max(1, Math.ceil(wordCount / 500));

  const load = useCallback(async () => {
    try {
      const story = await getStory(storyId);
      setStoryLanguage(story?.contentLanguage ?? "tr");
    } catch { /* moderation remains Turkish by default */ }
    if (!chapterId) {
      try {
        const chs = await getAllChapters(storyId);
        setNextOrder(chs.length + 1);
      } catch { /* sessiz */ }
      setLoading(false);
      return;
    }
    try {
      const ch = await getChapter(chapterId);
      if (ch) {
        savedTextRef.current = { title: ch.title, content: ch.content };
        setTitle(ch.title);
        setContent(ch.content);
        setIsPaid(ch.isPaid ?? false);
        setLoadedChapterId(ch.id);
      }
    } catch { /* sessiz */ }
    setLoading(false);
  }, [chapterId, storyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!title || !content || !chapterId || (title === savedTextRef.current.title && content === savedTextRef.current.content)) return;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    autoSaveTimer.current = setTimeout(async () => {
      if (publishedRef.current) return;
      setAutoSaveLabel("saving");
      try {
        await updateChapter(chapterId, { title, content, status: "draft" });
        savedTextRef.current = { title, content };
        setAutoSaveLabel("saved");
        setTimeout(() => setAutoSaveLabel(null), 2500);
      } catch {
        setAutoSaveLabel(null);
      }
    }, 3000);
    return () => { if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; } };
  }, [title, content, chapterId]);

  const saveDraft = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("Eksik Alan", "Taslak kaydetmek için başlık ve içerik doldurulmalı.");
      return;
    }
    setSaving(true);
    try {
      if (!chapterId) {
        const newId = await createChapter({
          storyId,
          title: title.trim(),
          content: content.trim(),
          order: nextOrder,
          status: "draft",
          isPaid,
          ...(isPaid ? { price: chapterPrice } : {}),
        });
        router.replace({ pathname: "/chapter-editor/[storyId]", params: { storyId, chapterId: newId } });
      } else {
        const updateData: any = { title: title.trim(), content: content.trim(), status: "draft", isPaid };
        if (isPaid) updateData.price = chapterPrice;
        await updateChapter(chapterId, updateData);
        Alert.alert("Taslak kaydedildi");
      }
    } catch (err: any) {
      Alert.alert("Hata", `Kaydedilemedi: ${err?.message ?? "Bilinmeyen hata"}`);
    } finally {
      setSaving(false);
    }
  };

  const publishChapter = async () => {
    if (!title.trim()) { Alert.alert("Başlık gerekli"); return; }
    if (content.trim().length < 50) { Alert.alert("İçerik çok kısa", "En az 50 karakter yazmalısın."); return; }
    if (!user || !profile) return;

    if (profile.banned) {
      Alert.alert("Hesap Askıya Alındı", profile.banReason || "Yayın göndermek için hesabın aktif olmalı.");
      return;
    }

    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    publishedRef.current = true;
    setSaving(true);
    setModerationStatus("checking");
    setModerationReason(null);

    try {
      const result = await moderateText(content.trim(), storyLanguage);

      const chapterStatus: Chapter["status"] =
        result.action === "approved"
          ? "published"
          : result.action === "pending_review"
          ? "pending_review"
          : "rejected";

      setModerationStatus(
        chapterStatus === "published" ? "approved" : chapterStatus === "pending_review" ? "pending_review" : "rejected"
      );
      setModerationReason(result.reason);

      let targetChapterId = chapterId;
      if (!chapterId) {
        targetChapterId = await createChapter({
          storyId,
          title: title.trim(),
          content: content.trim(),
          order: nextOrder,
          status: chapterStatus,
          isPaid,
          ...(isPaid ? { price: chapterPrice } : {}),
        });
        if (
          (result.categories.length || result.reason) &&
          targetChapterId
        ) {
          await updateChapter(targetChapterId, {
            title: title.trim(),
            content: content.trim(),
            status: chapterStatus,
            ...(result.categories.length ? { moderationCategories: result.categories } : {}),
            ...(result.reason && chapterStatus === "rejected" ? { rejectionReason: result.reason } : {}),
          });
        }
      } else {
        const updateData2: any = {
          title: title.trim(),
          content: content.trim(),
          status: chapterStatus,
          isPaid,
          ...(result.categories.length ? { moderationCategories: result.categories } : {}),
          ...(result.reason && chapterStatus === "rejected" ? { rejectionReason: result.reason } : {}),
        };
        if (isPaid) updateData2.price = chapterPrice;
        await updateChapter(chapterId, updateData2);
      }

      if (chapterStatus === "rejected") {
        publishedRef.current = false;
        Alert.alert("Yayınlanamadı", result.reason || "İçerik uyumsuz bulundu.");
        return;
      }

      if (chapterStatus === "published" || chapterStatus === "pending_review") {
        updateStory(storyId, { status: "published" }).catch(() => {});
      }

      setTimeout(() => {
        router.replace({ pathname: "/story-manage/[id]", params: { id: storyId } });
      }, 1500);
    } catch {
      setModerationStatus("idle");
      publishedRef.current = false;
      Alert.alert("Hata", "Yayınlama sırasında bir sorun oluştu.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (profile?.banned) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bölüm Editörü</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.center, { flex: 1 }]}>
          <View style={[styles.banCard, { backgroundColor: "#7f1d1d22", borderColor: "#ef444440" }]}>
            <Feather name="shield-off" size={32} color="#f87171" />
            <Text style={[styles.banTitle, { color: "#f87171" }]}>Hesabın Askıya Alındı</Text>
            <Text style={[styles.banReason, { color: colors.mutedForeground }]}>
              {profile.banReason || "Topluluk kurallarını ihlal ettiğin için yayın gönderemezsin."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {chapterId ? "Bölümü Düzenle" : "Yeni Bölüm"}
        </Text>
        <View style={{ width: 36 }}>
          {autoSaveLabel === "saving" && <ActivityIndicator size="small" color={colors.mutedForeground} />}
          {autoSaveLabel === "saved" && <Feather name="check" size={18} color="#22c55e" />}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bölüm Başlığı *</Text>
          <TextInput
            style={[styles.titleInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Bu bölümün adı..."
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          <View style={styles.contentHeader}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>İçerik *</Text>
            <Text style={[styles.wordCount, { color: colors.mutedForeground }]}>{wordCount} kelime</Text>
          </View>
          <TextInput
            style={[styles.contentInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Hikayeni buraya yaz... En az 50 karakter olmalı."
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />

          {moderationStatus !== "idle" && (
            <View style={[
              styles.moderationBanner,
              {
                backgroundColor:
                  moderationStatus === "checking" ? colors.primary + "15" :
                  moderationStatus === "approved" ? "#22c55e15" :
                  moderationStatus === "pending_review" ? "#f59e0b15" :
                  "#ef444415",
                borderColor:
                  moderationStatus === "checking" ? colors.primary + "40" :
                  moderationStatus === "approved" ? "#22c55e40" :
                  moderationStatus === "pending_review" ? "#f59e0b40" :
                  "#ef444440",
              }
            ]}>
              {moderationStatus === "checking" ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.moderationText, { color: colors.primary }]}>İçerik denetleniyor...</Text>
                </>
              ) : (
                <>
                  <Feather
                    name={
                      moderationStatus === "approved" ? "check-circle" :
                      moderationStatus === "pending_review" ? "clock" :
                      "alert-triangle"
                    }
                    size={18}
                    color={
                      moderationStatus === "approved" ? "#22c55e" :
                      moderationStatus === "pending_review" ? "#f59e0b" :
                      "#ef4444"
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moderationText, {
                      color:
                        moderationStatus === "approved" ? "#22c55e" :
                        moderationStatus === "pending_review" ? "#f59e0b" :
                        "#ef4444"
                    }]}>
                      {moderationStatus === "approved" ? "Bölüm yayınlandı!" :
                       moderationStatus === "pending_review" ? "Moderatör incelemesine gönderildi" :
                       "Bölüm yayınlanamadı"}
                    </Text>
                    {moderationStatus === "pending_review" ? (
                      <Text style={[styles.moderationReason, { color: colors.mutedForeground }]}>
                        İçeriğin ekibimiz tarafından inceleniyor. Genellikle 24 saat içinde sonuçlanır. Onaylandığında profil sayfanda bildirim alırsın.
                      </Text>
                    ) : moderationReason ? (
                      <Text style={[styles.moderationReason, { color: colors.mutedForeground }]}>{moderationReason}</Text>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          )}
          {/* Ücretli / Ücretsiz seçimi */}
          <View style={[styles.paidSection, { borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bölüm Erişim Türü</Text>
            <View style={styles.paidToggleRow}>
              <TouchableOpacity
                style={[styles.paidToggleBtn, { borderColor: !isPaid ? colors.primary : colors.border, backgroundColor: !isPaid ? colors.primary + "18" : "transparent" }]}
                onPress={() => setIsPaid(false)}
              >
                <Feather name="unlock" size={15} color={!isPaid ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.paidToggleBtnText, { color: !isPaid ? colors.primary : colors.mutedForeground, fontFamily: !isPaid ? "Inter_600SemiBold" : "Inter_400Regular" }]}>Ücretsiz</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paidToggleBtn, { borderColor: isPaid ? "#f59e0b" : colors.border, backgroundColor: isPaid ? "#f59e0b18" : "transparent" }]}
                onPress={() => setIsPaid(true)}
              >
                <Feather name="lock" size={15} color={isPaid ? "#f59e0b" : colors.mutedForeground} />
                <Text style={[styles.paidToggleBtnText, { color: isPaid ? "#f59e0b" : colors.mutedForeground, fontFamily: isPaid ? "Inter_600SemiBold" : "Inter_400Regular" }]}>Ücretli</Text>
              </TouchableOpacity>
            </View>
            {isPaid && (
              <View style={[styles.priceInfo, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b40" }]}>
                <Feather name="zap" size={14} color="#f59e0b" />
                <Text style={[styles.priceInfoText, { color: "#f59e0b" }]}>
                  Bu bölüm için <Text style={{ fontFamily: "Inter_700Bold" }}>{chapterPrice} jeton</Text> gerekir{" "}
                  <Text style={{ color: colors.mutedForeground }}>(her 500 kelime = 1 jeton)</Text>
                </Text>
              </View>
            )}
          </View>
          {(!chapterId || loadedChapterId) && (
            <View style={{ marginTop: 12 }}>
              <ChapterAudioSection chapterId={loadedChapterId ?? undefined} canManage={!!loadedChapterId} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.draftBtn, { borderColor: colors.border }]}
          onPress={saveDraft}
          disabled={saving}
        >
          <Text style={[styles.draftBtnText, { color: saving ? colors.mutedForeground : colors.foreground }]}>
            Taslak Kaydet
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.publishBtn, { backgroundColor: saving ? colors.primary + "80" : colors.primary }]}
          onPress={publishChapter}
          disabled={saving}
        >
          {saving && moderationStatus === "checking" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.publishBtnText}>
              {saving ? "İşleniyor..." : "Yayınla"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  body: { padding: 16, gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  titleInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
  },
  contentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  wordCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contentInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    minHeight: 300,
  },
  moderationBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  moderationText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  moderationReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 17 },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  draftBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  draftBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  publishBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  publishBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  banCard: {
    margin: 24,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  banTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  banReason: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  paidSection: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 12, gap: 10 },
  paidToggleRow: { flexDirection: "row" as const, gap: 10 },
  paidToggleBtn: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  paidToggleBtnText: { fontSize: 14 },
  priceInfo: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  priceInfoText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
});
