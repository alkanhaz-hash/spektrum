import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Headphones, Play, Pause, RotateCcw, RotateCw, Upload, Trash2, X, RefreshCw, AlertTriangle, FileAudio, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { getChapterAudio, uploadChapterAudio, removeChapterAudio, type ChapterAudio } from "@/lib/chapter-audio";

interface Props { chapterId?: string; canManage?: boolean }

const MAX_BYTES = 100 * 1024 * 1024;
const SPEEDS = [1, 1.25, 1.5, 2] as const;
const ALLOWED_EXT = /\.(mp3|m4a)$/i;
const ALLOWED_MIME = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", ""];
// Keep author upload controls hidden in the test candidate until Firebase Storage writes are verified.
const CHAPTER_AUDIO_UPLOAD_ENABLED = false;

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
function fmtSize(b: number) { return `${(b / (1024 * 1024)).toFixed(1)} MB`; }
function isConflict(e: unknown) {
  const err = e as { code?: string; status?: number; message?: string } | null;
  return err?.status === 409 || /conflict|version/i.test(String(err?.code ?? "")) || /conflict|409/i.test(String(err?.message ?? ""));
}
function isAbort(e: unknown) {
  const err = e as { name?: string; code?: string } | null;
  return err?.name === "AbortError" || err?.code === "aborted" || err?.name === "CanceledError";
}

export default function ChapterAudioSection(props: Props) {
  const { user } = useAuth();
  return <ChapterAudioBody key={`${user?.uid ?? "guest"}:${props.chapterId ?? "new"}`} {...props} />;
}

