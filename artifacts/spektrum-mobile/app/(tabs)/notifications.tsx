import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  SpektrumNotification,
} from "@/lib/firestore-service";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function timeAgo(ts?: { seconds: number }): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000 - ts.seconds);
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün`;
  return `${Math.floor(diff / 604800)} hafta`;
}

function notifRoute(n: SpektrumNotification): { pathname: string; params?: Record<string, string> } | null {
  if (n.type === "follow") return { pathname: "/user/[id]", params: { id: n.senderId } };
  if ((n.type === "like" || n.type === "comment") && n.storyId)
    return { pathname: "/story/[id]", params: { id: n.storyId } };
  if ((n.type === "chapter_approved" || n.type === "chapter_rejected") && n.storyId)
    return { pathname: "/story-manage/[id]", params: { id: n.storyId } };
  if (n.type === "qa_answer") return { pathname: "/user/[id]", params: { id: n.senderId } };
  return null;
}

function notifText(n: SpektrumNotification): string {
  switch (n.type) {
    case "follow": return `${n.senderName} seni takip etmeye başladı.`;
    case "like": return `${n.senderName} hikayeni beğendi${n.storyTitle ? ` — "${n.storyTitle}"` : ""}.`;
    case "comment": return `${n.senderName} hikayene yorum yaptı${n.storyTitle ? ` — "${n.storyTitle}"` : ""}.`;
    case "qa_answer": return `${n.senderName} sorunuzu yanıtladı.`;
    case "chapter_approved": return `Bölümün onaylandı ve yayınlandı${n.storyTitle ? ` — "${n.storyTitle}"` : ""}.`;
    case "chapter_rejected": return `Bölümün reddedildi${n.storyTitle ? ` — "${n.storyTitle}"` : ""}.`;
    default: return "Yeni bildirim.";
  }
}

function typeIcon(type: SpektrumNotification["type"], colors: ReturnType<typeof useColors>): React.ReactElement {
  const iconMap: Record<string, [string, string]> = {
    follow: ["user-plus", colors.primary],
    like: ["heart", "#f472b6"],
    comment: ["message-circle", colors.primary],
    chapter_approved: ["check-circle", "#34d399"],
    chapter_rejected: ["x-circle", "#f87171"],
    qa_answer: ["help-circle", "#fbbf24"],
  };
  const [name, color] = iconMap[type] ?? ["bell", colors.mutedForeground];
  return <Feather name={name as any} size={12} color={color} />;
}

// ─── Bildirim Satırı ──────────────────────────────────────────────────────────

function NotifRow({
  item,
  onPress,
}: {
  item: SpektrumNotification;
  onPress: (n: SpektrumNotification) => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: item.read ? colors.card : colors.primary + "0d",
          borderColor: item.read ? colors.border : colors.primary + "33",
        },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
    >
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {item.senderAvatar ? (
          <Image source={{ uri: item.senderAvatar }} style={[styles.avatar, { borderColor: colors.border }]} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary + "22", borderColor: colors.border }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(item.senderName ?? "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Tip rozeti */}
        <View style={[styles.typeBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {typeIcon(item.type, colors)}
        </View>
      </View>

      {/* İçerik */}
      <View style={styles.content}>
        <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={2}>
          {notifText(item)}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {timeAgo(item.createdAt as { seconds: number } | undefined)}
        </Text>
      </View>

      {/* Okunmadı noktası */}
      {!item.read && (
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
      )}
    </TouchableOpacity>
  );
}

// ─── Ana Ekran ────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<SpektrumNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = getNotifications(user.uid, (data) => {
      setNotifs(data);
      setLoading(false);
    });
    markAllNotificationsRead(user.uid).catch(() => {});
    return unsub;
  }, [user]);

  const handlePress = (n: SpektrumNotification) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    const route = notifRoute(n);
    if (route) router.push(route as any);
  };

  const hasUnread = notifs.some((n) => !n.read);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Başlık */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Bildirimler</Text>
        {hasUnread && (
          <TouchableOpacity
            onPress={() => user && markAllNotificationsRead(user.uid).catch(() => {})}
          >
            <Text style={[styles.markAll, { color: colors.primary }]}>Tümünü okundu işaretle</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={48} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Bildirimleri görmek için giriş yapmalısın.
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.loginBtnText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      ) : notifs.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell" size={48} color={colors.mutedForeground + "40"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Henüz hiç bildirim yok.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => <NotifRow item={item} onPress={handlePress} />}
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  markAll: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  loginBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  loginBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatarWrap: { position: "relative", width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  typeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
  text: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  time: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
