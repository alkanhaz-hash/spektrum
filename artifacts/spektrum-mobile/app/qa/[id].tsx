import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getUserProfile, type UserProfile } from "@/lib/auth-service";
import { getPublicAnsweredQuestion, type AnonymousQuestion } from "@/lib/anonymous-qa";
import { getPublicShareUrl } from "@/lib/share-links";

export default function AnonymousAnswerRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? "";
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState<AnonymousQuestion | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setQuestion(null);
    setProfile(null);
    setError("");
    if (!id || id.includes("/")) {
      setError("Bu soru-cevap bağlantısı geçersiz.");
      setLoading(false);
      return () => { active = false; };
    }
    getPublicAnsweredQuestion(id)
      .then(async (result) => {
        if (!result) return;
        const author = await getUserProfile(result.targetUid);
        const authorState = author as (UserProfile & { accountDeletionPending?: boolean }) | null;
        if (active && authorState && !authorState.banned && !authorState.accountDeletionPending) {
          setQuestion(result);
          setProfile(authorState);
        }
      })
      .catch(() => { if (active) setError("Soru-cevap yüklenemedi. İnternet bağlantını kontrol edip yeniden dene."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function shareQuestion() {
    if (!question) return;
    const url = getPublicShareUrl(`/qa/${encodeURIComponent(question.id)}`);
    if (!url) {
      setError("Paylaşım bağlantısı oluşturulamadı.");
      return;
    }
    try {
      await Share.share({ title: `${profile?.displayName ?? "SPEKTRUM"} — anonim soru-cevap`, message: url, url });
    } catch {
      setError("Bağlantı paylaşılamadı. Lütfen yeniden dene.");
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : question && profile ? (
          <>
            <Text style={[styles.brand, { color: colors.primary }]}>SPEKTRUM · {profile.displayName}</Text>
            <View style={styles.stack}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ANONİM SORU</Text>
              <Text style={[styles.content, { color: colors.foreground }]}>{question.question}</Text>
            </View>
            <View style={styles.stack}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CEVAP</Text>
              <Text style={[styles.content, { color: colors.foreground }]}>{question.answer}</Text>
            </View>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => router.push({ pathname: "/ask/[uid]", params: { uid: question.targetUid } })}
            >
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sen de anonim soru sor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push({ pathname: "/user/[id]", params: { id: question.targetUid } })}>
              <Text style={[styles.link, { color: colors.primary }]}>Yazarın profilini ve hikâyelerini keşfet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => void shareQuestion()}>
              <Text style={[styles.link, { color: colors.primary }]}>Bu soru-cevap bağlantısını paylaş</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Bu soru-cevap kullanılamıyor</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>Silinmiş, henüz cevaplanmamış veya artık herkese açık olmayabilir.</Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.replace("/")}>
              <Text style={[styles.link, { color: colors.primary }]}>SPEKTRUM ana sayfasına git</Text>
            </TouchableOpacity>
          </>
        )}
        {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 18 },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 20 },
  brand: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 23, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 22 },
  stack: { gap: 8 },
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  content: { fontSize: 17, lineHeight: 26 },
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: "700" },
  linkButton: { alignItems: "center", paddingVertical: 4 },
  link: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  error: { fontSize: 13, lineHeight: 19 },
});
