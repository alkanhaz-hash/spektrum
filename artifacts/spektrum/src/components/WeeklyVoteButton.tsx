import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Vote } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { castWeeklyVote, getMyWeeklyVote, type WeeklyVoteStatus } from "@/lib/weekly-voting";

interface Props { storyId: string; authorId: string; status: string }

export function WeeklyVoteButton({ storyId, authorId, status }: Props) {
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

  // Özel durumu auth/hikaye değişiminde temizle
  useEffect(() => {
    const token = ++ctx.current;
    setMine(null); setError(null); setConfirming(false); setPending(false); pendingRef.current = false;
    if (!canVote) return;
    refresh(token);
    const onVis = () => { if (document.visibilityState === "visible") refresh(token); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ctx.current++;
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [uid, storyId, canVote, refresh]);

  // Hafta bitince durumu yenile
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
      setError(e instanceof Error ? e.message : t("Oy kaydedilemedi."));
      pendingRef.current = false;
      await refresh(token, true); // belirsiz hatada kabul edilmiş oyu geri kazan
    } finally {
      if (token === ctx.current) { pendingRef.current = false; setPending(false); }
    }
  };

  const box = "rounded-xl border border-border bg-card p-4 text-sm max-w-md";
  const title = <p className="font-semibold flex items-center gap-2 mb-1"><Vote className="w-4 h-4 text-primary" /> {t("Haftanın hikayesi oyu")}</p>;

  if (!uid) return (
    <div className={box} data-testid="weekly-vote-signed-out">{title}
      <p className="text-muted-foreground mb-2">{t("Her hafta yayımlanmış tek bir hikayeye oy verebilirsin.")}</p>
      <Link href="/auth" className="text-primary underline underline-offset-2" data-testid="link-weekly-signin">{t("Oy vermek için giriş yap")}</Link>
    </div>
  );
  if (unverified) return (
    <div className={box} data-testid="weekly-vote-unverified">{title}
      <p className="text-muted-foreground">{t("Oy verebilmek için e-posta adresini doğrulamalısın. Doğrulama bağlantısı için gelen kutunu kontrol et.")}</p>
    </div>
  );
  if (uid === authorId) return (
    <div className={box} data-testid="weekly-vote-self">{title}
      <p className="text-muted-foreground">{t("Kendi hikayene oy veremezsin.")}</p>
    </div>
  );
  if (!eligible) return (
    <div className={box} data-testid="weekly-vote-ineligible">{title}
      <p className="text-muted-foreground">{t("Yalnızca yayımlanmış hikayeler haftalık oylamaya katılır.")}</p>
    </div>
  );

  const voted = mine?.storyId ?? null;
  return (
    <div className={box} data-testid="weekly-vote">
      {title}
      {error && (
        <p className="text-destructive mb-2" role="alert" data-testid="error-weekly-vote">
          {error}{" "}
          <button className="underline" onClick={() => (confirming ? confirm() : refresh(ctx.current))} data-testid="button-weekly-retry">{t("Tekrar dene")}</button>
        </p>
      )}
      {!mine ? (
        !error && <p className="text-muted-foreground">{t("Oy durumun yükleniyor…")}</p>
      ) : voted === storyId ? (
        <p className="text-primary font-medium" data-testid="status-weekly-voted">{t("Bu haftaki oyun bu hikayede. Oy değiştirilemez.")}</p>
      ) : voted ? (
        <p className="text-muted-foreground" data-testid="status-weekly-other">
          {t("Bu haftaki oyunu başka bir hikayeye verdin. Oy değiştirilemez.")} <Link href={`/story/${voted}`} className="text-primary underline underline-offset-2">{t("Oy verdiğin hikayeye git")}</Link>
        </p>
      ) : confirming ? (
        <div>
          <p className="text-muted-foreground mb-3">{t("Haftada yalnızca bir oy hakkın var ve verdikten sonra geri alınamaz ya da değiştirilemez. Bu hikayeye oy vermek istiyor musun?")}</p>
          <div className="flex gap-2">
            <button onClick={confirm} disabled={pending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60" data-testid="button-weekly-confirm">
              {pending ? t("Kaydediliyor…") : t("Evet, oyumu ver")}
            </button>
            <button onClick={() => setConfirming(false)} disabled={pending} className="px-4 py-2 rounded-lg border border-border" data-testid="button-weekly-cancel">{t("Vazgeç")}</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-muted-foreground mb-3">{t("Bu hafta henüz oy kullanmadın.")}</p>
          <button onClick={() => setConfirming(true)} className="px-4 py-2 rounded-lg border border-primary/40 text-primary font-medium hover:bg-primary/10" data-testid="button-weekly-vote">{t("Bu hikayeye oy ver")}</button>
        </div>
      )}
    </div>
  );
}
