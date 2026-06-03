import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Upload, Plus, ChevronRight, BookOpen, Edit3 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { createStory, getStory, getChaptersByStory, updateStory, Story, Chapter, GENRES } from "@/lib/firestore-service";
import { uploadStoryCover } from "@/lib/storage-service";
import { checkImageSafety } from "@/lib/nsfw-service";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "Başlık zorunlu").max(120),
  summary: z.string().min(10, "Özet en az 10 karakter olmalı").max(500),
  genre: z.string().min(1, "Tür seç"),
  tags: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function WritePage() {
  const { storyId } = useParams<{ storyId?: string }>();
  const [, setLocation] = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(!!storyId);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", summary: "", genre: "", tags: "" },
  });

  useEffect(() => {
    if (!user) { setLocation("/auth"); return; }
    if (!storyId) { setLoading(false); return; }
    Promise.all([getStory(storyId), getChaptersByStory(storyId)]).then(([s, ch]) => {
      if (s) {
        setStory(s);
        form.reset({ title: s.title, summary: s.summary, genre: s.genre, tags: s.tags.join(", ") });
        if (s.coverUrl) setCoverPreview(s.coverUrl);
      }
      setChapters(ch);
      setLoading(false);
    }).catch(() => {
      // BUG FIX: hata olursa sayfa sonsuza dek "yükleniyor"da takılmasın.
      setLoading(false);
      toast({ title: "Hata", description: "Hikaye yüklenemedi.", variant: "destructive" });
    });
  }, [storyId, user]);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data: FormData) => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      let coverUrl = story?.coverUrl ?? "";

      if (coverFile) {
        // Yükleme ÖNCESİ tarayıcıda moderasyon — uygunsuzsa hiç upload edilmez (sıfır kredi).
        const check = await checkImageSafety(coverFile);
        if (!check.safe) {
          toast({ title: "Kapak uygun değil", description: "Kapak görselinde uygunsuz (cinsel/müstehcen) içerik tespit edildi.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const tempId = storyId || `temp-${Date.now()}`;
        coverUrl = await uploadStoryCover(user.uid, tempId, coverFile);
      }

      const tags = data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [];

      if (storyId) {
        await updateStory(storyId, { title: data.title, summary: data.summary, genre: data.genre, tags, coverUrl });
        toast({ title: "Hikaye güncellendi" });
      } else {
        const newId = await createStory({
          authorId: user.uid,
          authorName: profile.displayName,
          authorAvatar: profile.avatarUrl,
          title: data.title,
          summary: data.summary,
          genre: data.genre,
          tags,
          coverUrl,
          status: "draft",
        });
        toast({ title: "Hikaye oluşturuldu!" });
        setLocation(`/write/${newId}`);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const msg = (err as { message?: string })?.message;
      toast({
        title: "Hikaye kaydedilemedi",
        description: code ? `Hata: ${code}` : msg || "Bilinmeyen bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-10 max-w-2xl space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold font-serif mb-2">{storyId ? "Hikayeni Düzenle" : "Yeni Hikaye"}</h1>
          <p className="text-muted-foreground mb-8">Hikayen için temel bilgileri doldur, sonra bölümler ekle.</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Cover + title/genre row */}
              <div className="flex gap-6">
                {/* Cover upload */}
                <label className="cursor-pointer group shrink-0">
                  <div className="w-32 h-44 rounded-2xl border-2 border-dashed border-border group-hover:border-primary/50 bg-card flex flex-col items-center justify-center gap-2 transition-colors overflow-hidden">
                    {coverPreview
                      ? <img src={coverPreview} alt="Kapak" className="w-full h-full object-cover" />
                      : (
                        <>
                          <Upload className="w-6 h-6 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground text-center px-2">Kapak Yükle</span>
                          <span className="text-xs text-muted-foreground text-center px-2">WebP'ye dönüştürülür</span>
                        </>
                      )
                    }
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} data-testid="input-cover" />
                </label>

                {/* Title + genre */}
                <div className="flex-1 space-y-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hikaye Adı</FormLabel>
                      <FormControl>
                        <Input placeholder="Hikayenin adı..." {...field} data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="genre" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tür</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {GENRES.map(g => (
                          <button key={g} type="button" onClick={() => field.onChange(g)}
                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${field.value === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                            data-testid={`genre-${g}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Summary */}
              <FormField control={form.control} name="summary" render={({ field }) => (
                <FormItem>
                  <FormLabel>Özet</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={4}
                      placeholder="Hikayenden kısa bir özet..."
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      data-testid="input-summary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Tags */}
              <FormField control={form.control} name="tags" render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiketler (virgülle ayır)</FormLabel>
                  <FormControl>
                    <Input placeholder="fantastik, ejderha, savaş..." {...field} data-testid="input-tags" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.3)] disabled:opacity-60"
                data-testid="button-save-story"
              >
                {saving ? "Kaydediliyor..." : storyId ? "Güncelle" : "Hikayeyi Oluştur"}
              </button>
            </form>
          </Form>

          {/* Chapters list */}
          {storyId && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold font-serif">Bölümler</h2>
                <Link href={`/write/${storyId}/chapter/new`}>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/50 text-primary text-sm hover:bg-primary/10 transition-colors" data-testid="button-add-chapter">
                    <Plus className="w-4 h-4" /> Yeni Bölüm
                  </button>
                </Link>
              </div>
              <div className="space-y-2">
                {chapters.length === 0 && (
                  <div className="py-10 text-center border border-dashed border-border rounded-2xl">
                    <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Henüz bölüm yok. İlk bölümü ekle!</p>
                  </div>
                )}
                {chapters.map((ch, i) => (
                  <motion.div key={ch.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                      <div>
                        <span className="text-xs text-muted-foreground">Bölüm {ch.order}</span>
                        <h3 className="font-semibold">{ch.title}</h3>
                        <Badge
                          variant={ch.status === "published" ? "default" : ch.status === "pending_review" ? "secondary" : "outline"}
                          className="text-xs mt-1"
                        >
                          {ch.status === "published" ? "Yayınlandı"
                            : ch.status === "pending_review" ? "İnceleniyor"
                            : ch.status === "rejected" ? "Reddedildi"
                            : "Taslak"}
                        </Badge>
                      </div>
                      <Link href={`/write/${storyId}/chapter/${ch.id}`}>
                        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors" data-testid={`button-edit-chapter-${ch.id}`}>
                          <Edit3 className="w-4 h-4" /> <ChevronRight className="w-4 h-4" />
                        </button>
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
