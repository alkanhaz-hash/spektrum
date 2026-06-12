import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getTrendingStories, Story } from "@/lib/firestore-service";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 32;
const COVER_H = 200;

function StoryCard({ story, rank }: { story: Story; rank: number }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/story/[id]", params: { id: story.id } })}
      activeOpacity={0.85}
    >
      {story.coverUrl ? (
        <View style={styles.coverContainer}>
          <Image source={{ uri: story.coverUrl }} style={styles.cover} resizeMode="cover" />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={styles.coverGradient}
          />
          <View style={styles.coverMeta}>
            <View style={[styles.rankBadge, { backgroundColor: colors.primary + "dd" }]}>
              <Text style={styles.rankText}>#{rank}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
              <Text style={styles.badgeText}>{story.genre}</Text>
            </View>
          </View>
        </View>
      ) : (
        <LinearGradient
          colors={["#1a0a2e", "#0a1a2e"]}
          style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}
        >
          <View style={[styles.rankBadgeAbsolute, { backgroundColor: colors.primary + "dd" }]}>
            <Text style={styles.rankText}>#{rank}</Text>
          </View>
          <Feather name="book" size={32} color="#4a4a6a" />
        </LinearGradient>
      )}

      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {story.title}
        </Text>
        <Text style={[styles.cardAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
          {story.authorName}
        </Text>
        {story.summary ? (
          <Text style={[styles.cardSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
            {story.summary}
          </Text>
        ) : null}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Feather name="eye" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {(story.readCount ?? 0).toLocaleString("tr")}
            </Text>
          </View>
          <View style={styles.stat}>
            <Feather name="heart" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {(story.likeCount ?? 0).toLocaleString("tr")}
            </Text>
          </View>
          <View style={styles.stat}>
            <Feather name="book-open" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {story.chapterCount ?? 0} bölüm
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await getTrendingStories(30);
      setStories(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.logo, { color: colors.primary }]}>SPEKTRUM</Text>
        <TouchableOpacity
          onPress={() => user ? router.push("/(tabs)/profile") : router.push("/auth")}
          activeOpacity={0.75}
        >
          <View style={[styles.avatar, { backgroundColor: colors.muted, borderColor: colors.primary + "40" }]}>
            {user && profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
            ) : user ? (
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                {(profile?.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
              </Text>
            ) : (
              <Feather name="user" size={16} color={colors.mutedForeground} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Yüklenemedi</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: colors.primary }]}
            onPress={load}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.id}
          renderItem={({ item, index }) => <StoryCard story={item} rank={index + 1} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Feather name="trending-up" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trend Hikayeler</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                En yüksek etkileşim
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Henüz hikaye yok
              </Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
                İlk hikayeyi sen yaz!
              </Text>
            </View>
          }
        />
      )}
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
  logo: { fontSize: 22, fontWeight: "800", letterSpacing: 2, fontFamily: "Inter_700Bold" },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  coverContainer: { position: "relative" },
  cover: { width: CARD_W, height: COVER_H },
  coverGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100 },
  coverMeta: { position: "absolute", bottom: 10, left: 12, flexDirection: "row", gap: 6, alignItems: "center" },
  rankBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  rankBadgeAbsolute: { position: "absolute", top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  rankText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardBody: { padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  cardAuthor: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardSummary: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 14, marginTop: 6 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
