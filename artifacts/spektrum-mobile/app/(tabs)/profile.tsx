import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { logoutUser } from "@/lib/auth-service";
import { getStoriesByAuthor, Story } from "@/lib/firestore-service";

function LoginPrompt() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[lp.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <LinearGradient
        colors={["#7c3aed22", "#06b6d422", colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Feather name="user" size={64} color={colors.mutedForeground + "60"} />
      <Text style={[lp.title, { color: colors.foreground }]}>Profilini Oluştur</Text>
      <Text style={[lp.sub, { color: colors.mutedForeground }]}>
        Hikayelerini paylaş, yazarları takip et ve topluluğa katıl.
      </Text>
      <TouchableOpacity
        style={[lp.btn, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/auth")}
      >
        <Text style={lp.btnText}>Giriş Yap / Kayıt Ol</Text>
      </TouchableOpacity>
    </View>
  );
}

const lp = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 22 },
  btn: { marginTop: 8, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, loading: authLoading } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);

  const loadStories = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getStoriesByAuthor(user.uid);
      setStories(data);
    } catch { /* sessiz */ }
    finally { setStoriesLoading(false); }
  }, [user]);

  useEffect(() => {
    if (user) loadStories();
    else setStoriesLoading(false);
  }, [user, loadStories]);

  const handleLogout = () => {
    Alert.alert("Çıkış Yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Çıkış Yap",
        style: "destructive",
        onPress: async () => {
          try { await logoutUser(); } catch { /* sessiz */ }
        },
      },
    ]);
  };

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user || !profile) return <LoginPrompt />;

  const stats = [
    { label: "Hikaye", value: profile.storyCount ?? 0 },
    { label: "Takipçi", value: profile.followerCount ?? 0 },
    { label: "Takip", value: profile.followingCount ?? 0 },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover / Header */}
      <View>
        {profile.coverUrl ? (
          <Image source={{ uri: profile.coverUrl }} style={[styles.cover, { width: "100%" }]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#1a0a2e", "#0a1428"]} style={styles.cover} />
        )}
        <LinearGradient
          colors={["transparent", colors.background]}
          style={styles.coverFade}
        />
        <View style={[styles.avatarWrap, { paddingTop: insets.top + 8 }]}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={[styles.avatar, { borderColor: colors.background }]} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary + "33", borderColor: colors.background }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                {profile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.displayName, { color: colors.foreground }]}>{profile.displayName}</Text>
        {!!profile.bio && (
          <Text style={[styles.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text>
        )}

        {/* Stats */}
        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {s.value.toLocaleString("tr")}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={() => Alert.alert("Yakında", "Profil düzenleme özelliği yakında gelecek.")}
          >
            <Feather name="edit-2" size={15} color={colors.foreground} />
            <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Profil Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: colors.border }]}
            onPress={handleLogout}
          >
            <Feather name="log-out" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      {/* My Stories */}
      <View style={styles.storiesSection}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hikayelerim</Text>
        {storiesLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : stories.length === 0 ? (
          <View style={styles.emptyStories}>
            <Feather name="feather" size={32} color={colors.mutedForeground + "60"} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Henüz hikaye yok
            </Text>
          </View>
        ) : (
          stories.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storyItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: "/story/[id]", params: { id: s.id } })}
              activeOpacity={0.8}
            >
              {s.coverUrl ? (
                <Image source={{ uri: s.coverUrl }} style={styles.storyThumb} resizeMode="cover" />
              ) : (
                <LinearGradient colors={["#1a0a2e", "#0a1a2e"]} style={styles.storyThumb}>
                  <Feather name="book" size={18} color="#4a4a6a" />
                </LinearGradient>
              )}
              <View style={styles.storyItemInfo}>
                <Text style={[styles.storyItemTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {s.title}
                </Text>
                <Text style={[styles.storyItemMeta, { color: colors.mutedForeground }]}>
                  {s.genre} · {s.chapterCount ?? 0} bölüm · {(s.readCount ?? 0).toLocaleString("tr")} okuma
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { height: 180 },
  coverFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  avatarWrap: { position: "absolute", left: 16, bottom: -40 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold" },
  info: { paddingHorizontal: 16, paddingTop: 52, gap: 8 },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  statsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 8,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  iconBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  storiesSection: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  emptyStories: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  storyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  storyThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  storyItemInfo: { flex: 1 },
  storyItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  storyItemMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
});
