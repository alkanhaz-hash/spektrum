import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getBlockedUserIds, unblockUser } from "@/lib/firestore-service";
import { getUserProfile, UserProfile } from "@/lib/auth-service";

interface BlockedUser {
  uid: string;
  displayName: string;
  avatarUrl: string;
}

export default function EngellenenlerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const ids = await getBlockedUserIds(user.uid);
      const profiles = await Promise.all(
        ids.map(async (uid) => {
          try {
            const p: UserProfile | null = await getUserProfile(uid);
            return p
              ? { uid, displayName: p.displayName || "Kullanıcı", avatarUrl: p.avatarUrl || "" }
              : { uid, displayName: "Silinmiş Hesap", avatarUrl: "" };
          } catch {
            return { uid, displayName: "Bilinmiyor", avatarUrl: "" };
          }
        })
      );
      setBlocked(profiles);
    } catch {
      Alert.alert("Hata", "Liste yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = (targetUid: string, name: string) => {
    Alert.alert(
      "Engeli Kaldır",
      `${name} adlı kullanıcının engelini kaldırmak istiyor musun?`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Engeli Kaldır",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            setUnblocking(targetUid);
            try {
              await unblockUser(user.uid, targetUid);
              setBlocked(prev => prev.filter(b => b.uid !== targetUid));
            } catch {
              Alert.alert("Hata", "İşlem başarısız oldu.");
            } finally {
              setUnblocking(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Engellenen Kullanıcılar</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : blocked.length === 0 ? (
        <View style={s.center}>
          <Feather name="slash" size={40} color={colors.mutedForeground + "60"} style={{ marginBottom: 14 }} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>Engellenen yok</Text>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Engellediğin kullanıcılar burada görünür.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[s.countText, { color: colors.mutedForeground }]}>
            {blocked.length} engellenen kullanıcı
          </Text>
          <View style={[s.list, { borderColor: colors.border }]}>
            {blocked.map((b, idx) => (
              <View
                key={b.uid}
                style={[
                  s.row,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: idx < blocked.length - 1 ? 1 : 0,
                  },
                ]}
              >
                {/* Avatar */}
                <View style={[s.avatarWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {b.avatarUrl ? (
                    <Image source={{ uri: b.avatarUrl }} style={s.avatar} />
                  ) : (
                    <Text style={[s.avatarInitial, { color: colors.primary }]}>
                      {b.displayName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>

                {/* Name */}
                <Text style={[s.name, { color: colors.foreground }]} numberOfLines={1}>
                  {b.displayName}
                </Text>

                {/* Unblock button */}
                <TouchableOpacity
                  style={[s.unblockBtn, { borderColor: "#ef444440", backgroundColor: "#ef444412" }]}
                  onPress={() => handleUnblock(b.uid, b.displayName)}
                  disabled={unblocking === b.uid}
                >
                  {unblocking === b.uid ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <>
                      <Feather name="x" size={13} color="#ef4444" />
                      <Text style={s.unblockText}>Engeli Kaldır</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  countText: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  list: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  name: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  unblockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 90,
    justifyContent: "center",
  },
  unblockText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
});
