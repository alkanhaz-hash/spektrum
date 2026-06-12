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
  Story,
  Chapter,
} from "@/lib/firestore-service";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COVER_H = SCREEN_H * 0.4;

export default function StoryDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const storyId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    if (!storyId) return;
    (async () => {
      try {
        const [s, ch] = await Promise.all([getStory(storyId), getChapters(storyId)]);
        setStory(s);
        setChapters(ch);
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
        {/* Cover */}
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
          {/* Back button */}
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={[styles.genreBadge, { backgroundColor: colors.primary + "33" }]}>
            <Text style={[styles.genreBadgeText, { color: colors.primary }]}>{story.genre}</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{story.title}</Text>
          <Text style={[styles.authorText, { color: colors.mutedForeground }]}>
            {story.authorName}
          </Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.statBtn} onPress={handleLike}>
              <Feather
                name={liked ? "heart" : "heart"}
                size={18}
                color={liked ? "#ec4899" : colors.mutedForeground}
              />
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

          {/* Summary */}
          {!!story.summary && (
            <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryText, { color: colors.foreground }]}>{story.summary}</Text>
            </View>
          )}

          {/* Start reading button */}
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

        {/* Chapters */}
        {chapters.length > 0 && (
          <View style={[styles.chaptersSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.chaptersTitle, { color: colors.foreground }]}>
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
      </ScrollView>
    </View>
  );
}

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
  infoSection: { padding: 20, gap: 10 },
  genreBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  genreBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 32 },
  authorText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", gap: 20 },
  statBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryBox: { padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  summaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  readBtn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
  readBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15 },
  readBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  chaptersSection: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 20, gap: 10 },
  chaptersTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  chapterNum: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chapterNumText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  chapterInfo: { flex: 1 },
  chapterTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chapterMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
