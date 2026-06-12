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
import { getPublishedStories, Story } from "@/lib/firestore-service";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 32;
const COVER_H = 200;

function StoryCard({ story }: { story: Story }) {
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
            <View style={[styles.badge, { backgroundColor: colors.primary + "cc" }]}>
              <Text style={styles.badgeText}>{story.genre}</Text>
            </View>
          </View>
        </View>
      ) : (
        <LinearGradient
          colors={["#1a0a2e", "#0a1a2e"]}
          style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}
        >
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

  const load = useCallback(async () => {
    try {
      const data = await getPublishedStories(30);
      setStories(data);
    } catch {
      // sessiz
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
        {user ? (
          <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                {(profile?.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.loginBtnText}>Giriş Yap</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <StoryCard story={item} />}
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
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz hikaye yok</Text>
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
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  loginBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  loginBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  coverContainer: { position: "relative" },
  cover: { width: CARD_W, height: COVER_H },
  coverGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  coverMeta: { position: "absolute", bottom: 10, left: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardBody: { padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  cardAuthor: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", gap: 14, marginTop: 6 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