function ChapterAudioBody({ chapterId, canManage: requestedCanManage = false }: Props) {
  const canManage = requestedCanManage && CHAPTER_AUDIO_UPLOAD_ENABLED;
  const { user } = useAuth();
  const { t } = useLocale();
  const { toast } = useToast();
  const uid = user?.uid ?? "guest";

  const [audio, setAudio] = useState<ChapterAudio | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // player
  const elRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [playError, setPlayError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resumed, setResumed] = useState(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const lastTimeRef = useRef(0);
  // Key whose media is actually loaded in the element; writes only go there.
  const loadedKeyRef = useRef<string | null>(null);

  // manage
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const storageKey = audio && chapterId ? `spektrum:audio-pos:${uid}:${chapterId}:${audio.id}` : null;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!chapterId) return;
    setStatus("loading");
    try {
      const a = await getChapterAudio(chapterId);
      if (signal?.cancelled) return;
      setAudio(a);
      setStatus("ready");
    } catch {
      if (!signal?.cancelled) setStatus("error");
    }
  }, [chapterId, uid]);

  useEffect(() => {
    const sig = { cancelled: false };
    setAudio(null); setPendingFile(null); setRights(false); setConfirmRemove(false); setManageError(null);
    if (chapterId) load(sig);
    return () => { sig.cancelled = true; abortRef.current?.abort(); };
  }, [chapterId, load]);

  const writePos = useCallback((key: string | null, pos: number) => {
    if (!key || key !== storageKeyRef.current) return;
    try { localStorage.setItem(key, String(Math.floor(pos))); } catch { /* storage unavailable */ }
  }, []);

  // Reset player state & persist/pause when audio identity or user changes / unmount
  useEffect(() => {
    setPlaying(false); setTime(0); setDuration(0); setPlayError(false); setResumed(false);
    pendingSeekRef.current = null;
    loadedKeyRef.current = null;
    lastTimeRef.current = 0;
    const key = storageKey;
    return () => {
      // Capture outgoing key/position before the next identity takes over.
      const pos = lastTimeRef.current;
      if (key && pos > 0) { try { localStorage.setItem(key, String(Math.floor(pos))); } catch { /* ignore */ } }
      loadedKeyRef.current = null;
      elRef.current?.pause();
    };
  }, [storageKey, writePos]);

  useEffect(() => { if (elRef.current) elRef.current.playbackRate = speed; }, [speed, audio?.playbackUrl]);

  const onLoadedMetadata = () => {
    const el = elRef.current; if (!el) return;
    setDuration(el.duration || 0);
    el.playbackRate = speed;
    let target = pendingSeekRef.current;
    if (target == null && storageKeyRef.current) {
      try { const v = Number(localStorage.getItem(storageKeyRef.current)); if (v > 0) { target = v; setResumed(true); } } catch { /* ignore */ }
    }
    pendingSeekRef.current = null;
    loadedKeyRef.current = storageKeyRef.current;
    if (target != null && target > 0 && (!el.duration || target < el.duration - 2)) { el.currentTime = target; setTime(target); }
  };

  const onTimeUpdate = () => {
    const el = elRef.current; if (!el) return;
    setTime(el.currentTime);
    if (!loadedKeyRef.current) return;
    lastTimeRef.current = el.currentTime;
    const now = Date.now();
    if (now - lastWriteRef.current > 5000) { lastWriteRef.current = now; writePos(loadedKeyRef.current, el.currentTime); }
  };

  const togglePlay = async () => {
    const el = elRef.current; if (!el) return;
    if (el.paused) {
      try { await el.play(); } catch (e) { if (!isAbort(e)) { pendingSeekRef.current = el.currentTime; setPlayError(true); } }
    } else el.pause();
  };
  const skip = (d: number) => {
    const el = elRef.current; if (!el) return;
    el.currentTime = Math.max(0, Math.min((el.duration || Infinity) - 0.25, el.currentTime + d));
    setTime(el.currentTime);
  };
  const cycleSpeed = () => setSpeed(s => SPEEDS[(SPEEDS.indexOf(s as typeof SPEEDS[number]) + 1) % SPEEDS.length]);

  const onMediaError = () => {
    const el = elRef.current;
    pendingSeekRef.current = el && el.currentTime > 0 ? el.currentTime : (pendingSeekRef.current ?? time);
    setPlaying(false); setPlayError(true);
  };

  const retryPlayback = async () => {
    if (!chapterId) return;
    setRefreshing(true);
    const keep = pendingSeekRef.current ?? time;
    try {
      const fresh = await getChapterAudio(chapterId);
      if (fresh && audio && fresh.id === audio.id) {
        pendingSeekRef.current = keep;
        if (fresh.playbackUrl === audio.playbackUrl) elRef.current?.load();
        setAudio(fresh);
      } else {
        setAudio(fresh);
      }
      setPlayError(false);
    } catch {
      setPlayError(true);
    } finally { setRefreshing(false); }
  };

  // ── manage ──
  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    setManageError(null);
    if (!f) return;
    if (!ALLOWED_EXT.test(f.name) || !ALLOWED_MIME.includes(f.type)) { setManageError(t("Yalnızca MP3 veya M4A dosyaları yüklenebilir.")); return; }
    if (f.size > MAX_BYTES) { setManageError(t("Dosya 100 MB sınırını aşıyor.")); return; }
    setPendingFile(f); setRights(false); setConfirmRemove(false);
  };

  const doUpload = async () => {
    if (!chapterId || !pendingFile || !rights) return;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const replacing = !!audio;
    setProgress(0); setManageError(null);
    try {
      const next = await uploadChapterAudio(chapterId, pendingFile, audio?.id ?? null, p => setProgress(Math.max(0, Math.min(100, Math.round(p)))), ctrl.signal);
      setAudio(next); setPendingFile(null); setRights(false);
      toast({ title: t(replacing ? "Sesli bölüm güncellendi" : "Sesli bölüm yüklendi") });
    } catch (e) {
      if (isAbort(e) || ctrl.signal.aborted) { setManageError(t("Yükleme iptal edildi.")); void load(); }
      else if (isConflict(e)) { setManageError(t("Ses başka bir yerde değiştirilmiş. Güncel hali yüklendi; lütfen kontrol edip tekrar dene.")); setRights(false); load(); }
      else { setManageError(t(e instanceof Error ? e.message : "Yükleme sonucu doğrulanamadı. Güncel sesi kontrol et.")); void load(); }
    } finally { setProgress(null); abortRef.current = null; }
  };

  const doRemove = async () => {
    if (!chapterId || !audio) return;
    setRemoving(true); setManageError(null);
    try {
      elRef.current?.pause();
      await removeChapterAudio(chapterId, audio.id);
      try { if (storageKey) localStorage.removeItem(storageKey); } catch { /* ignore */ }
      setAudio(null); setConfirmRemove(false);
      toast({ title: t("Sesli bölüm kaldırıldı") });
    } catch (e) {
      if (isConflict(e)) { setManageError(t("Ses başka bir yerde değiştirilmiş. Güncel hali yüklendi; lütfen kontrol edip tekrar dene.")); load(); }
      else setManageError(t("Ses kaldırılamadı."));
      setConfirmRemove(false);
    } finally { setRemoving(false); }
  };

  // ── render ──
  if (!chapterId && !canManage) return null;

  if (!chapterId) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground" data-testid="text-audio-save-first">
        <Headphones className="w-4 h-4 shrink-0" />
        <span>{t("Sesli bölüm eklemek için önce taslağı kaydet.")}</span>
      </div>
    );
  }

  const shell = "rounded-xl border border-border bg-card/60 p-4 space-y-3";

  if (status === "loading") {
    return (
      <div className={canManage ? shell : "flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3"} data-testid="status-audio-loading">
        <Headphones className="w-4 h-4 text-muted-foreground animate-pulse" />
        <div className="h-3 w-40 rounded bg-muted animate-pulse" />
        <span className="sr-only">{t("Sesli bölüm yükleniyor…")}</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm text-muted-foreground" data-testid="status-audio-error">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="flex-1">{t("Sesli bölüm yüklenemedi.")}</span>
        <button type="button" onClick={() => load()} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:text-primary transition-colors" data-testid="button-audio-reload">
          <RefreshCw className="w-3.5 h-3.5" /> {t("Tekrar dene")}
        </button>
      </div>
    );
  }

  if (!audio && !canManage) return null;

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const uploading = progress !== null;

  return (
    <section className={shell} data-testid="section-chapter-audio" aria-label={t("Sesli Bölüm")}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Headphones className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{audio ? t("Bu bölümü dinle") : t("Sesli Bölüm")}</p>
          {audio && canManage && (
            <p className="text-xs text-muted-foreground truncate" data-testid="text-audio-filename">{audio.fileName} · {fmtSize(audio.sizeBytes)}</p>
          )}
        </div>
      </div>

      {audio && (
        <div className="space-y-2">
          <audio
            ref={elRef}
            src={audio.playbackUrl}
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onDurationChange={() => setDuration(elRef.current?.duration || 0)}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => { setPlaying(true); setPlayError(false); }}
            onPause={() => { setPlaying(false); if (elRef.current && loadedKeyRef.current) writePos(loadedKeyRef.current, elRef.current.currentTime); }}
            onEnded={() => { setPlaying(false); lastTimeRef.current = 0; writePos(loadedKeyRef.current, 0); }}
            onError={onMediaError}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => skip(-15)} aria-label={t("15 saniye geri")} title={t("15 saniye geri")} disabled={playError}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40" data-testid="button-audio-back15">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button type="button" onClick={togglePlay} aria-label={t(playing ? "Duraklat" : "Oynat")} disabled={playError}
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.35)] disabled:opacity-40" data-testid="button-audio-play">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button type="button" onClick={() => skip(15)} aria-label={t("15 saniye ileri")} title={t("15 saniye ileri")} disabled={playError}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40" data-testid="button-audio-forward15">
              <RotateCw className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 px-1">
              <input
                type="range" min={0} max={duration || 0} step={1} value={Math.min(time, duration || 0)}
                onChange={e => { const el = elRef.current; if (el) { el.currentTime = Number(e.target.value); setTime(el.currentTime); } }}
                aria-label={t("Konum")} disabled={!duration || playError}
                className="w-full accent-[hsl(var(--primary))] h-1.5 cursor-pointer disabled:cursor-default"
                style={{ backgroundSize: `${pct}% 100%` }}
                data-testid="input-audio-seek"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span data-testid="text-audio-time">{fmtTime(time)}</span>
                <span data-testid="text-audio-duration">{fmtTime(duration)}</span>
              </div>
            </div>
            <button type="button" onClick={cycleSpeed} aria-label={t("Oynatma hızı")} title={t("Oynatma hızı")}
              className="min-w-[3.25rem] h-8 px-2 rounded-lg border border-border text-xs font-semibold tabular-nums hover:border-primary/50 hover:text-primary transition-colors" data-testid="button-audio-speed">
              {speed}×
            </button>
          </div>
          {resumed && !playing && time > 0 && !playError && (
            <p className="text-xs text-muted-foreground" data-testid="text-audio-resumed">{t("Kaldığın yerden devam edebilirsin.")}</p>
          )}
          {playError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400" data-testid="status-audio-playback-error">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p>{t("Ses oynatılamadı. Bağlantı yenilenip kaldığın yerden devam edilecek.")}</p>
                <button type="button" onClick={retryPlayback} disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 hover:bg-amber-500/10 font-medium disabled:opacity-60" data-testid="button-audio-retry">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? t("Bağlantı yenileniyor…") : t("Bağlantıyı yenile ve tekrar dene")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <div className="space-y-3 pt-1 border-t border-border/60">
          {!audio && (
            <p className="text-xs text-muted-foreground pt-3" data-testid="text-audio-empty">{t("Bu bölüm için henüz ses dosyası yok.")}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1 pt-2">
            <Info className="w-3 h-3 shrink-0" /> {t("Hazır bir MP3 veya M4A dosyası yükle (en fazla 100 MB).")}
          </p>
          <input ref={fileInputRef} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" className="hidden" onChange={pickFile} data-testid="input-audio-file" />

          {!pendingFile && !uploading && !confirmRemove && (
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={removing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border bg-card border-border hover:border-primary/50 hover:text-primary transition-all" data-testid="button-audio-choose">
                <Upload className="w-4 h-4" /> {audio ? t("Dosyayı değiştir") : t("Ses dosyası seç")}
              </button>
              {audio && (
                <button type="button" onClick={() => { setConfirmRemove(true); setManageError(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-border text-muted-foreground hover:border-red-500/50 hover:text-red-400 transition-all" data-testid="button-audio-remove">
                  <Trash2 className="w-4 h-4" /> {t("Sesi kaldır")}
                </button>
              )}
            </div>
          )}

          {pendingFile && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3" data-testid="panel-audio-upload">
              <div className="flex items-center gap-2 text-sm">
                <FileAudio className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate flex-1" data-testid="text-audio-pending-name">{pendingFile.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{fmtSize(pendingFile.size)}</span>
              </div>
              {audio && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5" data-testid="text-audio-replace-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {t("Mevcut ses, yükleme başarıyla tamamlandığında yenisiyle değiştirilecek.")}
                </p>
              )}
              <label className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer">
                <input type="checkbox" checked={rights} disabled={uploading} onChange={e => setRights(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-audio-rights" />
                <span>{t("Bu ses kaydını yayınlama hakkına sahip olduğumu ve başkalarının telif haklarını ihlal etmediğini onaylıyorum.")}</span>
              </label>
              {uploading ? (
                <div className="space-y-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary origin-left transition-transform" style={{ transform: `scaleX(${(progress ?? 0) / 100})` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-audio-progress">{t("Yükleniyor… %{percent}").replace("%{percent}", `%${progress}`)}</span>
                    <button type="button" onClick={() => abortRef.current?.abort()}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-red-500/50 hover:text-red-400" data-testid="button-audio-cancel-upload">
                      <X className="w-3.5 h-3.5" /> {t("Yüklemeyi iptal et")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={doUpload} disabled={!rights}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50" data-testid="button-audio-upload">
                    {t("Yükle")}
                  </button>
                  <button type="button" onClick={() => { setPendingFile(null); setRights(false); }}
                    className="px-4 py-2 rounded-xl border border-border text-sm hover:border-primary/50" data-testid="button-audio-cancel-pick">
                    {t("Vazgeç")}
                  </button>
                </div>
              )}
            </div>
          )}

          {confirmRemove && audio && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2" data-testid="panel-audio-remove-confirm">
              <p className="text-sm font-semibold text-red-400">{t("Sesi kaldırmak istediğine emin misin?")}</p>
              <p className="text-xs text-muted-foreground">{t("Bu işlem geri alınamaz. Okuyucular bu bölümü artık dinleyemez.")}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={doRemove} disabled={removing}
                  className="px-4 py-2 rounded-xl bg-red-500/90 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-60" data-testid="button-audio-remove-confirm">
                  {removing ? t("Kaldırılıyor…") : t("Evet, kaldır")}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={removing}
                  className="px-4 py-2 rounded-xl border border-border text-sm hover:border-primary/50" data-testid="button-audio-remove-cancel">
                  {t("Vazgeç")}
                </button>
              </div>
            </div>
          )}

          {manageError && (
            <p className="text-xs text-red-400 flex items-start gap-1.5" data-testid="status-audio-manage-error">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {manageError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
