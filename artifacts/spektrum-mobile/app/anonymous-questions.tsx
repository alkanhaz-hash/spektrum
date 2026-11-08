import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, type UserProfile } from "@/lib/auth-service";
import AnonymousQA from "@/components/AnonymousQA";

export default function AnonymousQuestionsScreen() {
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  const { user, loading: authLoading } = useAuth();
  const targetUid = uid || user?.uid || "";
  const colors = useColors(), insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoading(true); setProfile(null); setError("");
    if (!targetUid) { setError("Kendi soru kutun için giriş yapmalısın."); setLoading(false); return; }
    getUserProfile(targetUid).then(p => {
      if (!active) return;
      if (!p || p.banned) setError("Bu profil kullanılamıyor.");
      else setProfile(p);
    }).catch(() => { if (active) setError("Profil yüklenemedi. Lütfen yeniden dene."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetUid, authLoading]);
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
    <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }} accessibilityLabel="Geri"><Text style={{ color: colors.primary }}>Geri</Text></TouchableOpacity>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {loading || authLoading ? <ActivityIndicator color={colors.primary} /> : profile ?
        <AnonymousQA key={targetUid} targetUid={targetUid} displayName={profile.displayName} isOwner={user?.uid === targetUid} /> :
        <Text style={{ color: colors.destructive, padding: 16 }}>{error}</Text>}
    </ScrollView>
  </View>;
}
