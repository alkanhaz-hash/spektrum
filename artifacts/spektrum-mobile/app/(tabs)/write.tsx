import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getStoriesByAuthor, createStory, updateStory, GENRES, Story } from "@/lib/firestore-service";
import { uploadStoryCover } from "@/lib/storage-service";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  published: { label: "Yayında", color: "#22c55e" },
  draft: { label: "Taslak", color: "#f59e0b" },
  completed: { label: "Tamamlandı", color: "#06b6d4" },
};

function LoginPrompt() {
  const colors = useColors();
  return (
    <View style={[lp.container, { backgroundColor: colors.background }]}>
      <Feather name="edit-2" size={52} color={colors.mutedForeground + "60"} />
      <Text style={[lp.title, { color: colors.foreground }]}>Yazmaya Başla</Text>
      <Text style={[lp.sub, { color: colors.mutedForeground }]}>
        Hikayelerini paylaşmak için giriş yapman gerekiyor.
      </Text>
      <TouchableOpacity style={[lp.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")}>
        <Text style={lp.btnText}>Giriş Yap / Kayıt Ol</Text>
      </TouchableOpacity>
    </View>
  );
}

const lp = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 20 },
  btn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function BanBanner({ reason, colors }: { reason?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.banBanner, { backgroundColor: "#7f1d1d22", borderColor: "#ef444440" }]}>
      <Feather name="shield-off" size={28} color="#f87171" />
      <Text style={[styles.banTitle, { color: "#f87171" }]}>Hesabın Askıya Alındı</Text>
      <Text style={[styles.banReason, { color: colors.mutedForeground }]}>
        {reason || "Topluluk kurallarını ihlal ettiğin için hesabın geçici olarak askıya alındı."}
      </Text>
    </View>
  );
}

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [coverUri, setCoverUri] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getStoriesByAuthor(user.uid);
      setStories(data);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) loadStories(); else setLoading(false); }, [user, loadStories]);

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("İzin Gerekli", "Fotoğraf seçmek için galeri iznine ihtiyaç var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [2, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert("Başlık gerekli"); return; }
    if (!user || !profile) return;
    if (profile.banned) {
      Alert.alert("Hesap Askıya Alındı", "Yeni hikaye oluşturamazsın.");
      return;
    }
    setSaving(true);
    try {
      const id = await createStory({
        title: title.trim(),
        summary: summary.trim(),
        genre,
        tags: [],
        authorId: user.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl ?? "",
      });
      if (coverUri) {
        try {
          const coverUrl = await uploadStoryCover(user.uid, id, coverUri);
          await updateStory(id, { coverUrl });
        } catch { /* kapak yükleme hatası sessiz geçer */ }
      }
      setCreating(false);
      setTitle(""); setSummary(""); setGenre(GENRES[0]); setCoverUri(null);
      await loadStories();
      router.push({ pathname: "/story-manage/[id]", params: { id } });
    } catch {
      Alert.alert("Hata", "Hikaye oluşturulamadı.");
    } finally { setSaving(false); }
  };

  const closeModal = () => {
    setCreating(false);
    setTitle(""); setSummary(""); setGenre(GENRES[0]); setCoverUri(null);
  };

  if (!user) return <LoginPrompt />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hikayelerim</Text>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: profile?.banned ? colors.mutedForeground : colors.primary }]}
          onPress={() => {
            if (profile?.banned) { Alert.alert("Hesap Askıya Alındı", "Yeni hikaye oluşturamazsın."); return; }
            setCreating(true);
          }}
        >
          <Feather name="plus" size={20} color="#fff" />
          <Text style={styles.fabText}>Yeni</Text>
        </TouchableOpacity>
      </View>

      {profile?.banned && (
        <BanBanner reason={profile.banReason} colors={colors} />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: s }) => {
            const st = STATUS_LABELS[s.status] ?? { label: s.status, color: colors.mutedForeground };
            return (
              <TouchableOpacity
                style={[styles.storyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push({ pathname: "/story-manage/[id]", params: { id: s.id } })}
                activeOpacity={0.8}
              >
                {s.coverUrl ? (
                  <Image source={{ uri: s.coverUrl }} style={styles.coverThumb} />
                ) : (
                  <View style={[styles.coverThumbPlaceholder, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="book" size={16} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[styles.storyMeta, { color: colors.mutedForeground }]}>
                    {s.genre} · {s.chapterCount ?? 0} bölüm
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: st.color + "22" }]}>
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="feather" size={44} color={colors.mutedForeground + "60"} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz hikaye yok</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                İlk hikayeni oluşturmak için "Yeni" butonuna dokun.
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={closeModal}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Yeni Hikaye</Text>
            <TouchableOpacity onPress={handleCreate} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.saveBtn, { color: colors.primary }]}>Oluştur</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={[styles.coverPicker, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={pickCover} activeOpacity={0.8}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverPickerImage} />
              ) : (
                <View style={styles.coverPickerPlaceholder}>
                  <Feather name="image" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.coverPickerLabel, { color: colors.mutedForeground }]}>Kapak Seç</Text>
                  <Text style={[styles.coverPickerSub, { color: colors.mutedForeground + "80" }]}>İsteğe bağlı</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Başlık *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Hikaye başlığı..."
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Özet</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Hikayeni kısaca anlat..."
              placeholderTextColor={colors.mutedForeground}
              value={summary}
              onChangeText={setSummary}
              multiline
              numberOfLines={4}
              maxLength={300}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tür</Text>
            <View style={styles.genreGrid}>
              {GENRES.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genreChip,
                    { borderColor: colors.border },
                    genre === g && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setGenre(g)}
                >
                  <Text style={[styles.genreChipText, { color: genre === g ? "#fff" : colors.mutedForeground }]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  fab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  fabText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, minHeight: 300 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular" },
  storyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  coverThumb: { width: 42, height: 58, borderRadius: 8 },
  coverThumbPlaceholder: { width: 42, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  storyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  storyMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  banBanner: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  banTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  banReason: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingTop: 20,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 16, gap: 8 },
  coverPicker: {
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    overflow: "hidden",
    marginBottom: 8,
  },
  coverPickerImage: { width: "100%", height: "100%", resizeMode: "cover" },
  coverPickerPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  coverPickerLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  coverPickerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 8, marginBottom: 4 },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: { height: 100, textAlignVertical: "top" },
  genreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  genreChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
