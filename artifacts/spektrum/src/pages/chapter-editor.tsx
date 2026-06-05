import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, AlertTriangle, CheckCircle, Clock,
  Mic, MicOff, Sparkles, Check, X, Info
} from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { createChapter, getChapter, updateChapter, updateChapterStatus, getChaptersByStory, Chapter } from "@/lib/firestore-service";
import { moderateText } from "@/lib/moderation-service";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const schema = z.object({
  title: z.string().min(1, "Başlık zorunlu").max(200),
  content: z.string().min(50, "İçerik en az 50 karakter olmalı"),
});
type FormData = z.infer<typeof schema>;

type ModerationStatus = "idle" | "checking" | "approved" | "pending_review" | "rejected";

// ─── AI TOOLBAR ───────────────────────────────────────────────────────────────

interface AIToolbarProps {
  content: string;
  onContentChange: (val: string) => void;
}

function AIToolbar({ content, onContentChange }: AIToolbarProps) {
  const { toast } = useToast();

  // ── Düzelt (LanguageTool — ücretsiz, API key yok) ──
  const [correctionPreview, setCorrectionPreview] = useState<{ corrected: string; changes: string[] } | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const handleCorrect = async () => {
    if (!content.trim()) {
      toast({ title: "Düzeltilecek metin yok", description: "Önce bir şeyler yaz." });
      return;
    }
    setCorrecting(true);
    try {
      // 15 saniyelik timeout — mobil ağlarda yavaş bağlantıya karşı
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let res: Response;
      try {
        res = await fetch("https://api.languagetool.org/v2/check", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ text: content, language: "tr" }).toString(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        // Servis geçici olarak yanıt vermiyorsa kullanıcıya bildir
        toast({
          title: "Düzeltme şu an yapılamıyor",
          description: "LanguageTool servisi meşgul. Birkaç saniye bekleyip tekrar dene.",
          variant: "destructive",
        });
        return;
      }

      const data = await res.json() as {
        matches: { offset: number; length: number; message: string; replacements: { value: string }[] }[];
      };

      // Yalnızca otomatik uygulanabilir düzeltmeler (en az 1 öneri olan)
      const applicable = (data.matches ?? []).filter(m => m.replacements.length > 0);

      if (applicable.length === 0) {
        toast({ title: "✅ Metin zaten temiz!", description: "Herhangi bir düzeltme gerekmedi." });
        return;
      }

      // Offset bozulmaması için sondan başa uygula
      const sorted = [...applicable].sort((a, b) => b.offset - a.offset);
      let corrected = content;
      const changes: string[] = [];

      for (const match of sorted) {
        const original = corrected.slice(match.offset, match.offset + match.length);
        const replacement = match.replacements[0].value;
        if (original !== replacement) {
          corrected = corrected.slice(0, match.offset) + replacement + corrected.slice(match.offset + match.length);
          changes.push(`"${original}" → "${replacement}"`);
        }
      }

      if (changes.length === 0) {
        toast({ title: "✅ Metin zaten temiz!", description: "Herhangi bir düzeltme gerekmedi." });
        return;
      }

      setCorrectionPreview({ corrected, changes: changes.reverse() });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      toast({
        title: "Düzeltme başarısız",
        description: isAbort
          ? "Bağlantı zaman aşımına uğradı. İnternet bağlantını kontrol edip tekrar dene."
          : "İnternet bağlantını kontrol edip tekrar dene.",
        variant: "destructive",
      });
    } finally {
      setCorrecting(false);
    }
  };

  const applyCorrection = () => {
    if (!correctionPreview) return;
    onContentChange(correctionPreview.corrected);
    setCorrectionPreview(null);
    toast({ title: "✨ Düzeltmeler uygulandı!" });
  };

  // ── Sesli Yaz ──
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const lastResultIndexRef = useRef(0);

  // Stale closure önleme: content ve onContentChange ref'te tutulur
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { onContentChangeRef.current = onContentChange; }, [onContentChange]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* ignored */ }
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "Tarayıcın desteklemiyor",
        description: "Sesli yazma için Chrome veya Edge kullan.",
        variant: "destructive",
      });
      return;
    }

    isListeningRef.current = true;
    lastResultIndexRef.current = 0;
    setIsListening(true);

    const buildRecognition = () => {
      const rec = new SR();
      rec.lang = "tr-TR";
      rec.continuous = true;
      // interimResults=false → yalnızca kesinleşmiş sonuçlar alınır;
      // tekrar yazma (5-6x) sorununu çözer
      rec.interimResults = false;

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        // lastResultIndexRef ile zaten işlenmiş sonuçlar atlanır
        const startIdx = Math.max(event.resultIndex, lastResultIndexRef.current);
        for (let i = startIdx; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
            lastResultIndexRef.current = i + 1;
          }
        }
        if (finalTranscript) {
          const prev = contentRef.current;
          const sep = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
          onContentChangeRef.current(prev + sep + finalTranscript.trim());
        }
      };

      rec.onerror = (event: any) => {
        if (event.error === "not-allowed") {
          toast({
            title: "Mikrofon izni reddedildi",
            description: "Tarayıcı ayarlarından mikrofona izin ver.",
            variant: "destructive",
          });
          isListeningRef.current = false;
          recognitionRef.current = null;
          setIsListening(false);
        }
        // Diğer hatalar (network, no-speech) → onend tetikler → otomatik yeniden başlar
      };

      rec.onend = () => {
        // Mobilde onend her cümle sonrası tetiklenir (continuous=true olsa bile).
        // Aynı örneği yeniden başlatmak güvensiz — her zaman yeni örnek oluştur.
        if (isListeningRef.current) {
          setTimeout(() => {
            if (!isListeningRef.current) return;
            try {
              const newRec = buildRecognition();
              recognitionRef.current = newRec;
              newRec.start();
            } catch {
              // Başlatma hatası — kullanıcı durdurmuş sayılır
              isListeningRef.current = false;
              setIsListening(false);
            }
          }, 150);
        }
      };

      return rec;
    };

    const recognition = buildRecognition();
    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  useEffect(() => () => {
    isListeningRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* ignored */ }
  }, []);

  return (
    <div className="space-y-3">
      {/* Toolbar butonları */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sesli Yaz */}
        <button
          type="button"
          onClick={toggleListening}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
            isListening
              ? "bg-red-500/15 border-red-500/50 text-red-400 hover:bg-red-500/25"
              : "bg-card border-border hover:border-primary/50 hover:text-primary"
          }`}
        >
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <MicOff className="w-4 h-4" />
              Dinlemeyi Durdur
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Sesli Yaz
            </>
          )}
        </button>

        {/* AI Düzelt */}
        <button
          type="button"
          onClick={handleCorrect}
          disabled={correcting || !!correctionPreview}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border bg-card hover:border-primary/50 hover:text-primary transition-all disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {correcting ? "Analiz ediliyor..." : "Yazımı Düzelt"}
        </button>

        {isListening && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            Türkçe sesi metne çeviriyor...
          </span>
        )}
      </div>

      {/* Düzeltme Önizlemesi */}
      <AnimatePresence>
        {correctionPreview && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-secondary/40 bg-secondary/8 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-secondary flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  AI düzeltmeler hazır
                </p>
                {correctionPreview.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {correctionPreview.changes.slice(0, 5).map((change, i) => (
                      <span key={i} className="text-xs bg-secondary/15 border border-secondary/25 text-secondary/80 px-2 py-0.5 rounded-full">
                        {change}
                      </span>
                    ))}
                    {correctionPreview.changes.length > 5 && (
                      <span className="text-xs text-muted-foreground px-1">
                        +{correctionPreview.changes.length - 5} düzeltme
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setCorrectionPreview(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyCorrection}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/90 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Uygula
              </button>
              <button
                type="button"
                onClick={() => setCorrectionPreview(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                İptal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isListening && !correctionPreview && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          Sesli yazma Chrome ve Edge'de çalışır. Düzelt butonu AI ile yazım ve noktalama hatalarını düzeltir.
        </p>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ChapterEditorPage() {
  const { storyId, chapterId } = useParams<{ storyId: string; chapterId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(chapterId !== "new");
  const [saving, setSaving] = useState(false);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>("idle");
  const [moderationReason, setModerationReason] = useState<string | null>(null);
  const [nextOrder, setNextOrder] = useState(1);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", content: "" },
  });

  useEffect(() => {
    if (!user) { setLocation("/auth"); return; }
    if (chapterId === "new") {
      getChaptersByStory(storyId)
        .then(chs => { setNextOrder(chs.length + 1); setLoading(false); })
        .catch(() => setLoading(false));
      return;
    }
    getChapter(chapterId)
      .then(ch => {
        if (ch) { setChapter(ch); form.reset({ title: ch.title, content: ch.content }); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chapterId, user]);

  const wordCount = form.watch("content").split(/\s+/).filter(Boolean).length;

  const saveDraft = async () => {
    const data = form.getValues();
    if (!data.title || !data.content) return;
    setSaving(true);
    try {
      if (chapterId === "new") {
        const newId = await createChapter({
          storyId, title: data.title, content: data.content, order: nextOrder,
          wordCount, status: "draft",
        });
        toast({ title: "Taslak kaydedildi" });
        setLocation(`/write/${storyId}/chapter/${newId}`);
      } else {
        await updateChapter(chapterId, { title: data.title, content: data.content, status: "draft", wordCount });
        toast({ title: "Taslak güncellendi" });
      }
    } catch {
      toast({ title: "Hata", description: "Kaydedilemedi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const publishChapter = async (data: FormData) => {
    setSaving(true);
    setModerationStatus("checking");
    setModerationReason(null);

    try {
      const result = await moderateText(data.content, "tr");
      setModerationStatus(result.action === "rejected" ? "rejected" : "pending_review");
      setModerationReason(result.reason);

      if (result.action === "rejected") {
        toast({ title: "Yayınlanamadı", description: result.reason || "İçerik uyumsuz bulundu.", variant: "destructive" });
        return;
      }

      const chapterStatus: Chapter["status"] = "pending_review";

      if (chapterId === "new") {
        await createChapter({
          storyId, title: data.title, content: data.content, order: nextOrder,
          wordCount, status: chapterStatus,
          ...(result.categories.length ? { moderationCategories: result.categories } : {}),
        });
      } else {
        await updateChapter(chapterId, {
          title: data.title,
          content: data.content,
          status: chapterStatus,
          wordCount,
          ...(result.categories.length ? { moderationCategories: result.categories } : {}),
        });
      }

      toast({ title: "Moderatör incelemesine gönderildi", description: "Bölüm onaylanınca yayınlanacak." });
      setTimeout(() => setLocation(`/write/${storyId}`), 1500);
    } catch {
      toast({ title: "Hata", description: "Yayınlama sırasında bir sorun oluştu.", variant: "destructive" });
      setModerationStatus("idle");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href={`/write/${storyId}`}>
          <span className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer mb-6">
            <ChevronLeft className="w-4 h-4" /> Hikayeye Dön
          </span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold font-serif mb-6">
            {chapterId === "new" ? "Yeni Bölüm" : "Bölümü Düzenle"}
          </h1>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(publishChapter)} className="space-y-6">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bölüm Başlığı</FormLabel>
                  <FormControl>
                    <Input placeholder="Bu bölümün adı..." {...field} data-testid="input-chapter-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between mb-1">
                    <FormLabel>İçerik</FormLabel>
                    <span className="text-xs text-muted-foreground">{wordCount} kelime</span>
                  </div>

                  <div className="mb-3">
                    <AIToolbar
                      content={field.value}
                      onContentChange={field.onChange}
                    />
                  </div>

                  <FormControl>
                    <textarea
                      {...field}
                      rows={22}
                      placeholder="Hikayeni buraya yaz... Sesli yazmak için mikrofon butonuna bas."
                      className="w-full bg-background border border-border rounded-xl px-5 py-4 text-base leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none font-serif"
                      data-testid="input-chapter-content"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Moderasyon sonucu */}
              <AnimatePresence>
                {moderationStatus !== "idle" && moderationStatus !== "checking" && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${
                      moderationStatus === "approved"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : moderationStatus === "pending_review"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}>
                    {moderationStatus === "approved" ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      : moderationStatus === "pending_review" ? <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-semibold text-sm">
                        {moderationStatus === "approved" ? "Bölüm yayınlandı!"
                          : moderationStatus === "pending_review" ? "Moderatör incelemesine alındı"
                          : "Bölüm yayınlanamadı"}
                      </p>
                      {moderationReason && <p className="text-xs mt-0.5 opacity-80">{moderationReason}</p>}
                    </div>
                  </motion.div>
                )}
                {moderationStatus === "checking" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10 text-primary">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">İçerik denetleniyor...</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Aksiyon butonları */}
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={saveDraft} disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors disabled:opacity-60"
                  data-testid="button-save-draft">
                  Taslak Kaydet
                </button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.35)] disabled:opacity-60"
                  data-testid="button-publish-chapter">
                  {saving ? "İşleniyor..." : "Yayınla"}
                </button>
              </div>
            </form>
          </Form>
        </motion.div>
      </div>
    </AppLayout>
  );
}
