import React, { useCallback, useEffect, useState, useRef } from "react";
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
import { WeeklyLeaderboard } from "@/components/WeeklyLeaderboard";
import { getPublishedStories, searchStories, GENRES, Story } from "@/lib/firestore-service";
import { useLocale } from "@/contexts/LocaleContext";
import { translateGenre } from "@workspace/spektrum-i18n";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 48) / 2;

// Tür → renk ve ikon eşleştirmesi
const GENRE_META: Record<string, { icon: string; color: string; bg: string }> = {
  "Fantastik":   { icon: "zap",        color: "#A07FE6", bg: "#A07FE622" },
  "Romantik":    { icon: "heart",       color: "#f472b6", bg: "#ec489922" },
  "Gizem":       { icon: "eye",         color: "#E6A545", bg: "#E6A54522" },
  "Korku":       { icon: "alert-circle",color: "#f87171", bg: "#ef444422" },
  "Bilim Kurgu": { icon: "cpu",         color: "#60a5fa", bg: "#3b82f622" },
  "Macera":      { icon: "anchor",      color: "#fbbf24", bg: "#f59e0b22" },
  "Dram":        { icon: "film",        color: "#34d399", bg: "#10b98122" },
  "Psikolojik":  { icon: "activity",    color: "#e879f9", bg: "#d946ef22" },
  "Tarihi":      { icon: "bookmark",    color: "#fb923c", bg: "#f9731622" },
  "Gençlik":     { icon: "star",        color: "#a3e635", bg: "#84cc1622" },
  "Gerilim":     { icon: "wind",        color: "#facc15", bg: "#eab30822" },
  "Komedi":      { icon: "smile",       color: "#4ade80", bg: "#22c55e22" },
  "Şiir":        { icon: "feather",     color: "#38bdf8", bg: "#0ea5e922" },
  "Deneme":      { icon: "edit-3",      color: "#94a3b8", bg: "#64748b22" },
};

