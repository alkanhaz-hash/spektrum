import React, { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { getReadingReport, type StoryReadingReport } from "@/lib/reading-analytics";

type Days = 7 | 30 | 90;
const nf = new Intl.NumberFormat("tr-TR");
function dur(sec: number) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s === 0) return "0 sn";
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk${s % 60 ? ` ${s % 60} sn` : ""}`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}
const pct = (r: number) => `%${(Math.round((r <= 1 ? r * 100 : r) * 10) / 10).toLocaleString("tr-TR")}`;

export default function ReadingStatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const uid = user?.uid;
  const [days, setDays] = useState<Days>(30);
  const [report, setReport] = useState<StoryReadingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(() => {
    const n = ++seq.current;
    setReport(null); setError(null);
    if (!id || !uid) { setLoading(false); return; }
    setLoading(true);
    getReadingReport(id, days)
      .then((r) => { if (n === seq.current) { setReport(r); setLoading(false); } })
      .catch((e: unknown) => { if (n === seq.current) { setError(e instanceof Error ? e.message : "İstatistikler alınamadı."); setLoading(false); } });
  }, [id, uid, days]);

  useFocusEffect(useCallback(() => { load(); return () => { seq.current++; }; }, [load]));

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const empty = !!report && report.sessionCount === 0 && report.visitCount === 0;
  const chapters = report ? [...report.chapters].sort((a, b) => a.order - b.order) : [];

  const Stat = ({ l, v, h }: { l: string; v: string; h: string }) => (
    <View style={[styles.stat, card]}>
      <Text style={[styles.small, { color: colors.mutedForeground }]}>{l}</Text>
      <Text style={[styles.statV, { color: colors.foreground }]}>{v}</Text>
      <Text style={[styles.tiny, { color: colors.mutedForeground }]}>{h}</Text>
    </View>
  );
  const Row = ({ l, v }: { l: string; v: string }) => (
    <View style={styles.row}>
      <Text style={[styles.small, { color: colors.mutedForeground, flex: 1 }]}>{l}</Text>
      <Text style={[styles.small, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{v}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Okuma istatistikleri</Text>
        <TouchableOpacity onPress={load} disabled={loading} style={styles.back}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
        {report?.title ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>{report.title}</Text> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([7, 30, 90] as Days[]).map((p) => (
            <TouchableOpacity key={p} onPress={() => setDays(p)}
              style={[styles.chip, { borderColor: days === p ? colors.primary : colors.border, backgroundColor: days === p ? colors.primary + "18" : "transparent" }]}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: days === p ? colors.primary : colors.mutedForeground }}>Son {p} gün</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : !uid ? (
          <Text style={[styles.small, { color: colors.mutedForeground }]}>İstatistikleri görmek için giriş yapmalısın.</Text>
        ) : error ? (
          <View style={[styles.box, card, { alignItems: "center", gap: 8 }]}>
            <Feather name="alert-triangle" size={24} color="#ef4444" />
            <Text style={[styles.h, { color: colors.foreground }]}>İstatistikler gösterilemiyor</Text>
            <Text style={[styles.small, { color: colors.mutedForeground, textAlign: "center" }]}>{error}</Text>
            <TouchableOpacity onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        ) : report ? (
          <>
            {report.truncated && (
              <View style={[styles.box, { borderColor: "#f59e0b", backgroundColor: "#f59e0b18" }]}>
                <Text style={[styles.small, { color: colors.foreground }]}>Bu dönemde 5.000 oturum örnek sınırına ulaşıldı; rapor yaklaşıktır ve sınırlıdır.</Text>
              </View>
            )}
            {empty ? (
              <View style={[styles.box, card, { alignItems: "center", gap: 8 }]}>
                <Feather name="bar-chart-2" size={30} color={colors.mutedForeground} />
                <Text style={[styles.h, { color: colors.foreground }]}>Bu dönemde henüz ölçüm yok</Text>
                <Text style={[styles.small, { color: colors.mutedForeground, textAlign: "center" }]}>
                  Ölçüm yeni başladı; yalnızca bu dönemde başlayan okumalar sayılır. Kendi okumaların hariç tutulur.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.grid}>
                  <Stat l="Bölüm oturumu" v={nf.format(report.sessionCount)} h="Tekil kişi değil" />
                  <Stat l="Kitap ziyareti" v={nf.format(report.visitCount)} h="Hesap sayısı değil" />
                  <Stat l="Tamamlanan" v={nf.format(report.completedCount)} h="≥%90 ve ≥10 sn aktif" />
                  <Stat l="24 saattir tamamlanmadı" v={nf.format(report.staleCount)} h="Terk anlamına gelmez" />
                </View>
                <Stat l="Toplam aktif okuma" v={dur(report.activeSeconds)} h="Seçilen dönem" />
                <Text style={[styles.h, { color: colors.foreground, marginTop: 4 }]}>Bölümler</Text>
                {chapters.map((c) => (
                  <View key={c.chapterId} style={[styles.box, card, { gap: 6 }]}>
                    <Text style={[styles.tiny, { color: colors.mutedForeground }]}>Bölüm {c.order}</Text>
                    <Text style={[styles.h, { color: colors.foreground, fontSize: 15 }]}>{c.title}</Text>
                    <Row l="Oturum" v={nf.format(c.sessions)} />
                    <Row l="%25 / %50 / %75 ilerleme" v={`${nf.format(c.reached25)} / ${nf.format(c.reached50)} / ${nf.format(c.reached75)}`} />
                    <Row l="Tamamlanan" v={`${nf.format(c.completed)} (${pct(c.completionRate)})`} />
                    <Row l="24 saattir tamamlanmadı" v={nf.format(c.stale)} />
                    <Row l="Yakın zamanda bitmemiş" v={nf.format(c.recentUnfinished)} />
                    <Row l="Sonraki bölüme geçti" v={nf.format(c.continued)} />
                    <Row l="Ort. aktif süre" v={dur(c.meanActiveSeconds)} />
                    <Text style={[styles.tiny, { color: colors.mutedForeground, marginTop: 4 }]}>Çıkış konumu (ilerleme %)</Text>
                    <Row l="0–24" v={nf.format(c.exit0to24)} />
                    <Row l="25–49" v={nf.format(c.exit25to49)} />
                    <Row l="50–74" v={nf.format(c.exit50to74)} />
                    <Row l="75–100" v={nf.format(c.exit75to100)} />
                  </View>
                ))}
              </>
            )}
            <View style={[styles.box, { backgroundColor: colors.muted, borderColor: colors.border, gap: 4 }]}>
              <Text style={[styles.small, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Nasıl ölçülür?</Text>
              <Text style={[styles.tiny, { color: colors.mutedForeground }]}>Yalnızca son {report.days} gün içinde başlayan okumalar sayılır; geçmişe dönük veri yoktur. Oturum bir bölümdeki okumadır, kişi değildir; ziyaret geçici bir kitap ziyaretidir, hesap değildir.</Text>
              <Text style={[styles.tiny, { color: colors.mutedForeground }]}>Tamamlama: ≥%90 ilerleme ve ≥10 sn aktif süre. “24 saattir tamamlanmadı” kesin terk değildir. Sonraki bölüme geçiş aynı geçici ziyarette gözlenir. Uygulama aniden kapanırsa son ~30 sn eksik kalabilir; veriler metnin okunduğunu kanıtlamaz. Okuyucu kimliği gösterilmez; kendi okumaların hariçtir.</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexGrow: 1, flexBasis: "46%", borderWidth: 1, borderRadius: 14, padding: 12 },
  statV: { fontSize: 22, fontFamily: "Inter_700Bold", marginVertical: 2 },
  box: { borderWidth: 1, borderRadius: 14, padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  h: { fontSize: 17, fontFamily: "Inter_700Bold" },
  small: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tiny: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  retry: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18 },
});
