import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { GENRES } from "@/lib/firestore-service";
import {
  IMPORT_LIMITS, pickImportFile, splitImportChapters, validateImportPreview, validateSource,
  type BookImportPreview, type BookImportSource,
} from "@/lib/book-import";
import { importBookDraft } from "@/lib/book-import-service";
import {
  clearImportRecovery, readImportRecovery, saveImportRecovery, type ImportRecovery,
} from "@/lib/book-import-recovery";

type Mode = "headings" | "separator" | "single";
type Row = { key: number; title: string; content: string };
type Stage = "file" | "preview" | "save";

const MODES: [Mode, string][] = [
  ["headings", "Başlıklara göre"],
  ["separator", "--- ile böl"],
  ["single", "Tek bölüm"],
];

const bytes = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
};
const fmt = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function BookImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid;

  const [pasteText, setPasteText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceKind, setSourceKind] = useState<BookImportSource>("paste");
  const [sourceLabel, setSourceLabel] = useState("");
  const [mode, setMode] = useState<Mode>("headings");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState<string>(GENRES[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("preview");
  const [notice, setNotice] = useState("");
  const [existingId, setExistingId] = useState("");

  const mounted = useRef(true);
  const activeUid = useRef(uid);
  activeUid.current = uid;
  const token = useRef(0);
  const savingRef = useRef(false);
  const keyRef = useRef(0);
  const snapshot = useRef<ImportRecovery | null>(null);
  const selections = useRef<Record<number, number>>({});

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; token.current++; }; }, []);

  const toRows = useCallback((list: { title: string; content: string }[]): Row[] =>
    list.map((c) => ({ ...c, key: keyRef.current++ })), []);

  // Oturum değişince her şeyi sıfırla ve kurtarmayı oku.
  useEffect(() => {
    const t = ++token.current;
    savingRef.current = false;
    snapshot.current = null;
    setSaving(false); setReading(false); setLocked(false);
    setSourceText(""); setSourceLabel(""); setRows([]); setTitle(""); setSummary(""); setGenre(GENRES[0]);
    setPasteText(""); setConsent(false); setError(""); setNotice(""); setExistingId(""); setDirty(false);
    if (!uid) { setRecovering(false); return; }
    setRecovering(true);
    (async () => {
      try {
        const rec = await readImportRecovery(uid);
        if (t !== token.current || !mounted.current) return;
        if (rec) {
          snapshot.current = rec;
          setSourceText(rec.sourceText); setSourceKind(rec.source);
          setSourceLabel("Kurtarılan aktarım");
          setRows(toRows(rec.preview.chapters));
          setTitle(rec.preview.title); setSummary(rec.preview.summary); setGenre(rec.preview.genre);
          setConsent(true); setLocked(true);
          setNotice("Yarım kalan aktarımın önizlemesi kurtarıldı. Yeniden deneme aynı metni kaydeder; düzenlemek için yeni aktarım başlat.");
        }
      } catch (e) {
        if (t === token.current && mounted.current) { setStage("file"); setError(msg(e, "Aktarım önizlemesi kurtarılamadı.")); }
      } finally {
        if (t === token.current && mounted.current) setRecovering(false);
      }
    })();
  }, [uid, toRows]);

  const resetSource = () => {
    snapshot.current = null;
    setLocked(false); setSourceText(""); setSourceLabel(""); setRows([]);
    setConsent(false); setDirty(false); setExistingId(""); setNotice("");
  };

  const applySource = (text: string, kind: BookImportSource, label: string, suggested: string) => {
    const normalized = validateSource(text);
    const list = splitImportChapters(normalized, mode);
    setSourceText(normalized); setSourceKind(kind); setSourceLabel(label);
    setRows(toRows(list)); setConsent(false); setDirty(false); setExistingId(""); setNotice(""); setError("");
    setTitle((t) => (t.trim() ? t : suggested));
  };

  const confirm = (title2: string, body: string, ok: string, onOk: () => void) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm(`${title2}\n${body}`)) onOk();
      return;
    }
    Alert.alert(title2, body, [{ text: "Vazgeç", style: "cancel" }, { text: ok, style: "destructive", onPress: onOk }]);
  };

  const pickFile = async () => {
    if (savingRef.current || reading || locked) return;
    const t = ++token.current;
    setReading(true); setError(""); setStage("file");
    try {
      const res = await pickImportFile();
      if (t !== token.current || !mounted.current) return;
      if (!res) return; // seçim iptal edildi
      applySource(res.text, res.source, res.source === "docx" ? "DOCX dosyası" : "TXT dosyası", res.suggestedTitle);
    } catch (e) {
      if (t !== token.current || !mounted.current) return;
      setError(msg(e, "Dosya okunamadı."));
    } finally {
      if (t === token.current && mounted.current) setReading(false);
    }
  };

  const previewPaste = () => {
    if (savingRef.current || locked) return;
    token.current++;
    setReading(false); setError(""); setStage("preview");
    try {
      if (!pasteText.trim()) throw new Error("Önce metni yapıştır ya da bir dosya seç.");
      applySource(pasteText, "paste", "Yapıştırılan metin", "");
    } catch (e) {
      setError(msg(e, "Metin işlenemedi."));
    }
  };

  const changeMode = (m: Mode) => {
    if (m === mode || savingRef.current || locked) return;
    const run = () => {
      setMode(m);
      if (!sourceText) return;
      try {
        setRows(toRows(splitImportChapters(sourceText, m)));
        setDirty(false); setConsent(false); setError("");
      } catch (e) { setError(msg(e, "Bölümlere ayrılamadı.")); }
    };
    if (dirty) confirm("Düzenlemeler sıfırlanacak", "Bölüm düzenlemelerin yeniden bölmeyle silinecek. Devam edilsin mi?", "Devam", run);
    else run();
  };

  const edit = (key: number, patch: Partial<Row>) => {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    setDirty(true); setError(""); setConsent(false);
  };

  const splitAt = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (rows.length >= IMPORT_LIMITS.chapters) { setError(`En fazla ${IMPORT_LIMITS.chapters} bölüm olabilir.`); return; }
    let pos = selections.current[row.key];
    if (pos === undefined || pos <= 0 || pos >= row.content.length) {
      // İmleç yoksa ortaya en yakın satır sonundan böl.
      const mid = Math.floor(row.content.length / 2);
      const after = row.content.indexOf("\n", mid);
      const before = row.content.lastIndexOf("\n", mid);
      pos = after >= 0 && (before < 0 || after - mid <= mid - before) ? after : before;
    }
    const a = pos > 0 ? row.content.slice(0, pos) : "";
    const b = pos > 0 ? row.content.slice(pos) : "";
    if (!a.trim() || !b.trim()) { setError("İmleci metnin ortasına koy; her iki bölümde de metin kalmalı."); return; }
    const next = [...rows];
    next.splice(index, 1, { ...row, content: a.replace(/\s+$/, "") },
      { key: keyRef.current++, title: `Bölüm ${index + 2}`, content: b.replace(/^\s+/, "") });
    setRows(next); setDirty(true); setError(""); setConsent(false);
  };

  const mergePrev = (index: number) => {
    const a = rows[index - 1], b = rows[index];
    if (!a || !b) return;
    const body = [a.content.trim(), `${b.title.trim()}\n\n${b.content}`.trim()].filter(Boolean).join("\n\n");
    const next = [...rows];
    next.splice(index - 1, 2, { ...a, content: body });
    setRows(next); setDirty(true); setError(""); setConsent(false);
  };

  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRows(next); setDirty(true);
  };

  const remove = (key: number) =>
    confirm("Bölüm kaldırılsın mı?", "Bu bölümün metni önizlemeden kaldırılacak.", "Kaldır", () => {
      setRows((r) => r.filter((x) => x.key !== key)); setDirty(true); setConsent(false);
    });

  const startOver = () =>
    confirm("Yeni aktarım başlatılsın mı?",
      "Kurtarma önizlemesi kaldırılacak. Daha önce kısmen kaydedilmiş bir taslak varsa silinmez, hikayelerinde kalabilir.", "Başlat", async () => {
        const u = activeUid.current;
        if (u) { try { await clearImportRecovery(u); } catch { /* bellek yine de temizlenir */ } }
        if (mounted.current && activeUid.current === u) resetSource();
      });

  const save = async () => {
    if (savingRef.current) return;
    setStage("preview");
    const preview: BookImportPreview = snapshot.current?.preview ?? {
      title: title.trim(), summary: summary.trim(), genre,
      chapters: rows.map((r) => ({ title: r.title.trim(), content: r.content })),
    };
    try {
      if (!uid) throw new Error("Kitap aktarmak için giriş yap.");
      if (!sourceText) throw new Error("Önce bir kaynak seç.");
      validateImportPreview(preview);
      if (!consent) throw new Error("Devam etmek için hak sahipliği onayını işaretle.");
    } catch (e) { setError(msg(e, "Önizleme geçersiz.")); return; }

    savingRef.current = true; setSaving(true); setError("");
    const startUid = uid!;
    try {
      if (!snapshot.current) {
        const snap: ImportRecovery = { sourceText, preview, source: sourceKind, consent: true };
        await saveImportRecovery(startUid, snap);
        if (activeUid.current !== startUid || !mounted.current) return;
        snapshot.current = snap;
      }
      setLocked(true);
      const req = snapshot.current;
      const res = await importBookDraft({ sourceText: req.sourceText, preview: req.preview, ownershipConfirmed: true });
      if (activeUid.current !== startUid || !mounted.current) return;
      try { await clearImportRecovery(startUid); } catch { /* tekrar denemede aynı taslağa çözülür */ }
      if (activeUid.current !== startUid || !mounted.current) return;
      snapshot.current = null; setLocked(false);
      if (res.alreadyImported) {
        setExistingId(res.storyId);
        setNotice("Bu metin daha önce aktarılmış. Mevcut taslağın açılır; değişikliklerin üzerine yazılmadı.");
      } else {
        const id = res.storyId;
        Alert.alert("Taslak kaydedildi", "Kitabın taslak olarak hesabına eklendi. Hiçbir şey yayımlanmadı.", [
          { text: "Taslağı aç", onPress: () => router.replace({ pathname: "/story-manage/[id]", params: { id } }) },
        ], { cancelable: false });
        router.replace({ pathname: "/story-manage/[id]", params: { id } });
      }
    } catch (e) {
      if (activeUid.current !== startUid || !mounted.current) return;
      setStage("save");
      const code = (e as { code?: string })?.code;
      const detail = code === "permission-denied"
        ? "Kayıt izni reddedildi (permission-denied). Hesap durumunu kontrol et."
        : code === "unavailable" || code === "deadline-exceeded"
          ? `Bağlantı kurulamadı (${code}). Bağlantını kontrol et.`
          : msg(e, "Aktarım kaydedilemedi.");
      setError(`${detail} Önizlemen korunuyor; aynı kaynakla yeniden denemek kopya oluşturmaz.`);
    } finally {
      if (activeUid.current === startUid) savingRef.current = false;
      if (mounted.current && activeUid.current === startUid) setSaving(false);
    }
  };

  const total = rows.reduce((s, r) => s + bytes(r.content), 0);
  const busy = saving || reading || locked;
  const fieldStyle = [s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];

  const Header = (
    <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/write")} disabled={saving} accessibilityRole="button" accessibilityLabel="Geri" testID="button-import-back" hitSlop={10}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: colors.foreground }]}>Kitabını Taşı</Text>
      <View style={{ width: 22 }} />
    </View>
  );

  if (!user) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background }]}>
        {Header}
        <View style={s.center}>
          <Feather name="lock" size={44} color={colors.mutedForeground} />
          <Text style={[s.h2, { color: colors.foreground }]}>Giriş gerekli</Text>
          <Text style={[s.small, { color: colors.mutedForeground, textAlign: "center" }]}>Kitap aktarmak için hesabınla giriş yapmalısın.</Text>
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")} accessibilityRole="button" testID="button-import-login">
            <Text style={s.primaryText}>Giriş Yap / Kayıt Ol</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.flex, { backgroundColor: colors.background }]}>
      {Header}
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <Text style={[s.small, { color: colors.mutedForeground }]}>
            TXT ya da DOCX dosyanı seç veya metni yapıştır; bölümleri kontrol et, taslak olarak kaydet.
          </Text>

          <View style={[s.infoBox, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "10" }]}>
            <Feather name="shield" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.small, { color: colors.mutedForeground }]}>Hiçbir şey otomatik yayımlanmaz; her şey taslak olarak kaydedilir.</Text>
              <Text style={[s.small, { color: colors.mutedForeground }]}>Başka platformların şifresi istenmez, hiçbir siteden içerik çekilmez.</Text>
              <Text style={[s.small, { color: colors.mutedForeground }]}>Dosyan cihazında kalır; yalnızca onayladığın metin kaydedilir. Kaydetmeye başlayınca önizleme bu cihazda kurtarma kaydı olarak tutulur.</Text>
            </View>
          </View>

          {recovering ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => <View key={i} style={[s.skeleton, { backgroundColor: colors.muted }]} />)}
            </View>
          ) : (
            <>
              <Text style={[s.h2, { color: colors.foreground }]}>1. Kaynak</Text>
              <Text style={[s.label, { color: colors.mutedForeground }]}>Bölüm ayrımı</Text>
              <View style={[s.segment, { borderColor: colors.border }]}>
                {MODES.map(([m, label]) => (
                  <TouchableOpacity key={m} onPress={() => changeMode(m)} disabled={busy}
                    accessibilityRole="button" accessibilityState={{ selected: mode === m, disabled: busy }} accessibilityLabel={label} testID={`button-mode-${m}`}
                    style={[s.segItem, mode === m && { backgroundColor: colors.primary }]}>
                    <Text style={[s.segText, { color: mode === m ? "#fff" : colors.mutedForeground }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={pickFile} disabled={busy} accessibilityRole="button" accessibilityLabel="TXT veya DOCX dosyası seç" testID="button-import-file"
                style={[s.drop, { borderColor: colors.border, backgroundColor: colors.card, opacity: busy ? 0.6 : 1 }]}>
                {reading ? <ActivityIndicator color={colors.primary} /> : <Feather name="upload" size={24} color={colors.mutedForeground} />}
                <Text style={[s.dropTitle, { color: colors.foreground }]}>{reading ? "Dosya okunuyor..." : "TXT veya DOCX seç"}</Text>
                <Text style={[s.tiny, { color: colors.mutedForeground, textAlign: "center" }]}>DOCX'ten yalnızca metin alınır; görseller ve biçimlendirme aktarılmaz.</Text>
              </TouchableOpacity>

              <TextInput style={[...fieldStyle, s.area]} multiline editable={!busy} value={pasteText} onChangeText={setPasteText}
                placeholder="Ya da metni buraya yapıştır..." placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Yapıştırılacak kitap metni" testID="input-import-paste" textAlignVertical="top" />
              <TouchableOpacity onPress={previewPaste} disabled={busy || !pasteText.trim()} accessibilityRole="button" testID="button-import-paste"
                style={[s.outlineBtn, { borderColor: colors.primary, opacity: busy || !pasteText.trim() ? 0.5 : 1 }]}>
                <Text style={[s.outlineText, { color: colors.primary }]}>Yapıştırılan metni önizle</Text>
              </TouchableOpacity>
              <Text style={[s.tiny, { color: colors.mutedForeground }]} testID="text-import-limits">
                Sınırlar: dosya en fazla 5 MB, metin en fazla 2 MB, bölüm en fazla 200 KB, en fazla 50 bölüm.
              </Text>

              {locked && !saving && (
                <View style={[s.infoBox, { borderColor: colors.border, flexDirection: "column", alignItems: "stretch" }]} accessibilityRole="summary">
                  <Text style={[s.small, { color: colors.foreground }]}>Aktarımın metni yeniden deneme için sabitlendi. Aynı önizleme korunacak.</Text>
                  <TouchableOpacity onPress={startOver} accessibilityRole="button" testID="button-import-start-over">
                    <Text style={[s.link, { color: colors.primary }]}>Yeni aktarım başlat</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!!error && (
                <View style={[s.errBox, { borderColor: colors.destructive + "55", backgroundColor: colors.destructive + "10" }]} accessibilityRole="alert" testID="text-import-error">
                  <Feather name="alert-circle" size={18} color={colors.destructive} />
                  <Text style={[s.small, { flex: 1, color: colors.foreground }]}>{error}</Text>
                  {stage !== "preview" && (
                    <TouchableOpacity disabled={saving || reading} accessibilityRole="button" testID="button-import-retry"
                      onPress={() => { if (stage === "save") void save(); else void pickFile(); }}>
                      <Text style={[s.link, { color: colors.primary }]}>Tekrar dene</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {reading && <View style={{ gap: 10 }}>{[0, 1, 2].map((i) => <View key={i} style={[s.skeleton, { backgroundColor: colors.muted }]} />)}</View>}

              {!!sourceText && !reading && (
                <>
                  <Text style={[s.h2, { color: colors.foreground }]}>2. Kitap bilgileri</Text>
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>{sourceLabel} · {fmt(bytes(sourceText))}</Text>

                  <Text style={[s.label, { color: colors.mutedForeground }]}>Kitap adı</Text>
                  <TextInput style={fieldStyle} value={title} maxLength={120} editable={!locked && !saving}
                    onChangeText={(t) => { setTitle(t); setError(""); }} accessibilityLabel="Kitap adı" testID="input-import-book-title"
                    placeholder="Kitap adı" placeholderTextColor={colors.mutedForeground} />

                  <Text style={[s.label, { color: colors.mutedForeground }]}>Özet (en az 10 karakter)</Text>
                  <TextInput style={[...fieldStyle, s.areaSm]} multiline value={summary} maxLength={500} editable={!locked && !saving}
                    onChangeText={(t) => { setSummary(t); setError(""); }} accessibilityLabel="Kitap özeti" testID="input-import-summary"
                    placeholder="Kitabın kısa özeti" placeholderTextColor={colors.mutedForeground} textAlignVertical="top" />

                  <Text style={[s.label, { color: colors.mutedForeground }]}>Tür</Text>
                  <View style={s.chips}>
                    {GENRES.map((g) => (
                      <TouchableOpacity key={g} disabled={locked || saving} onPress={() => { setGenre(g); setError(""); }}
                        accessibilityRole="button" accessibilityState={{ selected: genre === g }} testID={`import-genre-${g}`}
                        style={[s.chip, { borderColor: colors.border }, genre === g && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        <Text style={[s.chipText, { color: genre === g ? "#fff" : colors.mutedForeground }]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[s.h2, { color: colors.foreground }]}>3. Bölümler</Text>
                  <Text style={[s.tiny, { color: colors.mutedForeground }]} testID="text-import-count">
                    {rows.length} bölüm · toplam {fmt(total)}. Sınırı aşan ya da boş bölümleri ayır veya birleştir.
                  </Text>
                  {rows.length === 0 && (
                    <View style={[s.empty, { borderColor: colors.border }]}>
                      <Text style={[s.small, { color: colors.mutedForeground, textAlign: "center" }]}>Bu metinde bölüm bulunamadı. "Tek bölüm" seçeneğini dene.</Text>
                    </View>
                  )}
                  {rows.map((r, i) => {
                    const size = bytes(r.content);
                    const over = size > IMPORT_LIMITS.chapterBytes;
                    const bad = over || !r.content.trim();
                    const ro = locked || saving;
                    return (
                      <View key={r.key} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`card-import-chapter-${i}`}>
                        <View style={s.rowCenter}>
                          <Text style={[s.tiny, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                          <TextInput style={[...fieldStyle, { flex: 1 }]} value={r.title} maxLength={200} editable={!ro}
                            onChangeText={(t) => edit(r.key, { title: t })} accessibilityLabel={`${i + 1}. bölüm başlığı`} testID={`input-chapter-title-${i}`}
                            placeholderTextColor={colors.mutedForeground} />
                        </View>
                        <TextInput style={[...fieldStyle, s.chapterArea]} multiline value={r.content} editable={!ro}
                          onChangeText={(t) => edit(r.key, { content: t })}
                          onSelectionChange={(e) => { selections.current[r.key] = e.nativeEvent.selection.start; }}
                          accessibilityLabel={`${i + 1}. bölüm metni`} testID={`input-chapter-content-${i}`} textAlignVertical="top" />
                        <Text style={[s.tiny, { color: bad ? colors.destructive : colors.mutedForeground }]}>
                          {fmt(size)} / 200 KB{!r.content.trim() ? " · boş" : over ? " · sınır aşıldı" : ""}
                        </Text>
                        {!ro && (
                          <View style={s.actions}>
                            <ActionBtn label="Yukarı" icon="arrow-up" disabled={i === 0} onPress={() => move(i, -1)} colors={colors} id={`button-up-${i}`} />
                            <ActionBtn label="Aşağı" icon="arrow-down" disabled={i === rows.length - 1} onPress={() => move(i, 1)} colors={colors} id={`button-down-${i}`} />
                            <ActionBtn label="İmleçten böl" icon="scissors" onPress={() => splitAt(i)} colors={colors} id={`button-split-${i}`} />
                            {i > 0 && <ActionBtn label="Öncekiyle birleştir" icon="git-merge" onPress={() => mergePrev(i)} colors={colors} id={`button-merge-${i}`} />}
                            <ActionBtn label="Kaldır" icon="trash-2" danger onPress={() => remove(r.key)} colors={colors} id={`button-remove-${i}`} />
                          </View>
                        )}
                      </View>
                    );
                  })}

                  <Text style={[s.h2, { color: colors.foreground }]}>4. Onay ve kayıt</Text>
                  <TouchableOpacity disabled={locked || saving} onPress={() => { setConsent((c) => !c); setError(""); }}
                    accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: locked || saving }}
                    accessibilityLabel="Telif hakkı onayı" testID="checkbox-import-consent"
                    style={[s.consent, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={[s.box, { borderColor: consent ? colors.primary : colors.mutedForeground, backgroundColor: consent ? colors.primary : "transparent" }]}>
                      {consent && <Feather name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={[s.small, { flex: 1, color: colors.foreground }]}>
                      Bu metnin telif hakkına sahip olduğumu ve SPEKTRUM'a aktarma hakkım bulunduğunu onaylıyorum. Metin, taslak olarak hesabıma kaydedilecek; yayımlanmayacak.
                    </Text>
                  </TouchableOpacity>
                  {!!notice && !existingId && <Text style={[s.small, { color: colors.mutedForeground }]} accessibilityRole="text">{notice}</Text>}

                  {existingId ? (
                    <View style={[s.infoBox, { borderColor: colors.primary + "50", flexDirection: "column", alignItems: "stretch" }]} testID="text-import-existing">
                      <Text style={[s.small, { color: colors.foreground }]}>{notice}</Text>
                      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary, alignSelf: "flex-start" }]} accessibilityRole="button" testID="link-import-existing"
                        onPress={() => router.replace({ pathname: "/story-manage/[id]", params: { id: existingId } })}>
                        <Text style={s.primaryText}>Mevcut taslağı aç</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => void save()} disabled={saving || !consent || rows.length === 0}
                      accessibilityRole="button" accessibilityState={{ disabled: saving || !consent || rows.length === 0, busy: saving }} testID="button-import-save"
                      style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: saving || !consent || rows.length === 0 ? 0.55 : 1, flexDirection: "row", justifyContent: "center", gap: 8 }]}>
                      {saving && <ActivityIndicator size="small" color="#fff" />}
                      <Text style={s.primaryText}>{saving ? "Kaydediliyor..." : "Taslak olarak kaydet"}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ActionBtn({ label, icon, onPress, disabled, danger, colors, id }: {
  label: string; icon: React.ComponentProps<typeof Feather>["name"]; onPress: () => void;
  disabled?: boolean; danger?: boolean; colors: ReturnType<typeof useColors>; id: string;
}) {
  const c = danger ? colors.destructive : colors.foreground;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} testID={id}
      style={[s.act, { borderColor: colors.border, opacity: disabled ? 0.35 : 1 }]}>
      <Feather name={icon} size={14} color={c} />
      <Text style={[s.actText, { color: c }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  body: { padding: 16, gap: 10 },
  h2: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 14 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
  small: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  tiny: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  link: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  errBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  skeleton: { height: 48, borderRadius: 12 },
  segment: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  drop: { borderWidth: 2, borderStyle: "dashed", borderRadius: 16, padding: 22, alignItems: "center", gap: 6 },
  dropTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular" },
  area: { height: 130 },
  areaSm: { height: 90 },
  chapterArea: { height: 180, lineHeight: 22 },
  outlineBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  outlineText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { padding: 24, borderWidth: 1, borderStyle: "dashed", borderRadius: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  act: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 36 },
  actText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  consent: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "flex-start" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
