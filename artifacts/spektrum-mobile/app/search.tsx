import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { searchStories, searchUsers, Story, UserSearchResult, GENRES } from "@/lib/firestore-service";

type Tab = "stories" | "users";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function StoryRow({ story }: { story: Story }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.storyRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/story/[id]", params: { id: story.id } })}
      activeOpacity={0.8}
    >
      {story.coverUrl ? (
        <Image source={{ uri: story.coverUrl }} style={styles.storyCover} resizeMode="cover" />
      ) : (
        <View style={[styles.storyCover, styles.storyCoverFallback, { backgroundColor: colors.primary + "22" }]}>
          <Feather name="book" size={18} color={colors.primary + "80"} />
        </View>
      )}
      <View style={styles.storyInfo}>
        <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={2}>
          {story.title}
        </Text>
        <Text style={[styles.storyAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
          {story.authorName}
        </Text>
        <View style={styles.storyMeta}>
          <View style={[styles.genrePill, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.genrePillText, { color: colors.primary }]}>{story.genre}</Text>
          </View>
          <Feather name="eye" size={11} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{story.readCount ?? 0}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function UserRow({ user }: { user: UserSearchResult }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/user/[id]", params: { id: user.uid } })}
      activeOpacity={0.8}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={[styles.userAvatar, { borderColor: colors.border }]} />
      ) : (
        <View style={[styles.userAvatar, styles.userAvatarFallback, { backgroundColor: colors.primary + "22", borderColor: colors.border }]}>
          <Text style={[styles.userAvatarInitial, { color: colors.primary }]}>
            {(user.displayName ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
          {user.displayName}
        </Text>
        {!!user.bio && (
          <Text style={[styles.userBio, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user.bio}
          </Text>
        )}
        <View style={styles.userStats}>
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {user.storyCount ?? 0} hikaye
          </Text>
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>·</Text>
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {user.followerCount ?? 0} takipçi
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Ana Ekran ────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("stories");
  const [stories, setStories] = useState<Story[]>([]);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setStories([]);
      setUsers([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const [s, u] = await Promise.all([searchStories(t), searchUsers(t)]);
        setStories(s);
        setUsers(u);
        setSearched(true);
      } catch {
        setStories([]);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [term]);

  const tabs: { key: Tab; label: string; count: number; icon: string }[] = [
    { key: "stories", label: "Hikayeler", count: stories.length, icon: "book" },
    { key: "users", label: "Yazarlar", count: users.length, icon: "users" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Başlık + geri */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={inputRef}
            value={term}
            onChangeText={setTerm}
            placeholder="Hikaye, yazar veya etiket ara..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {term.length > 0 && (
            <TouchableOpacity onPress={() => setTerm("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sekmeler */}
      <View style={[styles.tabs, { borderColor: colors.border }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.tabBtn,
              tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setTab(t.key)}
          >
            <Feather
              name={t.icon as any}
              size={14}
              color={tab === t.key ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
            {searched && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.countText, { color: colors.primary }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* İçerik */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !searched && term.trim().length < 2 ? (
        <ScrollView
          contentContainerStyle={[styles.genresWrap, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.genresTitle, { color: colors.mutedForeground }]}>
            Popüler türlere göz at
          </Text>
          <View style={styles.genreGrid}>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.suggestionPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setTerm(g)}
                activeOpacity={0.75}
              >
                <Text style={[styles.suggestionPillText, { color: colors.foreground }]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : tab === "stories" ? (
        stories.length === 0 ? (
          <View style={styles.center}>
            <Feather name="book" size={44} color={colors.mutedForeground + "40"} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              "{term}" için hikaye bulunamadı.
            </Text>
          </View>
        ) : (
          <FlatList
            data={stories}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => <StoryRow story={item} />}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={44} color={colors.mutedForeground + "40"} />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            "{term}" için yazar bulunamadı.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.uid}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <UserRow user={item} />}
          showsVerticalScrollIndicator={false}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },

  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  countText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  hint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  genresWrap: { padding: 20 },
  genresTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.8 },
  genreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestionPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  suggestionPillText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  storyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  storyCover: { width: 56, height: 76, borderRadius: 8 },
  storyCoverFallback: { alignItems: "center", justifyContent: "center" },
  storyInfo: { flex: 1 },
  storyTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  storyAuthor: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  storyMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  genrePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  genrePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  userAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1 },
  userAvatarFallback: { alignItems: "center", justifyContent: "center" },
  userAvatarInitial: { fontSize: 22, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  userBio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  userStats: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
});
