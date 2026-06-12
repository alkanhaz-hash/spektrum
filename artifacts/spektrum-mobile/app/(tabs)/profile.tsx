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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { logoutUser, updateUserProfile, UserProfile } from "@/lib/auth-service";
import { getStoriesByAuthor, getFollowers, getFollowing, Story } from "@/lib/firestore-service";
import { uploadUserAvatar, uploadUserCover } from "@/lib/storage-service";

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
  sheet: {
    maxHeight: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empty: { textAlign: "center", padding: 32, fontSize: 14, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userBio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});

// ─── PROFİL DÜZENLEME MODAL ───────────────────────────────────────────────────

function EditProfileModal({
  profile,
  onSave,
  onClose,
}: {
  profile: UserProfile;
  onSave: (updated: Partial<UserProfile>) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUri, setAvatarUri] = useState(profile.avatarUrl ?? "");
  const [coverUri, setCoverUri] = useState(profile.coverUrl ?? "");
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [coverChanged, setCoverChanged] = useState(false);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setAvatarChanged(true);
    }
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
      setCoverChanged(true);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (!name) {
      Alert.alert("Hata", "Kullanıcı adı boş olamaz.");
      return;
    }
    setSaving(true);
    try {
      let finalAvatarUrl = profile.avatarUrl ?? "";
      let finalCoverUrl = profile.coverUrl ?? "";
      if (avatarChanged && avatarUri) {
        finalAvatarUrl = await uploadUserAvatar(user.uid, avatarUri);
      }
      if (coverChanged && coverUri) {
        finalCoverUrl = await uploadUserCover(user.uid, coverUri);
      }
      const patch = {
        displayName: name,
        bio: bio.trim(),
        avatarUrl: finalAvatarUrl,
        coverUrl: finalCoverUrl,
      };
      await updateUserProfile(user.uid, patch);
      onSave(patch);
      onClose();
    } catch {
      Alert.alert("Hata", "Profil kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={epm.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[epm.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={[epm.header, { borderColor: colors.border }]}>
              <Text style={[epm.title, { color: colors.foreground }]}>Profili Düzenle</Text>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={epm.body} showsVerticalScrollIndicator={false}>
              <Text style={[epm.label, { color: colors.mutedForeground }]}>Kapak Fotoğrafı</Text>
              <TouchableOpacity onPress={pickCover} style={epm.coverBox}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={["#1a0a2e", "#0a1428"]} style={StyleSheet.absoluteFill} />
                )}
                <View style={epm.photoOverlay}>
                  <Feather name="camera" size={18} color="#fff" />
                  <Text style={epm.photoOverlayText}>Değiştir</Text>
                </View>
              </TouchableOpacity>

              <Text style={[epm.label, { color: colors.mutedForeground }]}>Profil Fotoğrafı</Text>
              <TouchableOpacity onPress={pickAvatar} style={epm.avatarRow}>
                <View style={[epm.avatarBox, { borderColor: colors.border }]}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={[epm.avatarInitial, { color: colors.primary }]}>
                      {displayName.charAt(0).toUpperCase() || "?"}
                    </Text>
                  )}
                  <View style={epm.avatarCamOverlay}>
                    <Feather name="camera" size={13} color="#fff" />
                  </View>
                </View>
                <Text style={[epm.avatarHint, { color: colors.primary }]}>Fotoğraf Seç</Text>
              </TouchableOpacity>

              <Text style={[epm.label, { color: colors.mutedForeground }]}>Kullanıcı Adı</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={40}
                style={[epm.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[epm.label, { color: colors.mutedForeground }]}>Hakkında</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={3}
                maxLength={300}
                placeholder="Kendinden biraz bahset..."
                placeholderTextColor={colors.mutedForeground}
                style={[epm.input, epm.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            </ScrollView>

            <View style={epm.footer}>
              <TouchableOpacity style={[epm.btn, epm.btnOutline, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[epm.btnText, { color: colors.foreground }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[epm.btn, epm.btnPrimary, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[epm.btnText, { color: "#fff" }]}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const epm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000080" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  body: { padding: 16, gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4, marginTop: 10 },
  coverBox: { height: 110, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  photoOverlayText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  avatarBox: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#1a0a2e" },
  avatarInitial: { fontSize: 26, fontFamily: "Inter_700Bold" },
  avatarCamOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#00000099", alignItems: "center", paddingVertical: 3 },
  avatarHint: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnOutline: { borderWidth: 1 },
  btnPrimary: {},
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ─── GİRİŞ YAP İSTEĞİ ────────────────────────────────────────────────────────

function LoginPrompt() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[lp.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <LinearGradient colors={["#7c3aed22", "#06b6d422", colors.background]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      <Feather name="user" size={64} color={colors.mutedForeground + "60"} />
      <Text style={[lp.title, { color: colors.foreground }]}>Profilini Oluştur</Text>
      <Text style={[lp.sub, { color: colors.mutedForeground }]}>
        Hikayelerini paylaş, yazarları takip et ve topluluğa katıl.
      </Text>
      <TouchableOpacity style={[lp.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")}>
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

// ─── ANA EKRAN ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile: authProfile, loading: authLoading, refreshProfile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setLocalProfile(authProfile);
  }, [authProfile]);

  const profile = localProfile ?? authProfile;

  const loadStories = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getStoriesByAuthor(user.uid);
      setStories(data);
    } catch {
      /* sessiz */
    } finally {
      setStoriesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadStories();
    else setStoriesLoading(false);
  }, [user, loadStories]);

  const handleLogout = () => {
    Alert.alert("Çıkış Yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "İptal", style: "cancel" },
      { text: "Çıkış Yap", style: "destructive", onPress: async () => { try { await logoutUser(); } catch { /* sessiz */ } } },
    ]);
  };

  const handleProfileSave = async (updated: Partial<UserProfile>) => {
    setLocalProfile((prev) => (prev ? { ...prev, ...updated } : prev));
    await refreshProfile();
  };

  if (authLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user || !profile) return <LoginPrompt />;

  const badges = getBadges(profile);

  return (
    <>
      {followModal && (
        <FollowListModal uid={user.uid} type={followModal} onClose={() => setFollowModal(null)} />
      )}
      {editOpen && (
        <EditProfileModal profile={profile} onSave={handleProfileSave} onClose={() => setEditOpen(false)} />
      )}

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Kapak */}
        <View>
          {profile.coverUrl ? (
            <Image source={{ uri: profile.coverUrl }} style={[s.cover, { width: "100%" }]} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#1a0a2e", "#0a1428"]} style={s.cover} />
          )}
          <LinearGradient colors={["transparent", colors.background]} style={s.coverFade} />
          <View style={[s.avatarWrap, { paddingTop: insets.top + 8 }]}>
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

          {/* İstatistikler — takipçi/takip tıklanabilir */}
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
            <TouchableOpacity style={[s.actionBtn, { borderColor: colors.border }]} onPress={() => setEditOpen(true)}>
              <Feather name="edit-2" size={15} color={colors.foreground} />
              <Text style={[s.actionBtnText, { color: colors.foreground }]}>Profil Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, { borderColor: colors.border }]} onPress={handleLogout}>
              <Feather name="log-out" size={18} color={colors.destructive} />
            </TouchableOpacity>
          </View>

          {/* Menü */}
          <View style={[s.menuSection, { borderColor: colors.border }]}>
            <TouchableOpacity
              style={[s.menuRow, { borderColor: colors.border }]}
              onPress={() => router.push("/jetonlar")}
            >
              <View style={[s.menuIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Text style={s.menuEmoji}>⚡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuLabel, { color: colors.foreground }]}>Jetonlarım</Text>
                <Text style={[s.menuSub, { color: colors.mutedForeground }]}>
                  Bakiye · Paketler · İşlem Geçmişi
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {(profile.role === "moderator" || profile.role === "admin") && (
              <TouchableOpacity
                style={[s.menuRow, { borderColor: colors.border }]}
                onPress={() => router.push("/moderator")}
              >
                <View style={[s.menuIconWrap, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="shield" size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuLabel, { color: colors.foreground }]}>Moderatör Paneli</Text>
                  <Text style={[s.menuSub, { color: colors.mutedForeground }]}>
                    İnceleme · Şikayetler · Yönetim
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.menuRow, { borderColor: colors.border }]}
              onPress={() => router.push("/kvkk")}
            >
              <View style={[s.menuIconWrap, { backgroundColor: "#22c55e18" }]}>
                <Feather name="lock" size={17} color="#22c55e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuLabel, { color: colors.foreground }]}>KVKK Aydınlatma Metni</Text>
                <Text style={[s.menuSub, { color: colors.mutedForeground }]}>Kişisel verilerin korunması</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.menuRow, { borderColor: "transparent" }]}
              onPress={() => router.push("/terms")}
            >
              <View style={[s.menuIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="file-text" size={17} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuLabel, { color: colors.foreground }]}>Kullanıcı Sözleşmesi</Text>
                <Text style={[s.menuSub, { color: colors.mutedForeground }]}>Kullanım koşulları ve kurallar</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hikayelerim */}
        <View style={s.storiesSection}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Hikayelerim</Text>
          {storiesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : stories.length === 0 ? (
            <View style={s.emptyStories}>
              <Feather name="feather" size={32} color={colors.mutedForeground + "60"} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Henüz hikaye yok</Text>
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
                  {st.status !== "published" && (
                    <View style={[s.statusBadge, { backgroundColor: st.status === "draft" ? colors.mutedForeground + "22" : colors.primary + "22" }]}>
                      <Text style={[s.statusBadgeText, { color: st.status === "draft" ? colors.mutedForeground : colors.primary }]}>
                        {st.status === "draft" ? "Taslak" : st.status === "completed" ? "Tamamlandı" : st.status}
                      </Text>
                    </View>
                  )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { height: 180 },
  coverFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  avatarWrap: { position: "absolute", left: 16, bottom: -40 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold" },
  info: { paddingHorizontal: 16, paddingTop: 52, gap: 8 },
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
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  iconBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  storiesSection: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  emptyStories: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  storyItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  storyThumb: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  storyItemInfo: { flex: 1, gap: 3 },
  storyItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  storyItemMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  destructive: { color: "#ef4444" },
  menuSection: { borderWidth: 1, borderRadius: 16, overflow: "hidden", marginTop: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuEmoji: { fontSize: 18 },
  menuLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  menuSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
});
