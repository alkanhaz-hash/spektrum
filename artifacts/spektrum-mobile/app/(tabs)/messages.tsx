import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { listenConversations, Conversation } from "@/lib/firestore-service";

function timeAgo(ts?: { seconds: number }): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000 - ts.seconds);
  if (diff < 60) return "Az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
  return `${Math.floor(diff / 86400)} g`;
}

function AvatarCircle({ name, color }: { name: string; color: string }) {
  return (
    <View style={[av.circle, { backgroundColor: color + "33" }]}>
      <Text style={[av.initial, { color }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const av = StyleSheet.create({
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 20, fontFamily: "Inter_700Bold" },
});

function LoginPrompt() {
  const colors = useColors();
  return (
    <View style={[lp.container, { backgroundColor: colors.background }]}>
      <Feather name="message-circle" size={52} color={colors.mutedForeground + "60"} />
      <Text style={[lp.title, { color: colors.foreground }]}>Mesajlaşmaya Başla</Text>
      <Text style={[lp.sub, { color: colors.mutedForeground }]}>
        Diğer yazarlarla iletişime geçmek için giriş yap.
      </Text>
      <TouchableOpacity style={[lp.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")}>
        <Text style={lp.btnText}>Giriş Yap / Kayıt Ol</Text>
      </TouchableOpacity>
    </View>
  );
}

const lp = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 20 },
  btn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

const AVATAR_COLORS = ["#7c3aed", "#06b6d4", "#ec4899", "#f59e0b", "#22c55e"];

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = listenConversations(user.uid, (convs) => {
      setConversations(convs);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  if (!user) return <LoginPrompt />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mesajlar</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: conv, index }) => {
            const otherUid = conv.participants.find((p) => p !== user.uid) ?? "";
            const otherName = conv.participantNames?.[otherUid] ?? "Kullanıcı";
            const unread = conv.unreadCount?.[user.uid] ?? 0;
            const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
            return (
              <TouchableOpacity
                style={[styles.convRow, { borderBottomColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: "/chat/[id]",
                    params: { id: conv.id, otherName, otherUid },
                  })
                }
                activeOpacity={0.7}
              >
                <AvatarCircle name={otherName} color={avatarColor} />
                <View style={styles.convInfo}>
                  <View style={styles.convTop}>
                    <Text style={[styles.convName, { color: colors.foreground }]} numberOfLines={1}>
                      {otherName}
                    </Text>
                    <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
                      {timeAgo(conv.lastMessageAt)}
                    </Text>
                  </View>
                  <View style={styles.convBottom}>
                    <Text
                      style={[
                        styles.convLast,
                        { color: unread > 0 ? colors.foreground : colors.mutedForeground },
                        unread > 0 && { fontFamily: "Inter_600SemiBold" },
                      ]}
                      numberOfLines={1}
                    >
                      {conv.lastMessage || "Mesaj yok"}
                    </Text>
                    {unread > 0 && (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.unreadText}>{unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="inbox" size={44} color={colors.mutedForeground + "60"} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Henüz mesajın yok
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Bir yazarın profilini ziyaret ederek mesaj gönderebilirsin.
              </Text>
            </View>
          }
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, textAlign: "center", fontFamily: "Inter_400Regular" },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  convInfo: { flex: 1 },
  convTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  convTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  convLast: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
});
