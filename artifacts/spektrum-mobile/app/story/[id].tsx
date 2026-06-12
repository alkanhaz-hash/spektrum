import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory,
  getChapters,
  likeStory,
  unlikeStory,
  incrementStoryRead,
  getTalentPortfoliosByStory,
  reportContent,
  Story,
  Chapter,
  TalentPortfolio,
} from "@/lib/firestore-service";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COVER_H = SCREEN_H * 0.4;

const REPORT_REASONS = [
  "Uygunsuz içerik",
  "Telif hakkı ihlali",
  "Spam / reklam",
  "Nefret söylemi",
  "Şiddet / korku",
  "Diğer",
];

// ─── Yetenek kartı ─────────────────────────────────────────────────────────────

function TalentCard({ p }: { p: TalentPortfolio }) {
  const colors = useColors();
  return (
    <View style={[tc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={tc.headerRow}>
        <View style={[tc.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[tc.avatarText, { color: colors.primary }]}>
            {p.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[tc.name, { color: colors.foreground }]} numberOfLines={1}>{p.userName}</Text>
          {!!p.style && (
            <Text style={[tc.style, { color: colors.mutedForeground }]} numberOfLines={1}>
              {p.style}
            </Text>
          )}
        </View>
      </View>
      {!!p.title && (
        <Text style={[tc.title, { color: colors.foreground }]} numberOfLines={1}>{p.title}</Text>
      )}
      {p.coverDesigns.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={tc.designRow}>
            {p.coverDesigns.map((uri, i) => (
              <Image key={i} source={{ uri }} style={tc.design} resizeMode="cover" />
            ))}
          </View>
        </ScrollView>
      )}
      {!!p.bio && (
        <Text style={[tc.bio, { color: colors.mutedForeground }]} numberOfLines={3}>{p.bio}</Text>
      )}
      {!!p.contactInfo && (
        <View style={[tc.contactRow, { borderTopColor: colors.border }]}>
          <Feather name="mail" size={13} color={colors.primary} />
          <Text style={[tc.contact, { color: colors.primary }]} numberOfLines={1}>{p.contactInfo}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Ana ekran ─────────────────────────────────────────────────────────────────

export default function StoryDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [portfolios, setPortfolios] = useState<TalentPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // şikayet modal
  const [showReport, setShowReport] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const storyId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    if (!storyId) return;
    (async () => {
      try {
        const [s, ch, pt] = await Promise.all([
          getStory(storyId),
          getChapters(storyId),
          getTalentPortfoliosByStory(storyId),
        ]);
        setStory(s);
        setChapters(ch);
        setPortfolios(pt);
        if (s) {
          setLikeCount(s.likeCount ?? 0);
          if (user) setLiked((s.likedBy ?? []).includes(user.uid));
          await incrementStoryRead(storyId);
        }
      } catch { /* sessiz */ }
      finally { setLoading(false); }
    })();
  }, [storyId, user]);

  const handleLike = async () => {
    if (!user || !story) { router.push("/auth"); return; }
    if (liked) {
      setLiked(false);
      setLikeCount((c) => c - 1);
      await unlikeStory(story.id, user.uid);
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
      await likeStory(story.id, user.uid);
    }
  };

  const handleReport = async (reason: string) => {
    if (!user || !story) return;
    setReportSubmitting(true);
    try {
      await reportContent({
        reportedId: story.id,
        reportedType: "story",
        reporterId: user.uid,
        reason,
      });
      setShowReport(false);
      Alert.alert("Şikayet alındı", "İnceleme için moderatörlere iletildi.");
    } catch {
      Alert.alert("Hata", "Şikayet gönderilemedi.");
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!story) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Hikaye bulunamadı.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Kapak */}
        <View style={{ height: COVER_H }}>
          {story.coverUrl ? (
            <Image source={{ uri: story.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#1e0a3c", "#0a1428"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.3)", "transparent", colors.background]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          {/* Şikayet butonu — kapak üzerinde */}
          {user && user.uid !== story.authorId && (
            <TouchableOpacity
              style={[styles.reportBtnCover, { top: insets.top + 8 }]}
              onPress={() => setShowReport(true)}
            >
              <Feather name="flag" size={18} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Bilgi */}
        <View style={styles.infoSection}>
          <View style={styles.genreReportRow}>
            <View style={[styles.genreBadge, { backgroundColor: colors.primary + "33" }]}>
              <Text style={[styles.genreBadgeText, { color: colors.primary }]}>{story.genre}</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{story.title}</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/user/[id]", params: { id: story.authorId } })}
          >
            <Text style={[styles.authorText, { color: colors.primary }]}>
              {story.authorName}
            </Text>
          </TouchableOpacity>

          {/* İstatistikler */}
          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.statBtn} onPress={handleLike}>
              <Feather name="heart" size={18} color={liked ? "#ec4899" : colors.mutedForeground} />
              <Text style={[styles.statText, { color: liked ? "#ec4899" : colors.mutedForeground }]}>
                {likeCount.toLocaleString("tr")}
              </Text>
            </TouchableOpacity>
            <View style={styles.statBtn}>
              <Feather name="eye" size={18} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {(story.readCount ?? 0).toLocaleString("tr")}
              </Text>
            </View>
            <View style={styles.statBtn}>
              <Feather name="book-open" size={18} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {story.chapterCount ?? 0} bölüm
              </Text>
            </View>
          </View>

          {/* Özet */}
          {!!story.summary && (
            <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryText, { color: colors.foreground }]}>{story.summary}</Text>
            </View>
          )}

          {/* Etiketler */}
          {story.tags && story.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.tagRow}>
                {story.tags.map((tag) => (
                  <View key={tag} style={[styles.tag, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.tagText, { color: colors.mutedForeground }]}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Okumaya başla */}
          {chapters.length > 0 && (
            <TouchableOpacity
              style={[styles.readBtn]}
              onPress={() =>
                router.push({
                  pathname: "/read/[storyId]",
                  params: { storyId: story.id, chapterId: chapters[0].id },
                })
              }
            >
              <LinearGradient
                colors={["#7c3aed", "#6d28d9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.readBtnGrad}
              >
                <Feather name="book-open" size={18} color="#fff" />
                <Text style={styles.readBtnText}>Okumaya Başla</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Bölümler */}
        {chapters.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Bölümler ({chapters.length})
            </Text>
            {chapters.map((ch, idx) => (
              <TouchableOpacity
                key={ch.id}
                style={[styles.chapterRow, { borderColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: "/read/[storyId]",
                    params: { storyId: story.id, chapterId: ch.id },
                  })
                }
                activeOpacity={0.7}
              >
                <View style={[styles.chapterNum, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.chapterNumText, { color: colors.mutedForeground }]}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={styles.chapterInfo}>
                  <Text style={[styles.chapterTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {ch.title}
                  </Text>
                  <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                    {(ch.wordCount ?? 0).toLocaleString("tr")} kelime
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Yetenek portföyleri */}
        {portfolios.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Feather name="star" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Yetenek Portföyleri
              </Text>
            </View>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Bu hikaye için kapak tasarımı sunan çizerler
            </Text>
            {portfolios.map((p) => (
              <TalentCard key={p.id} p={p} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Şikayet modalı */}
      <Modal
        visible={showReport}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReport(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.reportBackdrop}
          activeOpacity={1}
          onPress={() => setShowReport(false)}
        />
        <View style={[styles.reportSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <Text style={[styles.reportTitle, { color: colors.foreground }]}>Hikayeyi Şikayet Et</Text>
          <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
            Neden şikayet ediyorsun?
          </Text>
          {REPORT_REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.reportOption, { borderColor: colors.border }]}
              onPress={() => handleReport(r)}
              disabled={reportSubmitting}
            >
              {reportSubmitting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Text style={[styles.reportOptionText, { color: colors.foreground }]}>{r}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  reportBtnCover: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoSection: { padding: 20, gap: 10 },
  genreReportRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  genreBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  genreBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 32 },
  authorText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 20 },
  statBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryBox: { padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  summaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  tagRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  tagText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  readBtn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
  readBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15 },
  readBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  section: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -4 },
  chapterRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  chapterNum: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chapterNumText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  chapterInfo: { flex: 1 },
  chapterTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chapterMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  reportBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  reportSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(150,150,180,0.4)", alignSelf: "center", marginBottom: 8 },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  reportSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 4 },
  reportOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  reportOptionText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});

const tc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  style: { fontSize: 12, fontFamily: "Inter_400Regular" },
  title: { fontSize: 15, fontFamily: "Inter_700Bold" },
  designRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  design: { width: 90, height: 120, borderRadius: 10 },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, borderTopWidth: 1 },
  contact: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
});
