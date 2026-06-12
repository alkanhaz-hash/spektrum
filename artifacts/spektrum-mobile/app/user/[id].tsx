import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, UserProfile } from "@/lib/auth-service";
import {
  getStoriesByAuthor,
  isFollowing,
  followUser,
  unfollowUser,
  getOrCreateConversation,
  getFollowers,
  getFollowing,
  createNotification,
  blockUser,
  unblockUser,
  isUserBlocked,
  Story,
} from "@/lib/firestore-service";

// ─── ROZET SİSTEMİ ───────────────────────────────────────────────────────────

const BADGE_DEFS = [
  { id: "author", emoji: "✍️", label: "Hikayeci", condition: (p: UserProfile) => (p.storyCount ?? 0) >= 1 },
  { id: "ink_master", emoji: "🖋️", label: "Mürekkep Ustası", condition: (p: UserProfile) => (p.storyCount ?? 0) >= 5 },
  { id: "bookworm", emoji: "📚", label: "Kitap Kurdu", condition: (p: UserProfile) => (p.readCount ?? 0) >= 10 },
  { id: "rising", emoji: "🌱", label: "Yükselen", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 50 },
  { id: "shining", emoji: "💫", label: "Parlayan", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 200 },
  { id: "popular", emoji: "🔥", label: "Popüler", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 1000 },
  { id: "celebrated", emoji: "⭐", label: "Ünlü", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 5000 },
  { id: "icon", emoji: "💎", label: "İkon", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 10000 },
  { id: "elite", emoji: "👑", label: "Elit", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 50000 },
  { id: "legend", emoji: "🏆", label: "Efsane", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 100000 },
];

function getBadges(p: UserProfile) {
  return BADGE_DEFS.filter((b) => b.condition(p));
}

// ─── TAKİP LİSTESİ MODAL ─────────────────────────────────────────────────────

