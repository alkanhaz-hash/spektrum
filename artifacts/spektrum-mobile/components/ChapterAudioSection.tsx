import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioSource } from "expo-audio";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getChapterAudio, uploadChapterAudio, removeChapterAudio, type ChapterAudio } from "@/lib/chapter-audio";

interface Props { chapterId?: string; canManage?: boolean }

const MAX_BYTES = 100 * 1024 * 1024;
const SPEEDS = [1, 1.25, 1.5, 2] as const;
const ALLOWED_EXT = /\.(mp3|m4a)$/i;
const ALLOWED_MIME = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"];
// Keep author upload controls hidden in the test candidate until Firebase Storage writes are verified.
const CHAPTER_AUDIO_UPLOAD_ENABLED = false;

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h ? h + ":" : ""}${h ? String(m).padStart(2, "0") : m}:${String(sec).padStart(2, "0")}`;
}
function fmtSize(b?: number | null) { return b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : ""; }
function isConflict(e: unknown) {
  const err = e as { code?: string; status?: number; message?: string } | null;
  return err?.status === 409 || /conflict|version/i.test(String(err?.code ?? "")) || /conflict|409/i.test(String(err?.message ?? ""));
}
function isAbort(e: unknown) {
  const err = e as { name?: string; code?: string } | null;
  return err?.name === "AbortError" || err?.code === "aborted";
}

export default function ChapterAudioSection(props: Props) {
  const { user } = useAuth();
  return <ChapterAudioBody key={`${user?.uid ?? "guest"}:${props.chapterId ?? "new"}`} {...props} />;
}

function ChapterAudioBody({ chapterId, canManage: requestedCanManage = false }: Props) {
  const canManage = requestedCanManage && CHAPTER_AUDIO_UPLOAD_ENABLED;
  const colors = useColors();
  const { t } = useLocale();
  const { user } = useAuth();
  const uid = user?.uid ?? "guest";

  const [audio, setAudio] = useState<ChapterAudio | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const source = useMemo<AudioSource>(() => (audio ? { uri: audio.playbackUrl } : null), [audio?.playbackUrl]);
  const player = useAudioPlayer(source, { updateInterval: 500 });
  const ps = useAudioPlayerStatus(player);

  const [speed, setSpeed] = useState<number>(1);
  const [playError, setPlayError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resumed, setResumed] = useState(false);
  const restoredRef = useRef(false);
  const [savedPos, setSavedPos] = useState<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const lastTimeRef = useRef(0);
  const wantPlayRef = useRef<number | null>(null);

  const [pendingFile, setPendingFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [removing, setRemoving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const storageKey = audio && chapterId ? `spektrum:audio-pos:${uid}:${chapterId}:${audio.id}` : null;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const load = useCallback(async (sig?: { cancelled: boolean }) => {
    if (!chapterId) return;
    setStatus("loading");
    try {
      const a = await getChapterAudio(chapterId);
      if (sig?.cancelled) return;
      setAudio(a); setStatus("ready");
    } catch {
      if (!sig?.cancelled) setStatus("error");
    }
  }, [chapterId, uid]);

  useEffect(() => {
    const sig = { cancelled: false };
    setAudio(null); setPendingFile(null); setRights(false); setManageError(null);
    if (chapterId) load(sig);
    return () => { sig.cancelled = true; abortRef.current?.abort(); };
  }, [chapterId, load]);

  const writePos = useCallback((key: string | null, pos: number) => {
    if (!key || key !== storageKeyRef.current) return;
    AsyncStorage.setItem(key, String(Math.floor(pos))).catch(() => {});
  }, []);

  // Per audio identity: read stored position, persist + pause on change/unmount
  useEffect(() => {
    restoredRef.current = false; setSavedPos(null); setResumed(false); setPlayError(false);
    lastTimeRef.current = 0;
    const key = storageKey;
    let cancelled = false;
    if (key) AsyncStorage.getItem(key).then(v => { if (!cancelled) setSavedPos(Number(v) || 0); }).catch(() => { if (!cancelled) setSavedPos(0); });
    return () => {
      cancelled = true;
      // Capture outgoing key/position; write directly so a new key can't receive it.
      const pos = lastTimeRef.current;
      if (key && pos > 0) AsyncStorage.setItem(key, String(Math.floor(pos))).catch(() => {});
      restoredRef.current = false;
      try { player.pause(); } catch { /* player released */ }
      try { player.setActiveForLockScreen(false); } catch { /* not supported / released */ }
      try { player.clearLockScreenControls(); } catch { /* not supported / released */ }
    };
  }, [storageKey, player, writePos]);

  // Restore after load (metadata ready)
  useEffect(() => {
    if (!ps.isLoaded || restoredRef.current) return;
    const target = pendingSeekRef.current ?? savedPos;
    if (target == null && storageKey) return; // wait for AsyncStorage
    restoredRef.current = true;
    pendingSeekRef.current = null;
    try { player.setPlaybackRate(speed); } catch { /* ignore */ }
    if (target && target > 0 && (!ps.duration || target < ps.duration - 2)) {
      player.seekTo(target).catch(() => {});
      setResumed(true);
    }
  }, [ps.isLoaded, ps.duration, player, speed, storageKey, savedPos]);

  // Throttled position writes + error detection
  useEffect(() => {
    // Ignore status until the current identity has loaded and restored, so the
    // previous file's position can never be written under the new key.
    if (/fail|error/i.test(ps.playbackState ?? "")) {
      pendingSeekRef.current = lastTimeRef.current;
      setPlayError(true);
    }
    if (!restoredRef.current) return;
    if (ps.currentTime > 0) lastTimeRef.current = ps.currentTime;
    const now = Date.now();
    if (ps.playing && now - lastWriteRef.current > 5000) { lastWriteRef.current = now; writePos(storageKeyRef.current, ps.currentTime); }
    if (ps.didJustFinish) writePos(storageKeyRef.current, 0);
  }, [ps.currentTime, ps.playing, ps.didJustFinish, ps.playbackState, writePos]);

  // If user pressed play but nothing loads within 15s, treat as a playback/network error
  useEffect(() => {
    if (ps.playing || ps.isLoaded) { wantPlayRef.current = null; return; }
    if (wantPlayRef.current == null) return;
    const id = setTimeout(() => { if (wantPlayRef.current != null) { pendingSeekRef.current = lastTimeRef.current; setPlayError(true); wantPlayRef.current = null; } }, 15000);
    return () => clearTimeout(id);
  }, [ps.playing, ps.isLoaded]);

  const togglePlay = async () => {
    if (ps.playing) { player.pause(); if (restoredRef.current) writePos(storageKeyRef.current, ps.currentTime); return; }
    wantPlayRef.current = Date.now();
    // Background audio is only enabled once the user starts playback.
    try { await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }); } catch { /* keep foreground playback */ }
    try { player.setPlaybackRate(speed); player.play(); } catch { setPlayError(true); return; }
    if (audio) {
      try { player.setActiveForLockScreen(true, { title: audio.fileName, artist: "SPEKTRUM" }); } catch { /* lock screen unsupported here */ }
    }
  };
  const skip = (d: number) => {
    const max = ps.duration ? ps.duration - 0.25 : Number.MAX_SAFE_INTEGER;
    player.seekTo(Math.max(0, Math.min(max, ps.currentTime + d))).catch(() => {});
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as typeof SPEEDS[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    try { player.setPlaybackRate(next); } catch { /* ignore */ }
  };

  const retryPlayback = async () => {
    if (!chapterId) return;
    setRefreshing(true);
    const keep = pendingSeekRef.current ?? lastTimeRef.current;
    try {
      const fresh = await getChapterAudio(chapterId);
      if (fresh && audio && fresh.id === audio.id) {
        pendingSeekRef.current = keep;
        restoredRef.current = false;
        if (fresh.playbackUrl === audio.playbackUrl) player.replace({ uri: fresh.playbackUrl });
      }
      setAudio(fresh);
      setPlayError(false);
    } catch {
      setPlayError(true);
    } finally { setRefreshing(false); }
  };

  const pickFile = async () => {
    setManageError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const f = res.assets[0];
      const mimeOk = !f.mimeType || ALLOWED_MIME.includes(f.mimeType);
      if (!ALLOWED_EXT.test(f.name) || !mimeOk) { setManageError(t("Yalnızca MP3 veya M4A dosyaları yüklenebilir.")); return; }
      if ((f.size ?? 0) > MAX_BYTES) { setManageError(t("Dosya 100 MB sınırını aşıyor.")); return; }
      setPendingFile(f); setRights(false);
    } catch {
      setManageError(t("Dosya seçilemedi."));
    }
  };

  const chooseFile = () => {
    if (!audio) { pickFile(); return; }
    if (Platform.OS === "web") {
      if (window.confirm(`${t("Mevcut sesi değiştir?")}\n\n${t("Yeni dosya yüklendiğinde mevcut ses kalıcı olarak değiştirilecek.")}`)) void pickFile();
      return;
    }
    Alert.alert(t("Mevcut sesi değiştir?"), t("Yeni dosya yüklendiğinde mevcut ses kalıcı olarak değiştirilecek."), [
      { text: t("Vazgeç"), style: "cancel" },
      { text: t("Devam et"), onPress: () => { pickFile(); } },
    ]);
  };

  const doUpload = async () => {
    if (!chapterId || !pendingFile || !rights) return;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const replacing = !!audio;
    setProgress(0); setManageError(null);
    try {
      const next = await uploadChapterAudio(chapterId, pendingFile, audio?.id ?? null, p => setProgress(Math.max(0, Math.min(100, Math.round(p)))), ctrl.signal);
      setAudio(next); setPendingFile(null); setRights(false);
      Alert.alert(t(replacing ? "Sesli bölüm güncellendi" : "Sesli bölüm yüklendi"));
    } catch (e) {
      if (isAbort(e) || ctrl.signal.aborted) { setManageError(t("Yükleme iptal edildi.")); void load(); }
      else if (isConflict(e)) { setManageError(t("Ses başka bir yerde değiştirilmiş. Güncel hali yüklendi; lütfen kontrol edip tekrar dene.")); setRights(false); load(); }
      else { setManageError(t(e instanceof Error ? e.message : "Yükleme sonucu doğrulanamadı. Güncel sesi kontrol et.")); void load(); }
    } finally { setProgress(null); abortRef.current = null; }
  };

  const confirmRemove = () => {
    if (!audio) return;
    if (Platform.OS === "web") {
      if (window.confirm(`${t("Sesi kaldırmak istediğine emin misin?")}\n\n${t("Bu işlem geri alınamaz. Okuyucular bu bölümü artık dinleyemez.")}`)) void doRemove();
      return;
    }
    Alert.alert(t("Sesi kaldırmak istediğine emin misin?"), t("Bu işlem geri alınamaz. Okuyucular bu bölümü artık dinleyemez."), [
      { text: t("Vazgeç"), style: "cancel" },
      { text: t("Evet, kaldır"), style: "destructive", onPress: () => { doRemove(); } },
    ]);
  };
  const doRemove = async () => {
    if (!chapterId || !audio) return;
    setRemoving(true); setManageError(null);
    try {
      try { player.pause(); } catch { /* ignore */ }
      await removeChapterAudio(chapterId, audio.id);
      if (storageKey) AsyncStorage.removeItem(storageKey).catch(() => {});
      setAudio(null);
      Alert.alert(t("Sesli bölüm kaldırıldı"));
    } catch (e) {
      if (isConflict(e)) { setManageError(t("Ses başka bir yerde değiştirilmiş. Güncel hali yüklendi; lütfen kontrol edip tekrar dene.")); load(); }
      else setManageError(t("Ses kaldırılamadı."));
    } finally { setRemoving(false); }
  };

  if (!chapterId && !canManage) return null;

  if (!chapterId) {
    return (
      <View style={[s.note, { borderColor: colors.border }]} testID="text-audio-save-first">
        <Feather name="headphones" size={15} color={colors.mutedForeground} />
        <Text style={[s.small, { color: colors.mutedForeground, flex: 1 }]}>{t("Sesli bölüm eklemek için önce taslağı kaydet.")}</Text>
      </View>
    );
  }

  if (status === "loading") {
    return (
      <View style={[s.note, { borderColor: colors.border }]} testID="status-audio-loading" accessibilityLabel={t("Sesli bölüm yükleniyor…")}>
        <Feather name="headphones" size={15} color={colors.mutedForeground} />
        <View style={[s.skel, { backgroundColor: colors.muted }]} />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[s.note, { borderColor: colors.border }]} testID="status-audio-error">
        <Feather name="alert-triangle" size={15} color="#f59e0b" />
        <Text style={[s.small, { color: colors.mutedForeground, flex: 1 }]}>{t("Sesli bölüm yüklenemedi.")}</Text>
        <TouchableOpacity onPress={() => load()} style={[s.chip, { borderColor: colors.border }]} testID="button-audio-reload">
          <Feather name="refresh-cw" size={13} color={colors.primary} />
          <Text style={[s.chipText, { color: colors.primary }]}>{t("Tekrar dene")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!audio && !canManage) return null;

  const duration = ps.duration || 0;
  const cur = Math.min(ps.currentTime || 0, duration || Number.MAX_SAFE_INTEGER);
  const pct = duration > 0 ? Math.min(1, cur / duration) : 0;
  const uploading = progress !== null;
  const loadingAudio = !!audio && !ps.isLoaded && !playError;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="section-chapter-audio">
      <View style={s.row}>
        <View style={[s.iconBox, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}>
          <Feather name="headphones" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>{audio ? t("Bu bölümü dinle") : t("Sesli Bölüm")}</Text>
          {audio && canManage && (
            <Text style={[s.small, { color: colors.mutedForeground }]} numberOfLines={1} testID="text-audio-filename">{audio.fileName} · {fmtSize(audio.sizeBytes)}</Text>
          )}
        </View>
      </View>

      {audio && (
        <View style={{ gap: 8 }}>
          <View style={s.row}>
            <TouchableOpacity onPress={() => skip(-15)} disabled={playError || !ps.isLoaded} accessibilityLabel={t("15 saniye geri")}
              style={[s.roundBtn, { borderColor: colors.border, opacity: playError || !ps.isLoaded ? 0.4 : 1 }]} testID="button-audio-back15">
              <Feather name="rotate-ccw" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlay} disabled={playError} accessibilityLabel={t(ps.playing ? "Duraklat" : "Oynat")}
              style={[s.playBtn, { backgroundColor: colors.primary, opacity: playError ? 0.4 : 1 }]} testID="button-audio-play">
              {ps.isBuffering && ps.playing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={ps.playing ? "pause" : "play"} size={20} color="#fff" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => skip(15)} disabled={playError || !ps.isLoaded} accessibilityLabel={t("15 saniye ileri")}
              style={[s.roundBtn, { borderColor: colors.border, opacity: playError || !ps.isLoaded ? 0.4 : 1 }]} testID="button-audio-forward15">
              <Feather name="rotate-cw" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={cycleSpeed} accessibilityLabel={t("Oynatma hızı")} style={[s.speedBtn, { borderColor: colors.border }]} testID="button-audio-speed">
              <Text style={[s.chipText, { color: colors.foreground }]}>{speed}×</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.track, { backgroundColor: colors.muted }]} accessibilityLabel={t("Konum")}>
            <View style={[s.fill, { backgroundColor: colors.primary, width: `${pct * 100}%` }]} />
          </View>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={[s.small, { color: colors.mutedForeground }]} testID="text-audio-time">{fmtTime(cur)}</Text>
            {loadingAudio ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
            <Text style={[s.small, { color: colors.mutedForeground }]} testID="text-audio-duration">{fmtTime(duration)}</Text>
          </View>
          {resumed && !ps.playing && !playError && (
            <Text style={[s.small, { color: colors.mutedForeground }]} testID="text-audio-resumed">{t("Kaldığın yerden devam edebilirsin.")}</Text>
          )}
          {playError && (
            <View style={[s.warn, { borderColor: "#f59e0b40", backgroundColor: "#f59e0b12" }]} testID="status-audio-playback-error">
              <Text style={[s.small, { color: "#b45309" }]}>{t("Ses oynatılamadı. Bağlantı yenilenip kaldığın yerden devam edilecek.")}</Text>
              <TouchableOpacity onPress={retryPlayback} disabled={refreshing} style={[s.chip, { borderColor: "#f59e0b60", alignSelf: "flex-start" }]} testID="button-audio-retry">
                {refreshing ? <ActivityIndicator size="small" color="#b45309" /> : <Feather name="refresh-cw" size={13} color="#b45309" />}
                <Text style={[s.chipText, { color: "#b45309" }]}>{refreshing ? t("Bağlantı yenileniyor…") : t("Bağlantıyı yenile ve tekrar dene")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {canManage && (
        <View style={[s.manage, { borderTopColor: colors.border }]}>
          {!audio && <Text style={[s.small, { color: colors.mutedForeground }]} testID="text-audio-empty">{t("Bu bölüm için henüz ses dosyası yok.")}</Text>}
          <Text style={[s.small, { color: colors.mutedForeground }]}>{t("Hazır bir MP3 veya M4A dosyası yükle (en fazla 100 MB).")}</Text>

          {!pendingFile && !uploading && (
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <TouchableOpacity onPress={chooseFile} disabled={removing} style={[s.btn, { borderColor: colors.border }]} testID="button-audio-choose">
                <Feather name="upload" size={15} color={colors.primary} />
                <Text style={[s.btnText, { color: colors.primary }]}>{audio ? t("Dosyayı değiştir") : t("Ses dosyası seç")}</Text>
              </TouchableOpacity>
              {audio && (
                <TouchableOpacity onPress={confirmRemove} disabled={removing} style={[s.btn, { borderColor: colors.border }]} testID="button-audio-remove">
                  {removing ? <ActivityIndicator size="small" color="#ef4444" /> : <Feather name="trash-2" size={15} color="#ef4444" />}
                  <Text style={[s.btnText, { color: "#ef4444" }]}>{removing ? t("Kaldırılıyor…") : t("Sesi kaldır")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {pendingFile && (
            <View style={[s.panel, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "0d" }]} testID="panel-audio-upload">
              <View style={s.row}>
                <Feather name="file" size={15} color={colors.primary} />
                <Text style={[s.small, { color: colors.foreground, flex: 1 }]} numberOfLines={1} testID="text-audio-pending-name">{pendingFile.name}</Text>
                <Text style={[s.small, { color: colors.mutedForeground }]}>{fmtSize(pendingFile.size)}</Text>
              </View>
              {audio && <Text style={[s.small, { color: "#b45309" }]} testID="text-audio-replace-warning">{t("Mevcut ses, yükleme başarıyla tamamlandığında yenisiyle değiştirilecek.")}</Text>}
              <TouchableOpacity onPress={() => !uploading && setRights(r => !r)} style={[s.row, { alignItems: "flex-start" }]} accessibilityRole="checkbox" accessibilityState={{ checked: rights }} testID="checkbox-audio-rights">
                <View style={[s.check, { borderColor: rights ? colors.primary : colors.border, backgroundColor: rights ? colors.primary : "transparent" }]}>
                  {rights && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={[s.small, { color: colors.foreground, flex: 1, lineHeight: 17 }]}>{t("Bu ses kaydını yayınlama hakkına sahip olduğumu ve başkalarının telif haklarını ihlal etmediğini onaylıyorum.")}</Text>
              </TouchableOpacity>
              {uploading ? (
                <View style={{ gap: 8 }}>
                  <View style={[s.track, { backgroundColor: colors.muted }]}>
                    <View style={[s.fill, { backgroundColor: colors.primary, width: `${progress ?? 0}%` }]} />
                  </View>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <Text style={[s.small, { color: colors.mutedForeground }]} testID="text-audio-progress">{t("Yükleniyor… %{percent}").replace("%{percent}", `%${progress}`)}</Text>
                    <TouchableOpacity onPress={() => abortRef.current?.abort()} style={[s.chip, { borderColor: colors.border }]} testID="button-audio-cancel-upload">
                      <Feather name="x" size={13} color="#ef4444" />
                      <Text style={[s.chipText, { color: "#ef4444" }]}>{t("Yüklemeyi iptal et")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={s.row}>
                  <TouchableOpacity onPress={doUpload} disabled={!rights} style={[s.btn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: rights ? 1 : 0.5 }]} testID="button-audio-upload">
                    <Text style={[s.btnText, { color: "#fff" }]}>{t("Yükle")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setPendingFile(null); setRights(false); }} style={[s.btn, { borderColor: colors.border }]} testID="button-audio-cancel-pick">
                    <Text style={[s.btnText, { color: colors.foreground }]}>{t("Vazgeç")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {manageError && (
            <View style={s.row} testID="status-audio-manage-error">
              <Feather name="alert-triangle" size={13} color="#ef4444" />
              <Text style={[s.small, { color: "#ef4444", flex: 1 }]}>{manageError}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  note: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  skel: { height: 10, width: 140, borderRadius: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBox: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  small: { fontSize: 12, fontFamily: "Inter_400Regular" },
  roundBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  speedBtn: { minWidth: 52, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  warn: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  manage: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  panel: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
