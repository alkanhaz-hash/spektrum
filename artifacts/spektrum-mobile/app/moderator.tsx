import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPendingChapters,
  updateChapterStatus,
  getReports,
  resolveReport,
  banUser,
  unbanUser,
  searchUsersForMod,
  setUserRole,
  Chapter,
  Report,
  UserSummary,
} from "@/lib/firestore-service";

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

function SectionEmpty({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={emp.wrap}>
      <Text style={emp.icon}>{icon}</Text>
      <Text style={[emp.text, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}
const emp = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, gap: 10 },
  icon: { fontSize: 36 },
  text: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});

// ─── Bölüm İnceleme Sekmesi ───────────────────────────────────────────────────

function ReviewTab() {
  const colors = useColors();
  const [chapters, setChapters] = useState<(Chapter & { storyTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getPendingChapters()
      .then(setChapters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDecision = async (ch: Chapter, approve: boolean) => {
    setProcessing(ch.id);
    try {
      await updateChapterStatus(ch.id, approve ? "published" : "rejected");
      setChapters(prev => prev.filter(c => c.id !== ch.id));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (chapters.length === 0) return <SectionEmpty icon="✅" text={"İnceleme bekleyen\nbölüm yok!"} />;

  return (
    <View style={{ gap: 12 }}>
      {chapters.map(ch => (
        <View key={ch.id} style={[rv.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ch.storyTitle && (
            <Text style={[rv.storyTitle, { color: colors.primary }]} numberOfLines={1}>📖 {ch.storyTitle}</Text>
          )}
          <Text style={[rv.chTitle, { color: colors.foreground }]} numberOfLines={2}>{ch.title}</Text>
          <Text style={[rv.preview, { color: colors.mutedForeground }]} numberOfLines={3}>
            {ch.content?.slice(0, 180)}…
          </Text>
          {ch.wordCount != null && (
            <Text style={[rv.meta, { color: colors.mutedForeground }]}>{ch.wordCount.toLocaleString("tr")} kelime</Text>
          )}
          <View style={rv.btns}>
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
              onPress={() => handleDecision(ch, false)}
              disabled={processing === ch.id}
            >
              {processing === ch.id
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <><Feather name="x-circle" size={15} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Reddet</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11" }]}
              onPress={() => handleDecision(ch, true)}
              disabled={processing === ch.id}
            >
              {processing === ch.id
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <><Feather name="check-circle" size={15} color="#22c55e" /><Text style={[rv.btnText, { color: "#22c55e" }]}>Onayla</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
const rv = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  storyTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  preview: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  btns: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  btnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ─── Şikayetler Sekmesi ───────────────────────────────────────────────────────

const REPORT_LABELS: Record<string, string> = {
  story: "Hikaye", chapter: "Bölüm", comment: "Yorum", user: "Kullanıcı",
};

function ReportsTab() {
  const colors = useColors();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getReports("pending")
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handle = async (id: string, res: "resolved" | "dismissed") => {
    setProcessing(id);
    try {
      await resolveReport(id, res);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (reports.length === 0) return <SectionEmpty icon="🛡️" text={"Bekleyen şikayet yok!\nTüm şikayetler işlendi."} />;

  return (
    <View style={{ gap: 12 }}>
      {reports.map(r => (
        <View key={r.id} style={[rp.card, { backgroundColor: "#f59e0b0a", borderColor: "#f59e0b33" }]}>
          <View style={rp.header}>
            <View style={[rp.badge, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b55" }]}>
              <Text style={rp.badgeText}>{REPORT_LABELS[r.reportedType] ?? r.reportedType}</Text>
            </View>
            <Text style={[rp.id, { color: colors.mutedForeground }]} numberOfLines={1}>
              ID: {r.reportedId.slice(0, 10)}…
            </Text>
          </View>
          {r.reason && (
            <Text style={[rp.reason, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}>
              "{r.reason}"
            </Text>
          )}
          <Text style={[rp.reporter, { color: colors.mutedForeground }]}>
            Şikayetçi: {r.reporterId.slice(0, 10)}…
          </Text>
          <View style={rv.btns}>
            <TouchableOpacity
              style={[rv.btn, { borderColor: colors.border }]}
              onPress={() => handle(r.id, "dismissed")}
              disabled={processing === r.id}
            >
              <Feather name="x" size={14} color={colors.mutedForeground} />
              <Text style={[rv.btnText, { color: colors.mutedForeground }]}>Reddet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11" }]}
              onPress={() => handle(r.id, "resolved")}
              disabled={processing === r.id}
            >
              {processing === r.id
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <><Feather name="check" size={14} color="#22c55e" /><Text style={[rv.btnText, { color: "#22c55e" }]}>Çözüldü</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
const rp = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },
  id: { fontSize: 11, fontFamily: "Inter_400Regular" },
  reason: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic", padding: 10, borderRadius: 10, borderWidth: 1, lineHeight: 18 },
  reporter: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

// ─── Kullanıcı Askıya Al Sekmesi ──────────────────────────────────────────────

function BanTab() {
  const colors = useColors();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [banReason, setBanReason] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = term.trim();
    if (!t) { setResults([]); setSearched(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const users = await searchUsersForMod(t);
        if (!cancelled) { setResults(users); setSearched(true); }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term]);

  const handleBan = async (u: UserSummary) => {
    const reason = banReason[u.uid]?.trim() || "Topluluk kurallarını ihlal";
    setSaving(u.uid);
    try {
      await banUser(u.uid, reason);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: true, banReason: reason } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  const handleUnban = async (u: UserSummary) => {
    setSaving(u.uid);
    try {
      await unbanUser(u.uid);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: false, banReason: "" } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[bn.hint, { color: colors.mutedForeground }]}>
        Kullanıcıyı askıya al veya yasağını kaldır. Askıya alınan kullanıcılar içerik üretemez.
      </Text>
      <View style={[bn.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Kullanıcı adı ara..."
          placeholderTextColor={colors.mutedForeground}
          style={[bn.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>

      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && searched && results.length === 0 && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>Kullanıcı bulunamadı.</Text>
      )}
      {!loading && !searched && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>Aramak için kullanıcı adı yaz.</Text>
      )}

      {!loading && results.map(u => (
        <View
          key={u.uid}
          style={[bn.userCard, { backgroundColor: colors.card, borderColor: u.banned ? "#ef444444" : colors.border }]}
        >
          <View style={bn.userRow}>
            {u.avatarUrl ? (
              <Image source={{ uri: u.avatarUrl }} style={bn.avatar} />
            ) : (
              <View style={[bn.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[bn.avatarInitial, { color: colors.primary }]}>{u.displayName.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[bn.userName, { color: colors.foreground }]} numberOfLines={1}>{u.displayName}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                <View style={[bn.roleBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                  <Text style={[bn.roleBadgeText, { color: colors.primary }]}>{u.role}</Text>
                </View>
                {u.banned && (
                  <View style={[bn.roleBadge, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}>
                    <Text style={[bn.roleBadgeText, { color: "#ef4444" }]}>Askıya Alındı</Text>
                  </View>
                )}
              </View>
              {u.banned && u.banReason && (
                <Text style={[bn.banReason, { color: "#ef444499" }]} numberOfLines={1}>Sebep: {u.banReason}</Text>
              )}
            </View>
          </View>

          {!u.banned && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <TextInput
                value={banReason[u.uid] ?? ""}
                onChangeText={t => setBanReason(prev => ({ ...prev, [u.uid]: t }))}
                placeholder="Askıya alma sebebi (isteğe bağlı)"
                placeholderTextColor={colors.mutedForeground}
                style={[bn.reasonInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              />
              <TouchableOpacity
                style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                onPress={() => handleBan(u)}
                disabled={saving === u.uid || u.role === "admin"}
              >
                {saving === u.uid
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <><Feather name="slash" size={14} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Askıya Al</Text></>
                }
              </TouchableOpacity>
            </View>
          )}

          {u.banned && (
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11", marginTop: 6 }]}
              onPress={() => handleUnban(u)}
              disabled={saving === u.uid}
            >
              {saving === u.uid
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <><Feather name="shield-off" size={14} color="#22c55e" /><Text style={[rv.btnText, { color: "#22c55e" }]}>Yasağı Kaldır</Text></>
              }
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}
const bn = StyleSheet.create({
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  noResult: { textAlign: "center", paddingVertical: 24, fontSize: 13, fontFamily: "Inter_400Regular" },
  userCard: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 2 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 16, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  roleBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  banReason: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  reasonInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Kullanıcı Yönetimi Sekmesi (Sadece Admin) ────────────────────────────────

const ROLE_LABELS: Record<string, string> = { user: "Kullanıcı", moderator: "Moderatör", admin: "Admin" };

function UsersTab({ currentUid }: { currentUid: string }) {
  const colors = useColors();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const t = term.trim();
    if (!t) { setResults([]); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const users = await searchUsersForMod(t);
        if (!cancelled) setResults(users);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term]);

  const handleRole = async (u: UserSummary, newRole: "user" | "moderator" | "admin") => {
    if (u.uid === currentUid) { Alert.alert("Hata", "Kendi rolünü değiştiremezsin."); return; }
    setSaving(u.uid);
    try {
      await setUserRole(u.uid, newRole);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, role: newRole } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[bn.hint, { color: colors.mutedForeground }]}>
        Kullanıcıya moderatör veya admin rolü ata.
      </Text>
      <View style={[bn.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Kullanıcı adı ara..."
          placeholderTextColor={colors.mutedForeground}
          style={[bn.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>
      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && results.length === 0 && term.trim() !== "" && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>Kullanıcı bulunamadı.</Text>
      )}
      {!loading && results.map(u => (
        <View key={u.uid} style={[bn.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={bn.userRow}>
            {u.avatarUrl ? (
              <Image source={{ uri: u.avatarUrl }} style={bn.avatar} />
            ) : (
              <View style={[bn.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[bn.avatarInitial, { color: colors.primary }]}>{u.displayName.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[bn.userName, { color: colors.foreground }]}>{u.displayName}</Text>
              <Text style={[bn.roleBadgeText, { color: colors.mutedForeground, marginTop: 2 }]}>{ROLE_LABELS[u.role] ?? u.role}</Text>
            </View>
            {saving === u.uid && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          {u.uid !== currentUid && (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
              {(["user", "moderator", "admin"] as const).map(role => (
                <TouchableOpacity
                  key={role}
                  style={[
                    ug.roleBtn,
                    {
                      borderColor: u.role === role ? colors.primary : colors.border,
                      backgroundColor: u.role === role ? colors.primary + "20" : "transparent",
                    },
                  ]}
                  onPress={() => handleRole(u, role)}
                  disabled={u.role === role || saving === u.uid}
                >
                  <Text style={[ug.roleBtnText, { color: u.role === role ? colors.primary : colors.mutedForeground }]}>
                    {ROLE_LABELS[role]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
const ug = StyleSheet.create({
  roleBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  roleBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ─── Ana Ekran ────────────────────────────────────────────────────────────────

type TabKey = "review" | "reports" | "ban" | "users";

const TABS: { key: TabKey; label: string; icon: string; minRole: "moderator" | "admin" }[] = [
  { key: "review", label: "İnceleme", icon: "eye", minRole: "moderator" },
  { key: "reports", label: "Şikayetler", icon: "alert-triangle", minRole: "moderator" },
  { key: "ban", label: "Askıya Al", icon: "slash", minRole: "moderator" },
  { key: "users", label: "Kullanıcılar", icon: "users", minRole: "admin" },
];

export default function ModeratorScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabKey>("review");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/auth"); return; }
    if (profile && profile.role !== "moderator" && profile.role !== "admin") {
      router.back();
    }
  }, [user, profile, authLoading]);

  if (authLoading || !profile) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isAdmin = profile.role === "admin";
  const visibleTabs = TABS.filter(t => t.minRole === "moderator" || isAdmin);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Başlık */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.titleRow}>
          <Feather name="shield" size={18} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Moderatör Paneli</Text>
        </View>
        <View style={[s.rolePill, { backgroundColor: isAdmin ? "#f59e0b22" : colors.primary + "22", borderColor: isAdmin ? "#f59e0b55" : colors.primary + "55" }]}>
          <Text style={[s.rolePillText, { color: isAdmin ? "#f59e0b" : colors.primary }]}>
            {isAdmin ? "👑 Admin" : "🛡️ Mod"}
          </Text>
        </View>
      </View>

      {/* Sekmeler */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.tabsBar, { borderColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {visibleTabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Feather name={t.icon as any} size={14} color={tab === t.key ? colors.primary : colors.mutedForeground} />
            <Text style={[s.tabText, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* İçerik */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === "review" && <ReviewTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "ban" && <BanTab />}
        {tab === "users" && isAdmin && user && <UsersTab currentUid={user.uid} />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  tabsBar: { borderBottomWidth: 1, flexGrow: 0 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 12, paddingHorizontal: 10, marginBottom: -1 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
});
