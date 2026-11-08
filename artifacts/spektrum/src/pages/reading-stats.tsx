import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, RefreshCw, AlertTriangle, BarChart3 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getReadingReport, type StoryReadingReport } from "@/lib/reading-analytics";

type Days = 7 | 30 | 90;
const PERIODS: Days[] = [7, 30, 90];
const nf = new Intl.NumberFormat("tr-TR");

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s === 0) return "0 sn";
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk${s % 60 ? ` ${s % 60} sn` : ""}`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}
const pct = (r: number) => `%${(Math.round((r <= 1 ? r * 100 : r) * 10) / 10).toLocaleString("tr-TR")}`;

export default function ReadingStatsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
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
      .then(r => { if (n === seq.current) { setReport(r); setLoading(false); } })
      .catch((e: unknown) => { if (n === seq.current) { setError(e instanceof Error ? e.message : "İstatistikler alınamadı."); setLoading(false); } });
  }, [id, uid, days]);

  useEffect(() => { load(); return () => { seq.current++; }; }, [load]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible" && !loading) load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [load, loading]);

  const chapters = report ? [...report.chapters].sort((a, b) => a.order - b.order) : [];
  const empty = !!report && report.sessionCount === 0 && report.visitCount === 0;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <Link href={`/write/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4" data-testid="link-back-write">
          <ChevronLeft className="w-4 h-4" /> Hikayeye dön
        </Link>
        <h1 className="text-3xl font-bold font-serif">Okuma istatistikleri</h1>
        <p className="text-muted-foreground mt-1 mb-6" data-testid="text-stats-title">{report?.title ?? "Yalnızca hikaye sahibi görebilir."}</p>

        <div className="flex gap-2 mb-6" role="tablist">
          {PERIODS.map(p => (
            <button key={p} role="tab" aria-selected={days === p} onClick={() => setDays(p)} data-testid={`button-period-${p}`}
              className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${days === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              Son {p} gün
            </button>
          ))}
          <button onClick={load} disabled={loading} className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary disabled:opacity-50" data-testid="button-refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Yenile
          </button>
        </div>

        {authLoading || loading ? (
          <div className="space-y-4" data-testid="stats-loading">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : !uid ? (
          <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground" data-testid="stats-signin">İstatistikleri görmek için giriş yapmalısın.</div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3" role="alert" data-testid="stats-error">
            <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
            <p className="font-medium">İstatistikler gösterilemiyor</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={load} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm" data-testid="button-retry">Tekrar dene</button>
          </div>
        ) : report ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {report.truncated && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" role="status" data-testid="stats-truncated">
                Bu dönemde 5.000 oturum örnek sınırına ulaşıldı; rapor yaklaşıktır ve sınırlıdır.
              </div>
            )}
            {empty ? (
              <div className="rounded-2xl border border-dashed border-border py-14 text-center" data-testid="stats-empty">
                <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium">Bu dönemde henüz ölçüm yok</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">Ölçüm yeni başladı; yalnızca bu dönemde başlayan okumalar sayılır, geçmişe dönük veri yoktur. Kendi okumaların hariç tutulur.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    ["Bölüm oturumu", nf.format(report.sessionCount), "Tekil kişi değil"],
                    ["Kitap ziyareti", nf.format(report.visitCount), "Hesap sayısı değil"],
                    ["Tamamlanan", nf.format(report.completedCount), "≥%90 ve ≥10 sn aktif"],
                    ["24 saattir tamamlanmadı", nf.format(report.staleCount), "Terk anlamına gelmez"],
                    ["Aktif okuma", formatDuration(report.activeSeconds), "Toplam"],
                  ].map(([l, v, h]) => (
                    <div key={l} className="rounded-xl border border-border bg-card p-3" data-testid={`card-total-${l}`}>
                      <p className="text-xs text-muted-foreground">{l}</p>
                      <p className="text-xl font-semibold mt-1">{v}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{h}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[1100px]">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr className="text-right">
                        <th className="text-left p-3 sticky left-0 bg-muted">Bölüm</th>
                        <th className="p-3">Oturum</th><th className="p-3">%25</th><th className="p-3">%50</th><th className="p-3">%75</th>
                        <th className="p-3">Tamamlanan</th><th className="p-3">Oran</th><th className="p-3">24 saattir tamamlanmadı</th>
                        <th className="p-3">Yakın zamanda bitmemiş</th><th className="p-3">Sonraki bölüme geçti</th><th className="p-3">Ort. aktif süre</th>
                        <th className="p-3">Çıkış 0–24</th><th className="p-3">25–49</th><th className="p-3">50–74</th><th className="p-3">75–100</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chapters.map(c => (
                        <tr key={c.chapterId} className="border-t border-border text-right tabular-nums" data-testid={`row-chapter-${c.chapterId}`}>
                          <td className="text-left p-3 sticky left-0 bg-card max-w-[220px]"><span className="text-xs text-muted-foreground block">Bölüm {c.order}</span><span className="font-medium">{c.title}</span></td>
                          <td className="p-3">{nf.format(c.sessions)}</td><td className="p-3">{nf.format(c.reached25)}</td><td className="p-3">{nf.format(c.reached50)}</td><td className="p-3">{nf.format(c.reached75)}</td>
                          <td className="p-3">{nf.format(c.completed)}</td><td className="p-3">{pct(c.completionRate)}</td><td className="p-3">{nf.format(c.stale)}</td>
                          <td className="p-3">{nf.format(c.recentUnfinished)}</td><td className="p-3">{nf.format(c.continued)}</td><td className="p-3">{formatDuration(c.meanActiveSeconds)}</td>
                          <td className="p-3">{nf.format(c.exit0to24)}</td><td className="p-3">{nf.format(c.exit25to49)}</td><td className="p-3">{nf.format(c.exit50to74)}</td><td className="p-3">{nf.format(c.exit75to100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed space-y-1" data-testid="stats-methodology">
              <p className="font-medium text-foreground">Nasıl ölçülür?</p>
              <p>Yalnızca seçilen son {report.days} gün içinde başlayan okumalar sayılır; geçmişe dönük veri yoktur. Oturum bir bölümdeki okumadır, kişi sayısı değildir; ziyaret geçici bir kitap ziyaretidir, hesap değildir.</p>
              <p>Tamamlama: görünür ilerlemenin ≥%90 olması ve ≥10 sn aktif süre. “24 saattir tamamlanmadı”: bitmemiş ve 24 saattir yeni ölçüm yok; kesin terk değildir. Sonraki bölüme geçiş aynı geçici kitap ziyaretinde gözlenir.</p>
              <p>Uygulama aniden kapanırsa son ~30 sn eksik kalabilir. Bu veriler metnin okunduğunu kanıtlamaz. Okuyucu kimliği gösterilmez; kendi okumaların hariçtir.</p>
            </div>
          </motion.div>
        ) : null}
      </div>
    </AppLayout>
  );
}
