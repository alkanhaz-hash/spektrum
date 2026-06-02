import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { createChapter, getChapter, updateChapterStatus, getChaptersByStory, Chapter } from "@/lib/firestore-service";
import { moderateText } from "@/lib/moderation-service";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

const schema = z.object({
  title: z.string().min(1, "Başlık zorunlu").max(200),
  content: z.string().min(50, "İçerik en az 50 karakter olmalı"),
});
type FormData = z.infer<typeof schema>;

type ModerationStatus = "idle" | "checking" | "approved" | "pending_review" | "rejected";

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
      getChaptersByStory(storyId).then(chs => { setNextOrder(chs.length + 1); setLoading(false); });
      return;
    }
    getChapter(chapterId).then(ch => {
      if (ch) { setChapter(ch); form.reset({ title: ch.title, content: ch.content }); }
      setLoading(false);
    });
  }, [chapterId, user]);

  const wordCount = form.watch("content").split(/\s+/).filter(Boolean).length;

  const saveDraft = async () => {
    const data = form.getValues();
    if (!data.title || !data.content) return;
    setSaving(true);
    try {
      if (chapterId === "new") {
        const ref = await addDoc(collection(db, "chapters"), {
          storyId, title: data.title, content: data.content, order: nextOrder,
          wordCount, readCount: 0, status: "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast({ title: "Taslak kaydedildi" });
        setLocation(`/write/${storyId}/chapter/${ref.id}`);
      } else {
        await updateChapterStatus(chapterId, "draft");
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
      setModerationStatus(result.action);
      setModerationReason(result.reason);

      const chId = chapterId === "new"
        ? await (async () => {
            const ref = await addDoc(collection(db, "chapters"), {
              storyId, title: data.title, content: data.content, order: nextOrder,
              wordCount, readCount: 0, status: result.action,
              ...(result.categories.length ? { moderationCategories: result.categories } : {}),
              createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            return ref.id;
          })()
        : chapterId;

      if (chapterId !== "new") {
        const chapterStatus = result.action === "approved" ? "published" : result.action;
      await updateChapterStatus(chId, chapterStatus, result.categories.length ? result.categories : undefined);
      }

      if (result.action === "approved") {
        toast({ title: "Bölüm yayınlandı!", description: "Okuyucular artık görebilir." });
        setTimeout(() => setLocation(`/write/${storyId}`), 1500);
      } else if (result.action === "pending_review") {
        toast({ title: "Moderatör incelemesine gönderildi", description: "Bölümün onaylanınca yayınlanacak." });
      } else {
        toast({ title: "Yayınlanamadı", description: result.reason || "İçerik uyumsuz bulundu.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Hata", description: "Yayınlama sırasında bir sorun oluştu.", variant: "destructive" });
      setModerationStatus("idle");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AppLayout><div className="max-w-3xl mx-auto px-4 py-10 space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href={`/write/${storyId}`}>
          <span className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer mb-6">
            <ChevronLeft className="w-4 h-4" /> Hikayeye Dön
          </span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold font-serif mb-6">{chapterId === "new" ? "Yeni Bölüm" : "Bölümü Düzenle"}</h1>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(publishChapter)} className="space-y-6">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bölüm Başlığı</FormLabel>
                  <FormControl><Input placeholder="Bu bölümün adı..." {...field} data-testid="input-chapter-title" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between mb-1">
                    <FormLabel>İçerik</FormLabel>
                    <span className="text-xs text-muted-foreground">{wordCount} kelime</span>
                  </div>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={20}
                      placeholder="Hikayeni buraya yaz..."
                      className="w-full bg-background border border-border rounded-xl px-5 py-4 text-base leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none font-serif"
                      data-testid="input-chapter-content"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Moderation result */}
              <AnimatePresence>
                {moderationStatus !== "idle" && moderationStatus !== "checking" && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${
                      moderationStatus === "approved" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : moderationStatus === "pending_review" ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
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
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10 text-primary">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">İçerik denetleniyor...</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={saveDraft} disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors disabled:opacity-60"
                  data-testid="button-save-draft">
                  Taslak Kaydet
                </button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)] disabled:opacity-60"
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
