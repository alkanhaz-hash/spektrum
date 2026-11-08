import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { castWeeklyVote, getMyWeeklyVote, type WeeklyVoteStatus } from "@/lib/weekly-voting";

interface Props { storyId: string; authorId: string; status: string }

export function WeeklyVoteButton({ storyId, authorId, status }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const { t } = useLocale();
  const uid = user?.uid ?? null;
  const unverified = !!user && !user.emailVerified;
  const eligible = status === "published" || status === "completed";
  const canVote = !!uid && !unverified && eligible && uid !== authorId;

  const [mine, setMine] = useState<WeeklyVoteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const ctx = useRef(0);
  const requestSeq = useRef(0);

  const refresh = useCallback(async (token: number, keepError = false) => {
    if (pendingRef.current) return;
    const request = ++requestSeq.current;
    try {
      const s = await getMyWeeklyVote();
      if (token === ctx.current && request === requestSeq.current) {
        setMine(s);
        if (!keepError || s.storyId) setError(null);
        if (s.storyId) setConfirming(false);
      }
    } catch (e) {
      if (token === ctx.current && request === requestSeq.current) setError(e instanceof Error ? e.message : "Oy durumu alınamadı.");
    }
  }, []);

  useEffect(() => {
    const token = ++ctx.current;
    setMine(null); setError(null); setConfirming(false); setPending(false); pendingRef.current = false;
    if (!canVote) return;
    refresh(token);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(token); });
    return () => { ctx.current++; sub.remove(); };
  }, [uid, storyId, canVote, refresh]);

  useFocusEffect(useCallback(() => { if (canVote) refresh(ctx.current); }, [canVote, refresh]));

  const endsAt = mine?.endsAt;
  useEffect(() => {
    if (!endsAt || !canVote) return;
    const token = ctx.current;
    const ms = Math.min(new Date(endsAt).getTime() - Date.now() + 1500, 2_000_000_000);
    const t = setTimeout(() => refresh(token), Math.max(ms, 1000));
    return () => clearTimeout(t);
  }, [endsAt, canVote, refresh]);

  const confirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    requestSeq.current++;
    setPending(true); setError(null);
    const token = ctx.current;
    try {
      const s = await castWeeklyVote(storyId);
      if (token !== ctx.current) return;
      setMine(s); setConfirming(false);
    } catch (e) {
      if (token !== ctx.current) return;
      setError(e instanceof Error ? e.message : "Oy kaydedilemedi.");
      pendingRef.current = false;
      await refresh(token, true);
    } finally {
      if (token === ctx.current) { pendingRef.current = false; setPending(false); }
    }
  };

  const header = (
    <View style={styles.head}>
      <Feather name="check-square" size={16} color={colors.primary} />
      <Text style={[styles.title, { color: colors.foreground }]}>{t("Haftanın hikayesi oyu")}</Text>
    </View>
  );
  const text = (t: string, c: string = colors.mutedForeground) => <Text style={[styles.body, { color: c }]}>{t}</Text>;
  const shell = (children: React.ReactNode) => (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>{header}{children}</View>
  );

  if (!uid) return shell(<>
    {text(t("Her hafta yayımlanmış tek bir hikayeye oy verebilirsin."))}
    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")} accessibilityRole="button" accessibilityLabel={t("Oy vermek için giriş yap")}>
      <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t("Oy vermek için giriş yap")}</Text>
    </TouchableOpacity>
  </>);
  if (unverified) return shell(text(t("Oy verebilmek için e-posta adresini doğrulamalısın. Doğrulama bağlantısı için gelen kutunu kontrol et.")));
  if (uid === authorId) return shell(text(t("Kendi hikayene oy veremezsin.")));
  if (!eligible) return shell(text(t("Yalnızca yayımlanmış hikayeler haftalık oylamaya katılır.")));

  const voted = mine?.storyId ?? null;
  return shell(<>
    {!!error && (
      <View accessibilityRole="alert">
        {text(error, colors.destructive)}
        <TouchableOpacity style={styles.link} onPress={() => (confirming ? confirm() : refresh(ctx.current))} accessibilityRole="button" accessibilityLabel={t("Tekrar dene")}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("Tekrar dene")}</Text>
        </TouchableOpacity>
      </View>
    )}
    {!mine ? (
      !error && <ActivityIndicator color={colors.primary} />
    ) : voted === storyId ? (
      text(t("Bu haftaki oyun bu hikayede. Oy değiştirilemez."), colors.primary)
    ) : voted ? (<>
      {text(t("Bu haftaki oyunu başka bir hikayeye verdin. Oy değiştirilemez."))}
      <TouchableOpacity style={styles.link} onPress={() => router.push({ pathname: "/story/[id]", params: { id: voted } })} accessibilityRole="button" accessibilityLabel={t("Oy verdiğin hikayeye git")}>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("Oy verdiğin hikayeye git")}</Text>
      </TouchableOpacity>
    </>) : confirming ? (<>
      {text(t("Haftada yalnızca bir oy hakkın var ve verdikten sonra geri alınamaz ya da değiştirilemez. Bu hikayeye oy vermek istiyor musun?"))}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.flex, { backgroundColor: colors.primary, opacity: pending ? 0.6 : 1 }]} onPress={confirm} disabled={pending} accessibilityRole="button" accessibilityLabel="Oyumu ver, geri alınamaz" accessibilityState={{ disabled: pending, busy: pending }}>
          {pending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t("Evet, oyumu ver")}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.flex, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setConfirming(false)} disabled={pending} accessibilityRole="button" accessibilityLabel="Vazgeç">
          <Text style={[styles.btnText, { color: colors.foreground }]}>{t("Vazgeç")}</Text>
        </TouchableOpacity>
      </View>
    </>) : (<>
      {text(t("Bu hafta henüz oy kullanmadın."))}
      <TouchableOpacity style={[styles.btn, { borderWidth: 1, borderColor: colors.primary }]} onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={t("Bu hikayeye haftalık oy ver")}>
        <Text style={[styles.btnText, { color: colors.primary }]}>{t("Bu hikayeye oy ver")}</Text>
      </TouchableOpacity>
    </>)}
  </>);
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginTop: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold" },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  btn: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  link: { minHeight: 44, justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
});
