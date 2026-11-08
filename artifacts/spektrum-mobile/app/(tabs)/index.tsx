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
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getTrendingStories, getPublishedStories, GENRES, Story } from "@/lib/firestore-service";
import MobileStatusBar from "@/components/MobileStatusBar";
import { useLocale } from "@/contexts/LocaleContext";
import { translateGenre } from "@workspace/spektrum-i18n";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 48) / 2;
const HERO_GRADIENT = ["#f8f7ff", "#ede9fe", "#e0f2fe"] as const;

/* ── Hero Section — Web sitesindeki gibi —──────────────────────────── */
function HeroSection() {
  const colors = useColors();
  const { t } = useLocale();
  return (
    <LinearGradient colors={HERO_GRADIENT} style={styles.hero}>
      <View style={[styles.heroBadge, { backgroundColor: "rgba(255,255,255,0.9)", borderColor: "#e5e7eb" }]}>
        <View style={[styles.pulseDot, { backgroundColor: "#22c55e" }]} />
        <Text style={[styles.heroBadgeText, { color: "#6b7280" }]}>
          {t("TÜRKÇE YAZARLIK PLATFORMU")}
        </Text>
      </View>

      <Text style={[styles.heroTitle, { color: "#14141A" }]}>
        {t("Hikayeler")}{" "}
        <Text style={{ color: colors.primary }}>{t("Burada Yaşar")}</Text>
      </Text>

      <Text style={[styles.heroSubtitle, { color: "#6b7280" }]}>
        {t("Spektrum; satır aralarında kaybolabileceğin, düşüncelerini her paragrafta paylaşabileceğin ve yeni yetenekleri keşfedebileceğin temiz bir kütüphane.")}
      </Text>

      <View style={styles.heroButtons}>
        <TouchableOpacity
          style={[styles.heroBtnPrimary, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(tabs)/discover")}
          activeOpacity={0.85}
        >
          <Text style={[styles.heroBtnPrimaryText, { color: colors.primaryForeground }]}>
            {t("Keşfetmeye Başla")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.heroBtnSecondary, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)" }]}
          onPress={() => router.push("/(tabs)/write")}
          activeOpacity={0.85}
        >
          <Text style={[styles.heroBtnSecondaryText, { color: colors.foreground }]}>
            {t("Hikayeni Yaz")}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

/* ── Trend Kartı — Web sitesindeki gibi grid —───────────────────────── */
function TrendCard({ story, rank }: { story: Story; rank: number }) {
  const colors = useColors();
  const { locale, t } = useLocale();
  return (
    <TouchableOpacity
      style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/story/[id]", params: { id: story.id } })}
      activeOpacity={0.85}
    >
      <View style={styles.trendCardTop}>
        <View style={[styles.genreBadge, { backgroundColor: colors.secondary + "15", borderColor: colors.secondary + "30" }]}>
          <Text style={[styles.genreBadgeText, { color: colors.secondary }]}>{translateGenre(locale, story.genre)}</Text>
        </View>
        <Text style={[styles.rankNum, { color: colors.primary + "30" }]}>#{rank}</Text>
      </View>

      <Text style={[styles.trendTitle, { color: colors.foreground }]} numberOfLines={2}>
        {story.title}
      </Text>

      <Text style={[styles.trendAuthor, { color: colors.mutedForeground }]}>
        {t("Yazar: ")}<Text style={{ color: colors.foreground }}>{story.authorName}</Text>
      </Text>

      <View style={styles.trendStats}>
        <View style={styles.stat}>
          <Feather name="message-square" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {story.commentCount ?? 0}
          </Text>
        </View>
        <View style={styles.stat}>
          <Feather name="trending-up" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {Math.round((story as any).engagementScore ?? story.likeCount ?? 0)}{t(" Puan")}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Yeni Eklenen Kartı — Web sitesindeki gibi —───────────────────── */
function NewCard({ story }: { story: Story }) {
  const colors = useColors();
  const { locale } = useLocale();
  return (
    <TouchableOpacity
      style={[styles.newCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/story/[id]", params: { id: story.id } })}
      activeOpacity={0.85}
    >
      {story.coverUrl ? (
        <Image source={{ uri: story.coverUrl }} style={styles.newCover} resizeMode="cover" />
      ) : (
        <View style={[styles.newCover, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
          <Text style={[styles.newCoverInitial, { color: colors.mutedForeground + "40" }]}>
            {story.title.charAt(0)}
          </Text>
        </View>
      )}

      <View style={styles.newCardBody}>
        <View style={styles.newCardTop}>
          <View style={[styles.genreBadgeSmall, { backgroundColor: colors.secondary + "15" }]}>
            <Text style={[styles.genreBadgeTextSmall, { color: colors.secondary }]}>{translateGenre(locale, story.genre)}</Text>
          </View>
        </View>
        <Text style={[styles.newTitle, { color: colors.foreground }]} numberOfLines={2}>
          {story.title}
        </Text>
        <Text style={[styles.newAuthor, { color: colors.mutedForeground }]}>
          {story.authorName}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* ── Ana Sayfa — Web sitesindeki gibi —────────────────────────────── */
export default function HomeScreen() {
  const colors = useColors();
  const { t, locale } = useLocale();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [trending, setTrending] = useState<Story[]>([]);
  const [discover, setDiscover] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tData, dData] = await Promise.all([
        getTrendingStories(6),
        getPublishedStories(6),
      ]);
      setTrending(tData as any);
      setDiscover(dData.slice(0, 6));
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || "Bilinmeyen hata";
      console.error("[Home load error]", msg, err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.logo, { color: colors.primary }]}>SPEKTRUM</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.logo, { color: colors.primary }]}>SPEKTRUM</Text>
        </View>
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("Yüklenemedi")}</Text>
          <TouchableOpacity style={[styles.retryBtn, { borderColor: colors.primary }]} onPress={load}>
            <Text style={[styles.retryText, { color: colors.primary }]}>{t("Tekrar Dene")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* 24 saatlik kullanıcı durumları — ana sayfanın en üstünde */}
        <MobileStatusBar />

        {/* Hero */}
        <HeroSection />

        {/* Trend Olanlar */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="trending-up" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("Trend Olanlar")}</Text>
          </View>

          {trending.length === 0 ? (
            <View style={styles.emptySection}>
              <Feather name="trending-up" size={32} color={colors.mutedForeground + "30"} />
              <Text style={[styles.emptySectionText, { color: colors.mutedForeground }]}>
                {t("Henüz trend hikaye yok")}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {trending.map((story, i) => (
                <TrendCard key={story.id} story={story} rank={i + 1} />
              ))}
            </View>
          )}
        </View>

        {/* Kategoriler */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>
            {t("Kategoriler")}
          </Text>
          <View style={styles.genreWrap}>
            {GENRES.map((genre) => (
              <TouchableOpacity
                key={genre}
                style={[styles.genreChip, { borderColor: colors.border }]}
                onPress={() => router.push({ pathname: "/(tabs)/discover", params: { genre } })}
                activeOpacity={0.7}
              >
                <Text style={[styles.genreChipText, { color: colors.foreground }]}>{translateGenre(locale, genre)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Yeni Eklenenler */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="clock" size={20} color={colors.secondary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("Yeni Eklenenler")}</Text>
          </View>

          {discover.length === 0 ? (
            <View style={styles.emptySection}>
              <Feather name="book-open" size={32} color={colors.mutedForeground + "30"} />
              <Text style={[styles.emptySectionText, { color: colors.mutedForeground }]}>
                {t("Henüz yayınlanmış hikaye yok")}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {discover.map((story) => (
                <NewCard key={story.id} story={story} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Styles — Web sitesindeki gibi —────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  logo: { fontSize: 20, fontWeight: "800", letterSpacing: 3, fontFamily: "Inter_700Bold" },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  /* Hero */
  hero: {
    margin: 16,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 16,
    overflow: "hidden",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pulseDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 8,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  heroBtnPrimary: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  heroBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  heroBtnSecondary: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
  },
  heroBtnSecondaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  /* Section */
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },

  /* Grid */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  /* Trend Card */
  trendCard: {
    width: CARD_W,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  trendCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  genreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  genreBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  rankNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  trendTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
    minHeight: 40,
  },
  trendAuthor: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  trendStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },

  /* New Card */
  newCard: {
    width: CARD_W,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  newCover: {
    width: CARD_W,
    height: 140,
  },
  newCoverInitial: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
  },
  newCardBody: {
    padding: 12,
    gap: 4,
  },
  newCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  genreBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  genreBadgeTextSmall: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
  },
  newTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
    minHeight: 36,
  },
  newAuthor: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  /* Genres */
  genreWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  genreChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  /* Stats */
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  /* Empty */
  emptySection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptySectionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  /* Retry */
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
