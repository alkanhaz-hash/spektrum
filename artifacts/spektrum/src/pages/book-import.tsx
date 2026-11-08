import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, FileText, Scissors, Merge, AlertCircle, RotateCcw, ShieldCheck, Loader2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { clearImportRecovery, readImportRecovery, saveImportRecovery, type ImportRecovery } from "@/lib/book-import-recovery";
import { saveImportedBook } from "@/lib/book-import-service";
import { GENRES, importBookDraft } from "@/lib/firestore-service";
import {
  IMPORT_LIMITS, byteLength, readImportFile, splitImportChapters, validateImportPreview, validateSource,
  type ImportChapter,
} from "@/lib/book-import";

type Row = ImportChapter & { key: number };
type Mode = "headings" | "separator" | "single";

const fmt = (n: number) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
const fieldCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

export default function BookImportPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [pasteText, setPasteText] = useState("");
  const [source, setSource] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [mode, setMode] = useState<Mode>("headings");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorStage, setErrorStage] = useState<"file" | "preview" | "save">("preview");
  const [notice, setNotice] = useState("");
  const [existingId, setExistingId] = useState("");
  const [locked, setLocked] = useState(false);
  const snapshot = useRef<ImportRecovery | null>(null);
  const activeUid = useRef(user?.uid);
  activeUid.current = user?.uid;
  const parseToken = useRef(0);
  const savingRef = useRef(false);
  const keyRef = useRef(0);
  const areas = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const toRows = (list: ImportChapter[]): Row[] => list.map(c => ({ ...c, key: keyRef.current++ }));

  useEffect(() => {
    activeUid.current = user?.uid;
    parseToken.current++;
    setReading(false); setSaving(false); savingRef.current = false;
    snapshot.current = null;
    setSource(""); setRows([]); setTitle(""); setSummary(""); setGenre("");
    setPasteText(""); setConsent(false); setLocked(false); setError(""); setNotice(""); setExistingId("");
    if (!user) return;
    try {
      const recovered = readImportRecovery(user.uid);
      if (!recovered) return;
      snapshot.current = recovered;
      setSource(recovered.sourceText ?? recovered.preview.chapters.map(c => c.content).join("\n\n"));
      setSourceLabel("Kurtarılan aktarım");
      setRows(toRows(recovered.preview.chapters));
      setTitle(recovered.preview.title); setSummary(recovered.preview.summary); setGenre(recovered.preview.genre);
      setConsent(recovered.consent); setLocked(true);
      setNotice("Başlayan aktarımın önizlemesi kurtarıldı. Yeniden deneme aynı metni kaydeder; düzenlemek için yeni aktarım başlat.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktarım önizlemesi kurtarılamadı.");
    }
    return () => { activeUid.current = undefined; parseToken.current++; };
  }, [user?.uid]);

  const clearSource = () => {
    if (user) { try { clearImportRecovery(user.uid); } catch { /* Explicit source selection still clears memory. */ } }
    snapshot.current = null; setLocked(false);
    setSource(""); setSourceLabel(""); setRows([]); setConsent(false); setDirty(false);
    setExistingId(""); setNotice("");
  };

  const applySource = (text: string, label: string, suggestedTitle: string) => {
    const normalized = validateSource(text);
    const list = splitImportChapters(normalized, mode);
    setSource(normalized); setSourceLabel(label); setRows(toRows(list));
    setConsent(false); setDirty(false); setExistingId(""); setNotice(""); setError("");
    setTitle(t => (t.trim() ? t : suggestedTitle));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || savingRef.current) return;
    const token = ++parseToken.current;
    setReading(true); setError(""); setErrorStage("file"); clearSource();
    try {
      const { text, title: t } = await readImportFile(file);
      if (token !== parseToken.current) return;
      applySource(text, file.name, t);
    } catch (err) {
      if (token !== parseToken.current) return;
      clearSource();
      setError(err instanceof Error ? err.message : "Dosya okunamadı.");
    } finally {
      if (token === parseToken.current) setReading(false);
    }
  };

  const onPaste = () => {
    if (savingRef.current) return;
    parseToken.current++;
    setReading(false); setError(""); setErrorStage("preview"); clearSource();
    try {
      applySource(pasteText, "Yapıştırılan metin", "");
    } catch (err) {
      clearSource();
      setError(err instanceof Error ? err.message : "Metin işlenemedi.");
    }
  };

  const changeMode = (m: Mode) => {
    if (m === mode || savingRef.current) return;
    if (dirty && !window.confirm("Bölüm düzenlemelerin sıfırlanacak. Devam edilsin mi?")) return;
    setMode(m);
    if (!source) return;
    try {
      setRows(toRows(splitImportChapters(source, m)));
      setDirty(false); setConsent(false); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bölümlere ayrılamadı.");
    }
  };

  const edit = (key: number, patch: Partial<ImportChapter>) => {
    setRows(r => r.map(x => (x.key === key ? { ...x, ...patch } : x)));
    setDirty(true); setError("");
  };

  const splitAt = (index: number) => {
    const row = rows[index];
    const el = areas.current[row.key];
    if (!el) return;
    const pos = el.selectionStart;
    const before = row.content.slice(0, pos);
    const after = row.content.slice(pos);
    if (!before.trim() || !after.trim()) {
      setError("İmleci metnin ortasına koy; her iki bölümde de metin kalmalı.");
      return;
    }
    if (rows.length >= IMPORT_LIMITS.chapters) { setError("En fazla 50 bölüm olabilir."); return; }
    const next = [...rows];
    next.splice(index, 1, { ...row, content: before.replace(/\s+$/, "") }, {
      key: keyRef.current++, title: `Bölüm ${index + 2}`, content: after.replace(/^\s+/, ""),
    });
    setRows(next); setDirty(true); setError("");
  };

  const mergeNext = (index: number) => {
    const a = rows[index], b = rows[index + 1];
    if (!b) return;
    const bTitle = `${b.title.trim()}\n\n`;
    const body = [a.content.trim(), `${bTitle}${b.content}`.trim()].filter(Boolean).join("\n\n");
    const next = [...rows];
    next.splice(index, 2, { ...a, content: body });
    setRows(next); setDirty(true); setError("");
  };

  const total = rows.reduce((s, r) => s + byteLength(r.content), 0);

  const save = async () => {
    if (savingRef.current) return;
    setErrorStage("preview");
    const preview = snapshot.current?.preview ?? { title: title.trim(), summary: summary.trim(), genre, chapters: rows.map(({ title: t, content }) => ({ title: t.trim(), content })) };
    try {
      if (!source) throw new Error("Önce bir kaynak seç.");
      validateImportPreview(preview);
      if (!consent) throw new Error("Devam etmek için hak sahipliği onayını işaretle.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme geçersiz."); return;
    }
    savingRef.current = true; setSaving(true); setError("");
    const uid = user?.uid;
    try {
      if (!uid) throw new Error("Kitap aktarmak için giriş yap.");
      if (!snapshot.current) {
        const request: ImportRecovery = {
          preview, consent: true, sourceText: source,
          source: sourceLabel.toLowerCase().endsWith(".docx") ? "docx" : sourceLabel.toLowerCase().endsWith(".txt") ? "txt" : "paste",
        };
        saveImportRecovery(uid, request);
        snapshot.current = request;
      }
      setLocked(true);
      const request = snapshot.current;
      // Old recovery records retain the old fingerprint and create-only commit.
      const res = request.sourceText === undefined
        ? { storyId: await saveImportedBook({ preview: request.preview, source: request.source, ownershipConfirmed: request.consent }), alreadyImported: false }
        : await importBookDraft({ sourceText: request.sourceText, preview: request.preview, ownershipConfirmed: request.consent });
      if (activeUid.current !== uid) return;
      try { clearImportRecovery(uid); } catch { /* A repeat resolves to the completed import. */ }
      snapshot.current = null; setLocked(false);
      if (res.alreadyImported) {
        setExistingId(res.storyId);
        setNotice("Bu metin daha önce aktarılmış. Mevcut taslağın açılır; yaptığın değişiklikler üzerine yazılmadı.");
      } else {
        setLocation(`/write/${res.storyId}`);
      }
    } catch (err) {
      if (activeUid.current !== uid) return;
      setErrorStage("save");
      const code = (err as { code?: string })?.code;
      const detail = code === "permission-denied"
        ? "Kayıt izni reddedildi (permission-denied). Hesap durumunu kontrol et."
        : code === "unavailable" || code === "deadline-exceeded"
          ? `Bağlantı kurulamadı (${code}). Bağlantını kontrol et.`
          : (err instanceof Error && err.message) || "Aktarım kaydedilemedi.";
      setError(`${detail} Önizlemen korunuyor; aynı kaynakla yeniden denemek kopya oluşturmaz.`);
    } finally {
      if (activeUid.current === uid) { savingRef.current = false; setSaving(false); }
    }
  };

  const busy = saving || reading || locked;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Link href="/write" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Yazarlık
          </Link>
          <h1 className="text-3xl font-bold font-serif mb-2" data-testid="text-import-title">Kitabını Taşı</h1>
          <p className="text-muted-foreground mb-6">TXT ya da DOCX dosyanı yükle veya metni yapıştır; bölümleri kontrol et, taslak olarak kaydet.</p>

          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 mb-8 flex gap-3 text-sm">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <ul className="space-y-1 text-muted-foreground leading-relaxed">
              <li>Hiçbir şey otomatik yayımlanmaz; her şey taslak olarak kaydedilir.</li>
              <li>Başka platformların şifresi istenmez, hiçbir siteden içerik çekilmez.</li>
              <li>Kaydetmeye başladığında önizleme bu sekmede, hesabına özel kurtarma kaydı olarak tutulur. Yenilemede aynı aktarımı devam ettirebilirsin; dosyanın kendisi yüklenmez.</li>
            </ul>
          </div>

          <fieldset disabled={saving} className="space-y-8 min-w-0">
            <section className="space-y-4">
              <h2 className="text-xl font-bold font-serif">1. Kaynak</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-muted-foreground">Bölüm ayrımı</span>
                <div className="flex rounded-xl border border-border p-1">
                  {([["headings", "Başlıklara göre böl"], ["separator", "--- ile böl"], ["single", "Tek bölüm"]] as const).map(([m, label]) => (
                    <button key={m} type="button" onClick={() => changeMode(m)} disabled={busy}
                      className={`px-3 py-1 rounded-lg transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid={`button-mode-${m}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className={`rounded-2xl border-2 border-dashed border-border bg-card p-6 flex flex-col items-center justify-center gap-2 text-center transition-colors ${busy ? "opacity-60" : "cursor-pointer hover:border-primary/50"}`}>
                  {reading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
                  <span className="text-sm font-medium">{reading ? "Dosya okunuyor..." : "TXT veya DOCX seç"}</span>
                  <span className="text-xs text-muted-foreground">DOCX'ten yalnızca metin alınır; görseller ve biçimlendirme aktarılmaz.</span>
                  <input ref={fileInput} type="file" accept=".txt,.docx" className="hidden" onChange={onFile} disabled={busy} data-testid="input-import-file" />
                </label>
                <div className="space-y-2">
                  <textarea
                    value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5} disabled={busy}
                    placeholder="Ya da metni buraya yapıştır..." className={`${fieldCls} resize-none`} data-testid="input-import-paste"
                  />
                  <button type="button" onClick={onPaste} disabled={busy || !pasteText.trim()}
                    className="w-full py-2 rounded-xl border border-primary/50 text-primary text-sm hover:bg-primary/10 transition-colors disabled:opacity-50" data-testid="button-import-paste">
                    Yapıştırılan metni önizle
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="text-import-limits">
                Sınırlar: dosya en fazla 5 MB, metin en fazla 2 MB, bölüm en fazla 200 KB, en fazla 50 bölüm.
              </p>
              {locked && (
                <div className="rounded-xl border border-primary/30 p-4 text-sm space-y-2" role="status">
                  <p>Başlayan aktarımın metni yeniden deneme için sabitlendi. Aynı önizleme korunacak.</p>
                  <button type="button" disabled={saving} className="text-primary hover:underline" onClick={() => {
                    if (window.confirm("Kurtarma önizlemesi kaldırılacak. Kaydedilmiş taslak silinmez. Yeni bir aktarım başlatılsın mı?")) clearSource();
                  }}>Yeni aktarım başlat</button>
                </div>
              )}
            </section>

            <AnimatePresence>
              {error && (
                <motion.div key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3 text-sm" data-testid="text-import-error">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="flex-1">{error}</p>
                  {errorStage !== "preview" && (
                    <button type="button" disabled={saving || reading} onClick={() => {
                      if (errorStage === "save") void save();
                      else fileInput.current?.click();
                    }}
                      className="flex items-center gap-1 text-primary hover:underline shrink-0" data-testid="button-import-retry">
                      <RotateCcw className="w-4 h-4" /> Tekrar dene
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {reading && <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}</div>}

            {source && !reading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <fieldset disabled={locked} className="space-y-8 min-w-0">
                <section className="space-y-4">
                  <h2 className="text-xl font-bold font-serif">2. Kitap bilgileri</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-2"><FileText className="w-4 h-4" />{sourceLabel} · {fmt(byteLength(source))}</p>
                  <div>
                    <label className="text-sm font-medium" htmlFor="imp-title">Kitap adı</label>
                    <Input id="imp-title" value={title} maxLength={120} onChange={e => { setTitle(e.target.value); setError(""); }} className="mt-1" data-testid="input-import-book-title" />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="imp-summary">Özet</label>
                    <textarea id="imp-summary" value={summary} rows={3} maxLength={500} onChange={e => { setSummary(e.target.value); setError(""); }}
                      placeholder="Kitabın kısa özeti (en az 10 karakter)" className={`${fieldCls} resize-none mt-1`} data-testid="input-import-summary" />
                  </div>
                  <div>
                    <span className="text-sm font-medium">Tür</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {GENRES.map(g => (
                        <button key={g} type="button" onClick={() => { setGenre(g); setError(""); }}
                          className={`px-3 py-1 rounded-full text-sm border transition-colors ${genre === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          data-testid={`import-genre-${g}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold font-serif">3. Bölümler</h2>
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-import-count">
                    {rows.length} bölüm · toplam {fmt(total)}. Sınırı aşan ya da boş bölümleri ayır veya birleştir. Bölüm kaldırma ayrıca onay ister.
                  </p>
                  {rows.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-border rounded-2xl text-sm text-muted-foreground">
                      Bu metinde bölüm başlığı bulunamadı. "Tek bölüm" seçeneğini dene.
                    </div>
                  )}
                  <div className="space-y-4">
                    {rows.map((r, i) => {
                      const size = byteLength(r.content);
                      const over = size > IMPORT_LIMITS.chapterBytes;
                      return (
                        <motion.div key={r.key} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
                          className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`card-import-chapter-${i}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                            <Input value={r.title} maxLength={200} onChange={e => edit(r.key, { title: e.target.value })} data-testid={`input-chapter-title-${i}`} />
                          </div>
                          <textarea
                            ref={el => { areas.current[r.key] = el; }} value={r.content} rows={8}
                            onChange={e => edit(r.key, { content: e.target.value })}
                            className={`${fieldCls} font-serif leading-relaxed whitespace-pre-wrap`} data-testid={`input-chapter-content-${i}`}
                          />
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={over || !r.content.trim() ? "text-red-400" : "text-muted-foreground"}>
                              {fmt(size)} / 200 KB{!r.content.trim() ? " · boş" : over ? " · sınır aşıldı" : ""}
                            </span>
                            <span className="flex-1" />
                            <button type="button" disabled={i === 0} className="disabled:opacity-40" aria-label={`${i + 1}. bölümü yukarı taşı`} onClick={() => {
                              const next = [...rows]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setRows(next); setDirty(true);
                            }}>Yukarı</button>
                            <button type="button" disabled={i === rows.length - 1} className="disabled:opacity-40" aria-label={`${i + 1}. bölümü aşağı taşı`} onClick={() => {
                              const next = [...rows]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setRows(next); setDirty(true);
                            }}>Aşağı</button>
                            <button type="button" className="text-red-500" onClick={() => {
                              if (window.confirm("Bu bölümün metni önizlemeden kaldırılacak. Devam edilsin mi?")) { setRows(rows.filter(row => row.key !== r.key)); setDirty(true); }
                            }}>Kaldır</button>
                            <button type="button" onClick={() => splitAt(i)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:text-primary transition-colors" data-testid={`button-split-${i}`}>
                              <Scissors className="w-3.5 h-3.5" /> İmleçten böl
                            </button>
                            {i < rows.length - 1 && (
                              <button type="button" onClick={() => mergeNext(i)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:text-primary transition-colors" data-testid={`button-merge-${i}`}>
                                <Merge className="w-3.5 h-3.5" /> Sonrakiyle birleştir
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
                </fieldset>

                <section className="space-y-4">
                  <h2 className="text-xl font-bold font-serif">4. Onay ve kayıt</h2>
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm cursor-pointer">
                    <input type="checkbox" disabled={locked} checked={consent} onChange={e => { setConsent(e.target.checked); setError(""); }}
                      className="mt-1 w-4 h-4 accent-[hsl(var(--primary))]" data-testid="checkbox-import-consent" />
                    <span>Bu metnin telif hakkına sahip olduğumu ve SPEKTRUM’a aktarma hakkım bulunduğunu onaylıyorum. Metin, taslak olarak hesabıma kaydedilecek.</span>
                  </label>
                  {notice && !existingId && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
                  <button type="button" className="text-sm text-primary hover:underline" onClick={async () => {
                    try { await navigator.clipboard.writeText(rows.map(row => row.content).join("\n\n---\n\n")); setNotice("Metin panoya kopyalandı."); }
                    catch { setError("Metin panoya kopyalanamadı."); }
                  }}>Metni kopyala</button>

                  {existingId ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-sm" data-testid="text-import-existing">
                      <p>{notice}</p>
                      <Link href={`/write/${existingId}`} className="inline-block px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold" data-testid="link-import-existing">
                        Mevcut taslağı aç
                      </Link>
                    </div>
                  ) : (
                    <button type="button" onClick={save} disabled={saving || !consent || rows.length === 0}
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                      data-testid="button-import-save">
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {saving ? "Kaydediliyor..." : "Taslak olarak kaydet"}
                    </button>
                  )}
                </section>
              </motion.div>
            )}
          </fieldset>
        </motion.div>
      </div>
    </AppLayout>
  );
}
