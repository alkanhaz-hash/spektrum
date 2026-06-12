import React, { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getPublishedStories, searchStories, GENRES, Story } from "@/lib/firestore-service";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 48) / 2;

function StoryGridCard({ story }: { story: Story }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/story/[id]", params: { id: story.id } })}
      activeOpacity={0.85}
    >
      {story.coverUrl ? (
        <View>
          <Image source={{ uri: story.coverUrl }} style={styles.gridCover} resizeMode="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.gridGradient} />
        </View>
      ) : (
        <LinearGradient colors={["#1a0a2e", "#0a1a2e"]} style={styles.gridCover}>
          <Feather name="book" size={24} color="#4a4a6a" />
        </LinearGradient>
      )}
      <View style={styles.gridBody}>
        <View style={[styles.genrePill, { backgroundColor: colors.primary + "33" }]}>
          <Text style={[styles.genrePillText, { color: colors.primary }]} numberOfLines={1}>
            {story.genre}
          </Text>
        </View>
        <Text style={[styles.gridTitle, { color: colors.foreground }]} numberOfLines={2}>
          {story.title}
        </Text>
        <Text style={[styles.gridAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
          {story.authorName}
        </Text>
        <View style={styles.gridStats}>
          <Feather name="eye" size={11} color={colors.mutedForeground} />
          <Text style={[styles.gridStatText, { color: colors.mutedForeground }]}>
            {(story.readCount ?? 0) > 999
              ? `${((story.readCount ?? 0) / 1000).toFixed(1)}B`
              : (story.readCount ?? 0).toString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGenre = useCallback(async (g: string | null) => {
    setLoading(true);
    setSearched(true);
    try {
      const data = await getPublishedStories(40, g ?? undefined);
      setStories(data);
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearched(false);
      setStories([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const data = await searchStories(text);
        setStories(data);
      } catch {
        setStories([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const handleGenre = (g: string) => {
    const next = genre === g ? null : g;
    setGenre(next);
    setQuery("");
    loadGenre(next);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Keşfet</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 16 }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Hikaye, yazar veya etiket ara..."
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(""); setSearched(false); setStories([]); }}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Genre pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreScroll}
      >
        <TouchableOpacity
          style={[styles.genreChip, genre === null && { backgroundColor: colors.primary }]}
          onPress={() => handleGenre(genre ?? "")}
        >
          <Text style={[styles.genreChipText, { color: genre === null ? "#fff" : colors.mutedForeground }]}>
            Tümü
          </Text>
        </TouchableOpacity>
        {GENRES.map((g) => (
          <TouchableOpacity
            key={g}
            style={[
              styles.genreChip,
              { borderColor: colors.border },
              genre === g && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => handleGenre(g)}
          >
            <Text style={[styles.genreChipText, { color: genre === g ? "#fff" : colors.mutedForeground }]}>
              {g}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Feather name="compass" size={44} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Bir tür seç veya arama yap
          </Text>
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.center}>
          <Feather name="search" size={40} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Sonuç bulunamadı</Text>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => <StoryGridCard story={item} />}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  genreScroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
  },
  genreChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  grid: { paddingHorizontal: 16, paddingTop: 4 },
  row: { gap: 12, marginBottom: 12 },
  gridCard: { width: CARD_W, borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  gridCover: { width: "100%", height: 140, alignItems: "center", justifyContent: "center" },
  gridGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },
  gridBody: { padding: 10, gap: 4 },
  genrePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 2 },
  genrePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  gridTitle: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  gridAuthor: { fontSize: 11, fontFamily: "Inter_400Regular" },
  gridStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  gridStatText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
