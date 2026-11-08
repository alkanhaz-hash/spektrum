import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useLocale } from "@/contexts/LocaleContext";
import { getWeeklyLeaderboard, type WeeklyLeaderboard as Board } from "@/lib/weekly-voting";

export function WeeklyLeaderboard() {
  const colors = useColors();
  const { locale, t } = useLocale();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const data = await getWeeklyLeaderboard();
      if (!alive.current || my !== seq.current) return;
      setBoard(data); setError(null);
    } catch (e) {
      if (!alive.current || my !== seq.current) return;
      setError(e instanceof Error ? e.message : locale === "en" ? "Could not load the leaderboard." : "Liste yüklenemedi.");
    } finally {
      if (alive.current && my === seq.current) setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    alive.current = true;
    const poll = setInterval(load, 60_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") load(); });
    return () => { alive.current = false; clearInterval(poll); sub.remove(); };
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.wrap} accessibilityLabel={t("Haftanın Hikayeleri")}>
      <Text style={[styles.title, { color: colors.foreground }]}>{t("Haftanın Hikayeleri")}</Text>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        {board ? `${t("Hafta:")} ${new Date(board.startsAt).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" })} – ${new Date(board.endsAt).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" })}. ` : ""}
        {t("Sıralama anlıktır; hafta henüz bitmedi. Eşit oylarda hikaye kimliğine göre sabit sıra uygulanır. Beğenilerden bağımsızdır.")}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : error ? (
        <View style={[styles.box, { borderColor: colors.destructive }]} accessibilityRole="alert">
          <Text style={[styles.msg, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button" accessibilityLabel={t("Haftalık listeyi tekrar yükle")}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("Tekrar dene")}</Text>
          </TouchableOpacity>
        </View>
      ) : !board || board.entries.length === 0 ? (
        <View style={[styles.box, { borderColor: colors.border }]}>
          <Text style={[styles.msg, { color: colors.mutedForeground }]}>{t("Bu hafta henüz oy verilmedi.")}</Text>
        </View>
      ) : (
        board.entries.map((e) => (
          <TouchableOpacity
            key={e.storyId}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push({ pathname: "/story/[id]", params: { id: e.storyId } })}
            accessibilityRole="button"
            accessibilityLabel={`${e.rank}. ${t("sıra")}, ${e.title}, ${e.authorName}, ${e.votes} ${t("oy")}`}
          >
            <View style={[styles.rank, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.rankText, { color: colors.primary }]}>{e.rank}</Text>
            </View>
            {e.coverUrl ? <Image source={{ uri: e.coverUrl }} style={styles.cover} /> : <View style={[styles.cover, { backgroundColor: colors.muted }]} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{e.title}</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{e.authorName}</Text>
              <Text style={[styles.rowSub, { color: colors.primary }]}>{e.votes.toLocaleString(locale === "en" ? "en-US" : "tr-TR")} {t("oy")}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 20, gap: 8 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  box: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  msg: { fontSize: 13, fontFamily: "Inter_400Regular" },
  btn: { minHeight: 44, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, minHeight: 64 },
  rank: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cover: { width: 36, height: 50, borderRadius: 6 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