function StoryGridCard({ story }: { story: Story }) {
  const colors = useColors();
  const { locale } = useLocale();
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
            {translateGenre(locale, story.genre)}
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
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [contentLanguage, setContentLanguage] = useState<"tr" | "en" | "all">(locale);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadByGenre = useCallback(async (g: string | null) => {
    setLoading(true);
    setSearched(true);
    try {
      const data = await getPublishedStories(40, g ?? undefined, contentLanguage);
      setStories(data);
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [contentLanguage]);

  useEffect(() => {
    if (languageTouched) return;
    setContentLanguage(locale);
    if (!searched) return;
    setLoading(true);
    const request = query.trim()
      ? searchStories(query).then(data => data.filter(story => (story.contentLanguage ?? "tr") === locale))
      : getPublishedStories(40, genre ?? undefined, locale);
    request.then(setStories).catch(() => setStories([])).finally(() => setLoading(false));
  }, [locale]);

  const changeContentLanguage = (language: "tr" | "en" | "all") => {
    setLanguageTouched(true);
    setContentLanguage(language);
    if (!searched) return;
    setLoading(true);
    const request = query.trim()
      ? searchStories(query).then(data => data.filter(story => language === "all" || (story.contentLanguage ?? "tr") === language))
      : getPublishedStories(40, genre ?? undefined, language);
    request.then(setStories).catch(() => setStories([])).finally(() => setLoading(false));
  };

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
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
        setStories(data.filter(story => contentLanguage === "all" || (story.contentLanguage ?? "tr") === contentLanguage));
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
      ? searchStories(query).then(data => data.filter(story => contentLanguage === "all" || (story.contentLanguage ?? "tr") === contentLanguage))
      : getPublishedStories(40, genre ?? undefined, contentLanguage);
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

  const numGenreCols = 3;
  const genreCardSize = (SCREEN_W - 32 - (numGenreCols - 1) * 10) / numGenreCols;

  const allGenreItems = [
    { key: "all", label: "Tümü", icon: "grid", color: colors.primary, bg: colors.primary + "22" },
    ...GENRES.map(g => {
      const meta = GENRE_META[g] ?? { icon: "book", color: colors.primary, bg: colors.primary + "22" };
      return { key: g, label: g, icon: meta.icon, color: meta.color, bg: meta.bg };
    }),
  ] as const;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("Keşfet")}</Text>
        <View style={styles.headerRight}>
          {genre && (
            <TouchableOpacity onPress={clearFilter} style={[styles.clearBtn, { borderColor: colors.primary + "60" }]}>
              <Text style={[styles.clearBtnText, { color: colors.primary }]}>Temizle</Text>
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
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 16, marginBottom: 12 }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={t("Hikaye, yazar veya etiket ara...")}
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

      <View style={styles.languageFilters} accessibilityLabel={t("Yayın dili")}>
        {(["tr", "en", "all"] as const).map(language => (
          <TouchableOpacity
            key={language}
            onPress={() => changeContentLanguage(language)}
            accessibilityRole="button"
            accessibilityState={{ selected: contentLanguage === language }}
            style={[
              styles.languageFilter,
              {
                borderColor: contentLanguage === language ? colors.primary : colors.border,
                backgroundColor: contentLanguage === language ? colors.primary + "22" : colors.card,
              },
            ]}
            testID={`filter-language-${language}`}
          >
            <Text style={{ color: contentLanguage === language ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
              {t(language === "tr" ? "Türkçe içerik" : language === "en" ? "İngilizce içerik" : "Tüm diller")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <WeeklyLeaderboard />

      {/* Tür grid'i — kareler */}
      <View style={styles.genreSection}>
        <Text style={[styles.genreSectionTitle, { color: colors.foreground }]}>{t("Türlere Göz At")}</Text>
        <View style={styles.genreGrid}>
          {allGenreItems.map((item) => {
            const isSelected = item.key === "all" ? genre === null && searched : genre === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.genreSquare,
                  {
                    width: genreCardSize,
                    height: genreCardSize,
                    backgroundColor: isSelected ? item.bg : colors.card,
                    borderColor: isSelected ? item.color : colors.border,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
                onPress={() => handleGenre(item.key === "all" ? null : item.key)}
                activeOpacity={0.75}
              >
                <Feather
                  name={item.icon as React.ComponentProps<typeof Feather>["name"]}
                  size={22}
                  color={isSelected ? item.color : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.genreSquareText,
                    { color: isSelected ? item.color : colors.mutedForeground },
                  ]}
                  numberOfLines={2}
                >
                  {item.key === "all" ? t(item.label) : translateGenre(locale, item.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Sonuçlar */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Feather name="compass" size={44} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("Hikayeleri Keşfet")}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("Bir tür seç veya arama yap")}
          </Text>
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.center}>
          <Feather name="search" size={40} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("Sonuç Bulunamadı")}</Text>
          {genre ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                "{translateGenre(locale, genre)}" {t("türünde henüz hikaye yok.")}
              </Text>
              <TouchableOpacity style={[styles.clearBtnLarge, { borderColor: colors.primary }]} onPress={clearFilter}>
                <Text style={[styles.clearBtnLargeText, { color: colors.primary }]}>{t("Filtreyi Temizle")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t("Farklı bir arama terimi dene.")}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.grid}>
          <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
            {stories.length} {t("hikaye bulundu")}
          </Text>
          <View style={styles.storiesGrid}>
            {stories.map((item) => (
              <StoryGridCard key={item.id} story={item} />
            ))}
          </View>
        </View>
      )}

      <View style={{ height: insets.bottom + 100 }} />
    </ScrollView>
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
  languageFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  languageFilter: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  genreSection: { paddingHorizontal: 16, marginBottom: 16 },
  genreSectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 12 },
  genreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  genreSquare: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 8,
  },
  genreSquareText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  center: { alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  clearBtnLarge: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1,
  },
  clearBtnLargeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  grid: { paddingHorizontal: 16 },
  resultCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  storiesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridCard: { width: CARD_W, borderRadius: 14, overflow: "hidden", borderWidth: 1, marginBottom: 0 },
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
