import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getUserProfile, type UserProfile } from "@/lib/auth-service";
import { qaErrorMessage, QUESTION_MAX_LENGTH, sendAnonymousQuestion } from "@/lib/anonymous-qa";
import { getPublicQuestionInvitationUrl } from "@/lib/share-links";

export default function AnonymousAskRoute() {
  const params = useLocalSearchParams<{ uid?: string | string[] }>();
  const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid ?? "";
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProfile(null);
    setError("");
    setSent(false);
    if (!uid || uid.includes("/")) {
      setError("Bu soru bağlantısı geçersiz.");
      setLoading(false);
      return () => { active = false; };
    }
    getUserProfile(uid)
      .then((result) => {
        if (!active) return;
        const profileState = result as (UserProfile & { accountDeletionPending?: boolean }) | null;
        if (!profileState || profileState.banned || profileState.accountDeletionPending) {
          setError("Bu soru bağlantısı artık kullanılamıyor.");
          return;
        }
        setProfile(profileState);
      })
      .catch(() => { if (active) setError("Profil yüklenemedi. İnternet bağlantını kontrol edip yeniden dene."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid]);

  async function submitQuestion() {
    if (!question.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await sendAnonymousQuestion(uid, question);
      setQuestion("");
      setSent(true);
    } catch (e) {
      setError(qaErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function shareInvitation() {
    const url = getPublicQuestionInvitationUrl(uid);
    if (!url) {
      setError("Soru bağlantısı şu anda oluşturulamadı.");
      return;
    }
    try {
      await Share.share({
        title: `${profile?.displayName ?? "SPEKTRUM"} — anonim soru`,
        message: `Bana SPEKTRUM'da anonim soru sor: ${url}`,
        url,
      });
    } catch {
      setError("Bağlantı paylaşılamadı. Lütfen yeniden dene.");
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.brand, { color: colors.primary }]}>SPEKTRUM · ANONİM SORU-CEVAP</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : profile ? (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>{profile.displayName} için bir sorun var mı?</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>Uygulamaya giriş yapmadan anonim soru gönderebilirsin.</Text>
            {sent ? (
              <View style={styles.stack}>
                <Text style={[styles.success, { color: colors.primary }]}>Sorun gönderildi.</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>Yanıtlanırsa yazarın profilinde herkese açık görünebilir.</Text>
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => setSent(false)}>
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Başka bir soru sor</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkButton} onPress={() => router.push({ pathname: "/user/[id]", params: { id: uid } })}>
                  <Text style={[styles.link, { color: colors.primary }]}>Yazarın profiline git</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.stack}>
                <Text style={[styles.label, { color: colors.foreground }]}>Anonim sorun</Text>
                <TextInput
                  value={question}
                  onChangeText={setQuestion}
                  editable={!sending}
                  maxLength={QUESTION_MAX_LENGTH}
                  multiline
                  placeholder="Hikâyeleri veya merak ettiğin bir konuyu sor…"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  textAlignVertical="top"
                  accessibilityLabel="Anonim sorun"
                />
                <Text style={[styles.count, { color: colors.mutedForeground }]}>{question.length}/{QUESTION_MAX_LENGTH}</Text>
                <TouchableOpacity
                  disabled={sending || !question.trim()}
                  style={[styles.button, { backgroundColor: colors.primary, opacity: sending || !question.trim() ? 0.55 : 1 }]}
                  onPress={() => void submitQuestion()}
                >
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{sending ? "Gönderiliyor…" : "Anonim soruyu gönder"}</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
              Gönderen kimliği güvenlik için sistemde tutulur; soru sahibine veya paylaşımı görenlere gösterilmez. Sorunun içeriği ve cevabı herkese açık paylaşılabilir.
            </Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => void shareInvitation()}>
              <Text style={[styles.link, { color: colors.primary }]}>Bu soru bağlantısını paylaş</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Soru bağlantısı kullanılamıyor</Text>
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
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 16 },
  brand: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  title: { fontSize: 24, fontWeight: "800", lineHeight: 31 },
  body: { fontSize: 15, lineHeight: 22 },
  stack: { gap: 10 },
  label: { fontSize: 15, fontWeight: "700" },
  input: { minHeight: 128, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16 },
  count: { textAlign: "right", fontSize: 12 },
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: "700" },
  linkButton: { alignItems: "center", paddingVertical: 6 },
  link: { fontSize: 14, fontWeight: "600" },
  privacy: { fontSize: 12, lineHeight: 18 },
  success: { fontSize: 19, fontWeight: "800" },
  error: { fontSize: 13, lineHeight: 19 },
});
