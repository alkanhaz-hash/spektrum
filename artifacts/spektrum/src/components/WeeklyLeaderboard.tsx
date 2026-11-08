import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getWeeklyLeaderboard, type WeeklyLeaderboard as Board } from "@/lib/weekly-voting";
import { useLocale } from "@/contexts/LocaleContext";
import { formatLocale } from "@workspace/spektrum-i18n";

const fmt = (iso: string, locale: "tr" | "en") =>
  new Date(iso).toLocaleDateString(formatLocale(locale), { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

export function WeeklyLeaderboard() {
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
      setBoard(data);
      setError(null);
    } catch (e) {
      if (!alive.current || my !== seq.current) return;
      setError(e instanceof Error ? e.message : locale === "en" ? "Could not load the leaderboard." : "Liste yüklenemedi.");
    } finally {
      if (alive.current && my === seq.current) setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    alive.current = true;
    load();
    const poll = setInterval(load, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      clearInterval(poll);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return (
    <section data-testid="section-weekly-leaderboard" aria-labelledby="weekly-title">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-5 h-5 text-primary" />
        <h2 id="weekly-title" className="text-xl font-bold font-serif">{t("Haftanın Hikayeleri")}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {board ? `${t("Hafta:")} ${fmt(board.startsAt, locale)} – ${fmt(board.endsAt, locale)}. ` : ""}
        {t("Sıralama anlıktır; hafta henüz bitmedi. Eşit oylarda hikaye kimliğine göre sabit sıra uygulanır. Beğenilerden bağımsızdır.")}
      </p>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm" role="alert" data-testid="error-weekly-leaderboard">
          <p className="text-destructive mb-2">{error}</p>
          <button onClick={() => { setLoading(true); load(); }} className="text-primary underline underline-offset-2" data-testid="button-retry-leaderboard">{t("Tekrar dene")}</button>
        </div>
      ) : !board || board.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="empty-weekly-leaderboard">
          {t("Bu hafta henüz oy verilmedi. Bir hikayenin sayfasından haftalık oyunu kullanabilirsin.")}
        </div>
      ) : (
        <ol className="grid gap-3 md:grid-cols-3">
          {board.entries.map(e => (
            <li key={e.storyId}>
              <Link href={`/story/${e.storyId}`} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors" data-testid={`link-weekly-${e.storyId}`}>
                <span className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary">{e.rank}</span>
                <span className="w-10 h-14 rounded bg-primary/10 overflow-hidden shrink-0">
                  {e.coverUrl && <img src={e.coverUrl} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{e.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{e.authorName}</span>
                  <span className="block text-xs text-primary mt-0.5">{e.votes.toLocaleString(formatLocale(locale))} {t("oy")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
