import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getStory, getAllChapters, Story, Chapter } from "@/lib/firestore-service";

const CHAPTER_STATUS: Record<string, { label: string; color: string }> = {
  published: { label: "Yayınlandı", color: "#22c55e" },
  pending_review: { label: "İnceleniyor", color: "#f59e0b" },
  draft: { label: "Taslak", color: "#64748b" },
  rejected: { label: "Reddedildi", color: "#ef4444" },
};

export default function StoryManageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, chs] = await Promise.all([getStory(id), getAllChapters(id)]);
      setStory(s);
      setChapters(chs);
    } catch {
      Alert.alert("Hata", "Hikaye yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openChapterEditor = (chapterId?: string) => {
    router.push({
      pathname: "/chapter-editor/[storyId]",
      params: chapterId ? { storyId: id, chapterId } : { storyId: id },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {story?.title ?? "Hikaye"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={chapters}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {story && (
              <View style={[styles.storyInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {story.coverUrl ? (
                  <Image source={{ uri: story.coverUrl }} style={styles.cover} />
                ) : (
                  <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="book" size={28} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storyTitle, { color: colors.foreground }]}>{story.title}</Text>
                  <Text style={[styles.storyGenre, { color: colors.mutedForeground }]}>{story.genre}</Text>
                  {story.summary ? (
                    <Text style={[styles.storySummary, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {story.summary}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bölümler</Text>
              <TouchableOpacity
                style={[styles.addBtn, { borderColor: colors.primary }]}
                onPress={() => openChapterEditor()}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Yeni Bölüm</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item: ch }) => {
          const st = CHAPTER_STATUS[ch.status] ?? { label: ch.status, color: colors.mutedForeground };
          return (
            <TouchableOpacity
              style={[styles.chapterCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openChapterEditor(ch.id)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterOrder, { color: colors.mutedForeground }]}>
                  Bölüm {ch.order}
                </Text>
                <Text style={[styles.chapterTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {ch.title}
                </Text>
                {ch.status === "rejected" && ch.rejectionReason ? (
                  <Text style={[styles.rejectionReason, { color: "#ef4444" }]} numberOfLines={2}>
                    Sebep: {ch.rejectionReason}
                  </Text>
                ) : null}
                <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                  {ch.wordCount ?? 0} kelime
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <View style={[styles.statusBadge, { backgroundColor: st.color + "22" }]}>
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
                <Feather name="edit-2" size={16} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book-open" size={40} color={colors.mutedForeground + "60"} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz bölüm yok</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              "Yeni Bölüm" butonuyla ilk bölümünü ekle.
            </Text>
          </View>
        }
      />
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
  list: { padding: 16, gap: 10 },
  storyInfo: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  cover: { width: 64, height: 90, borderRadius: 10 },
  coverPlaceholder: { width: 64, height: 90, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  storyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  storyGenre: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  storySummary: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chapterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  chapterOrder: { fontSize: 11, fontFamily: "Inter_400Regular" },
  chapterTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  rejectionReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 17 },
  chapterMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
