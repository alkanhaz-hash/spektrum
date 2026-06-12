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
  RefreshControl,
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
        <LinearGradient
          colors={["#1a0a2e", "#0a1a2e"]}
          style={[styles.gridCover, { alignItems: "center", justifyContent: "center" }]}
        >
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
          <Feather name="heart" size={11} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
          <Text style={[styles.gridStatText, { color: colors.mutedForeground }]}>
            {story.likeCount ?? 0}
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
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadByGenre = useCallback(async (g: string | null) => {
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
      // Arama temizlendi: eğer tür seçiliyse onu yükle, yoksa boş durum
      if (genre) {
        loadByGenre(genre);
      } else {
        setSearched(false);
        setStories([]);
      }
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

  const handleGenre = (g: string | null) => {
    setQuery("");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (g === null || genre === g) {
      // "Tümü" veya aynı türe tekrar basıldı → tümünü yükle
      setGenre(null);
      loadByGenre(null);
    } else {
      setGenre(g);
      loadByGenre(g);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    const refreshPromise = query.trim()
      ? searchStories(query)
      : getPublishedStories(40, genre ?? undefined);
    refreshPromise
      .then(setStories)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const clearFilter = () => {
    setGenre(null);
    setQuery("");
    loadByGenre(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Keşfet</Text>
        <View style={styles.headerRight}>
          {genre && (
            <TouchableOpacity onPress={clearFilter} style={[styles.clearBtn, { borderColor: colors.primary + "60" }]}>
              <Text style={[styles.clearBtnText, { color: colors.primary }]}>Filtreyi Temizle</Text>
              <Feather name="x" size={13} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push("/search")}
            style={[styles.searchIconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="search" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Arama */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 16, marginBottom: 8 }]}>
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
          <TouchableOpacity onPress={() => handleSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tür filtreleri */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreScroll}
      >
        <TouchableOpacity
          style={[
            styles.genreChip,
            { borderColor: colors.border },
            genre === null && searched && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          onPress={() => handleGenre(null)}
        >
          <Text style={[
            styles.genreChipText,
            { color: genre === null && searched ? "#fff" : colors.mutedForeground },
          ]}>
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

      {/* Sonuçlar */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Feather name="compass" size={44} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Hikayeleri Keşfet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Bir tür seç veya arama yap
          </Text>
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.center}>
          <Feather name="search" size={40} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sonuç Bulunamadı</Text>
          {genre ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                "{genre}" türünde henüz hikaye yok.
              </Text>
              <TouchableOpacity
                style={[styles.clearBtnLarge, { borderColor: colors.primary }]}
                onPress={clearFilter}
              >
                <Text style={[styles.clearBtnLargeText, { color: colors.primary }]}>
                  Filtreyi Temizle
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Farklı bir arama terimi dene.
            </Text>
          )}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
              {stories.length} hikaye bulundu
            </Text>
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
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchIconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  clearBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1,
  },
  clearBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  genreScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  genreChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  genreChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  clearBtnLarge: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1,
  },
  clearBtnLargeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  grid: { paddingHorizontal: 16, paddingTop: 4 },
  row: { gap: 12, marginBottom: 12 },
  resultCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  gridCard: { width: CARD_W, borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  gridCover: { width: "100%", height: 140 },
  gridGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },
  gridBody: { padding: 10, gap: 4 },
  genrePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 2 },
  genrePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  gridTitle: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  gridAuthor: { fontSize: 11, fontFamily: "Inter_400Regular" },
  gridStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  gridStatText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