function FollowListModal({
  uid,
  type,
  onClose,
}: {
  uid: string;
  type: "followers" | "following";
  onClose: () => void;
}) {
  const colors = useColors();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = type === "followers" ? getFollowers : getFollowing;
    fn(uid)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [uid, type]);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={flm.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[flm.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[flm.header, { borderColor: colors.border }]}>
            <Text style={[flm.title, { color: colors.foreground }]}>
              {type === "followers" ? "Takipçiler" : "Takip Edilenler"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 32 }} />
          ) : users.length === 0 ? (
            <Text style={[flm.empty, { color: colors.mutedForeground }]}>
              {type === "followers" ? "Henüz takipçi yok." : "Henüz kimse takip edilmiyor."}
            </Text>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.uid}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={flm.userRow}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: "/user/[id]", params: { id: u.uid } });
                  }}
                >
                  {u.avatarUrl ? (
                    <Image source={{ uri: u.avatarUrl }} style={[flm.avatar, { borderColor: colors.border }]} />
                  ) : (
                    <View style={[flm.avatar, flm.avatarFallback, { backgroundColor: colors.primary + "33", borderColor: colors.border }]}>
                      <Text style={[flm.avatarInitial, { color: colors.primary }]}>
                        {u.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[flm.userName, { color: colors.foreground }]}>{u.displayName}</Text>
                    {!!u.bio && (
                      <Text style={[flm.userBio, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {u.bio}
                      </Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const flm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000080" },
  sheet: { maxHeight: "70%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empty: { textAlign: "center", padding: 32, fontSize: 14, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userBio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});

// ─── ANA EKRAN ────────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile: myProfile } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const isOwn = user?.uid === id;

  useEffect(() => {
    if (!id) return;
    if (isOwn) {
      router.replace("/(tabs)/profile");
      return;
    }
    const load = async () => {
      try {
        const [p, s] = await Promise.all([
          getUserProfile(id),
          getStoriesByAuthor(id, true),
        ]);
        setProfile(p);
        setStories(s);
        if (user) {
          const [f, bl] = await Promise.all([
            isFollowing(user.uid, id),
            isUserBlocked(user.uid, id),
          ]);
          setFollowing(f);
          setBlocked(bl);
        }
      } catch {
        /* sessiz */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, user, isOwn]);

  const handleFollow = async () => {
    if (!user) { router.push("/auth"); return; }
    if (!id || !profile) return;
    setFollowLoading(true);
    try {
      if (following) {
        await unfollowUser(user.uid, id);
        setFollowing(false);
        setProfile((p) => p ? { ...p, followerCount: Math.max(0, (p.followerCount ?? 1) - 1) } : p);
      } else {
        await followUser(user.uid, id);
        setFollowing(true);
        setProfile((p) => p ? { ...p, followerCount: (p.followerCount ?? 0) + 1 } : p);
        if (myProfile) {
          createNotification({
            recipientId: id,
            senderId: user.uid,
            senderName: myProfile.displayName,
            senderAvatar: myProfile.avatarUrl ?? "",
            type: "follow",
          }).catch(() => {});
        }
      }
    } catch {
      Alert.alert("Hata", "İşlem başarısız oldu.");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!user || !id) return;
    Alert.alert(
      blocked ? "Engeli Kaldır" : "Kullanıcıyı Engelle",
      blocked
        ? `${profile?.displayName ?? "Bu kullanıcı"} artık sana mesaj gönderebilir ve içeriklerini görebilirsin.`
        : `${profile?.displayName ?? "Bu kullanıcı"} sana mesaj gönderemez ve içeriklerin bu kullanıcıdan gizlenir.`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: blocked ? "Engeli Kaldır" : "Engelle",
          style: blocked ? "default" : "destructive",
          onPress: async () => {
            setBlockLoading(true);
            try {
              if (blocked) {
                await unblockUser(user.uid, id);
                setBlocked(false);
              } else {
                await blockUser(user.uid, id);
                setBlocked(true);
              }
            } catch {
              Alert.alert("Hata", "İşlem başarısız oldu.");
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMessage = async () => {
    if (!user || !myProfile || !profile || !id) return;
    setMessaging(true);
    try {
      const convId = await getOrCreateConversation(
        user.uid,
        id,
        { [user.uid]: myProfile.displayName, [id]: profile.displayName },
        { [user.uid]: myProfile.avatarUrl ?? "", [id]: profile.avatarUrl ?? "" }
      );
      router.push({ pathname: "/chat/[id]", params: { id: convId } });
    } catch {
      Alert.alert("Hata", "Konuşma başlatılamadı.");
    } finally {
      setMessaging(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Feather name="user-x" size={48} color={colors.mutedForeground + "60"} />
        <Text style={[s.notFoundText, { color: colors.mutedForeground }]}>Kullanıcı bulunamadı</Text>
        <TouchableOpacity style={[s.backBtn, { borderColor: colors.border }]} onPress={() => router.back()}>
          <Text style={[s.backBtnText, { color: colors.foreground }]}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badges = getBadges(profile);

  return (
    <>
      {followModal && (
        <FollowListModal uid={id!} type={followModal} onClose={() => setFollowModal(null)} />
      )}

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Geri butonu */}
        <View style={[s.backRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={[s.backCircle, { backgroundColor: colors.background + "cc", borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Kapak */}
        <View style={s.coverContainer}>
          {profile.coverUrl ? (
            <Image source={{ uri: profile.coverUrl }} style={[s.cover, { width: "100%" }]} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#1a0a2e", "#0a1428"]} style={s.cover} />
          )}
          <LinearGradient colors={["transparent", colors.background]} style={s.coverFade} />
          <View style={s.avatarWrap}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={[s.avatar, { borderColor: colors.background }]} />
            ) : (
              <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.primary + "33", borderColor: colors.background }]}>
                <Text style={[s.avatarInitial, { color: colors.primary }]}>
                  {profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bilgi */}
        <View style={s.info}>
          {/* Ban banner */}
          {profile.banned && (
            <View style={[s.banBanner, { borderColor: "#ef444455", backgroundColor: "#ef444411" }]}>
              <Feather name="slash" size={16} color="#ef4444" />
              <View style={{ flex: 1 }}>
                <Text style={s.banTitle}>Bu hesap askıya alınmıştır</Text>
                {!!profile.banReason && (
                  <Text style={s.banReason} numberOfLines={1}>Sebep: {profile.banReason}</Text>
                )}
              </View>
            </View>
          )}

          {/* Ad + Rol */}
          <View style={s.nameRow}>
            <Text style={[s.displayName, { color: colors.foreground }]}>{profile.displayName}</Text>
            {profile.role === "admin" && (
              <View style={[s.roleBadge, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b55" }]}>
                <Text style={[s.roleBadgeText, { color: "#f59e0b" }]}>👑 Admin</Text>
              </View>
            )}
            {profile.role === "moderator" && (
              <View style={[s.roleBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
                <Text style={[s.roleBadgeText, { color: colors.primary }]}>🛡️ Moderatör</Text>
              </View>
            )}
          </View>

          {!!profile.bio && <Text style={[s.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text>}

          {/* Rozetler */}
          {badges.length > 0 && (
            <View style={s.badgesRow}>
              {badges.map((b) => (
                <View key={b.id} style={[s.badge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
                  <Text style={s.badgeEmoji}>{b.emoji}</Text>
                  <Text style={[s.badgeLabel, { color: colors.primary }]}>{b.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* İstatistikler */}
          <View style={[s.statsRow, { borderColor: colors.border }]}>
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: colors.foreground }]}>{(profile.storyCount ?? 0).toLocaleString("tr")}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Hikaye</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={s.statItem} onPress={() => setFollowModal("followers")}>
              <Text style={[s.statValue, { color: colors.foreground }]}>{(profile.followerCount ?? 0).toLocaleString("tr")}</Text>
              <Text style={[s.statLabel, { color: colors.primary }]}>Takipçi</Text>
            </TouchableOpacity>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={s.statItem} onPress={() => setFollowModal("following")}>
              <Text style={[s.statValue, { color: colors.foreground }]}>{(profile.followingCount ?? 0).toLocaleString("tr")}</Text>
              <Text style={[s.statLabel, { color: colors.primary }]}>Takip</Text>
            </TouchableOpacity>
          </View>

          {/* Aksiyonlar */}
          <View style={s.actions}>
            <TouchableOpacity
              style={[
                s.followBtn,
                following
                  ? { borderColor: colors.border, backgroundColor: colors.card }
                  : { backgroundColor: colors.primary },
                followLoading && { opacity: 0.6 },
              ]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={following ? colors.foreground : "#fff"} />
              ) : (
                <Text style={[s.followBtnText, { color: following ? colors.foreground : "#fff" }]}>
                  {following ? "Takip Ediliyor" : "Takip Et"}
                </Text>
              )}
            </TouchableOpacity>

            {user && (
              <TouchableOpacity
                style={[s.msgBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={handleMessage}
                disabled={messaging}
              >
                {messaging ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <>
                    <Feather name="send" size={15} color={colors.foreground} />
                    <Text style={[s.msgBtnText, { color: colors.foreground }]}>Mesaj At</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {user && (
              <TouchableOpacity
                style={[
                  s.blockBtn,
                  blocked
                    ? { borderColor: "#f59e0b55", backgroundColor: "#f59e0b11" }
                    : { borderColor: "#ef444455", backgroundColor: "#ef444411" },
                  blockLoading && { opacity: 0.6 },
                ]}
                onPress={handleBlock}
                disabled={blockLoading}
              >
                {blockLoading ? (
                  <ActivityIndicator size="small" color={blocked ? "#f59e0b" : "#ef4444"} />
                ) : (
                  <Feather
                    name={blocked ? "shield-off" : "slash"}
                    size={18}
                    color={blocked ? "#f59e0b" : "#ef4444"}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Hikayeleri */}
        <View style={s.storiesSection}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Hikayeleri</Text>
          {stories.length === 0 ? (
            <View style={s.emptyStories}>
              <Feather name="book" size={32} color={colors.mutedForeground + "60"} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Yayınlanmış hikaye yok</Text>
            </View>
          ) : (
            stories.map((st) => (
              <TouchableOpacity
                key={st.id}
                style={[s.storyItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push({ pathname: "/story/[id]", params: { id: st.id } })}
                activeOpacity={0.8}
              >
                {st.coverUrl ? (
                  <Image source={{ uri: st.coverUrl }} style={s.storyThumb} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={["#1a0a2e", "#0a1a2e"]} style={s.storyThumb}>
                    <Feather name="book" size={18} color="#4a4a6a" />
                  </LinearGradient>
                )}
                <View style={s.storyItemInfo}>
                  <Text style={[s.storyItemTitle, { color: colors.foreground }]} numberOfLines={2}>{st.title}</Text>
                  <Text style={[s.storyItemMeta, { color: colors.mutedForeground }]}>
                    {st.genre} · {st.chapterCount ?? 0} bölüm · {(st.readCount ?? 0).toLocaleString("tr")} okuma
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  backBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  backRow: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 16 },
  backCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  coverContainer: { position: "relative" },
  cover: { height: 200 },
  coverFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  avatarWrap: { position: "absolute", left: 16, bottom: -40 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold" },
  info: { paddingHorizontal: 16, paddingTop: 52, gap: 8 },
  banBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  banTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
  banReason: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#ef444499", marginTop: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  badgeEmoji: { fontSize: 13 },
  badgeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: "hidden" },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 2 },
  statDivider: { width: 1 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  followBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  followBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  msgBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  msgBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  blockBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  storiesSection: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  emptyStories: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  storyItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  storyThumb: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  storyItemInfo: { flex: 1, gap: 3 },
  storyItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  storyItemMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
