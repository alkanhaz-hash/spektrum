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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getStoriesByAuthor, createStory, GENRES, Story } from "@/lib/firestore-service";

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

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);

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

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert("Başlık gerekli"); return; }
    if (!user || !profile) return;
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
      setCreating(false);
      setTitle(""); setSummary(""); setGenre(GENRES[0]);
      await loadStories();
      router.push({ pathname: "/story/[id]", params: { id } });
    } catch {
      Alert.alert("Hata", "Hikaye oluşturulamadı.");
    } finally { setSaving(false); }
  };

  if (!user) return <LoginPrompt />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hikayelerim</Text>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setCreating(true)}
        >
          <Feather name="plus" size={20} color="#fff" />
          <Text style={styles.fabText}>Yeni</Text>
        </TouchableOpacity>
      </View>

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
                onPress={() => router.push({ pathname: "/story/[id]", params: { id: s.id } })}
                activeOpacity={0.8}
              >
                <View style={styles.storyCardLeft}>
                  <View style={[styles.genreDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text style={[styles.storyMeta, { color: colors.mutedForeground }]}>
                      {s.genre} · {s.chapterCount ?? 0} bölüm
                    </Text>
                  </View>
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

      {/* Create Modal */}
      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setCreating(false)}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular" },
  storyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  storyCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  genreDot: { width: 8, height: 8, borderRadius: 4 },
  storyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  storyMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
