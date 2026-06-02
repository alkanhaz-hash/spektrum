import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, CheckCircle, XCircle, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getPendingChapters, updateChapterStatus, getStory, Chapter } from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface PendingItem extends Chapter {
  storyTitle?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  sexual: "Müstehcenlik",
  violence: "Şiddet",
  drugs: "Uyuşturucu",
  suicide: "İntihar",
  child_safety: "Çocuk Güvenliği",
  weapons: "Yasadışı Silah",
};

export default function ModeratorPage() {
  const [, setLocation] = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLocation("/auth"); return; }
    if (profile && profile.role !== "moderator" && profile.role !== "admin") {
      setLocation("/");
      return;
    }
    getPendingChapters().then(async (chs) => {
      const withTitles = await Promise.all(chs.map(async ch => {
        const story = await getStory(ch.storyId).catch(() => null);
        return { ...ch, storyTitle: story?.title };
      }));
      setItems(withTitles);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, profile]);

  const handleDecision = async (chapterId: string, decision: "published" | "rejected") => {
    setProcessing(chapterId);
    try {
      await updateChapterStatus(chapterId, decision);
      setItems(prev => prev.filter(i => i.id !== chapterId));
      toast({ title: decision === "published" ? "Bölüm onaylandı" : "Bölüm reddedildi" });
    } catch {
      toast({ title: "Hata", description: "İşlem başarısız.", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold font-serif">Moderatör Paneli</h1>
          </div>
          <p className="text-muted-foreground">İnceleme bekleyen bölümler</p>
        </motion.div>

        {loading && <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>}

        {!loading && items.length === 0 && (
          <div className="py-20 text-center border border-dashed border-border rounded-2xl">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <p className="text-lg font-semibold mb-1">Her şey temiz!</p>
            <p className="text-muted-foreground">İnceleme bekleyen bölüm yok.</p>
          </div>
        )}

        <div className="space-y-4">
          {items.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="p-6 rounded-2xl border border-border bg-card" data-testid={`pending-${item.id}`}>
              <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{item.storyTitle || item.storyId} · Bölüm {item.order}</p>
                  <h3 className="text-lg font-bold font-serif">{item.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(item.moderationCategories || []).map(cat => (
                    <Badge key={cat} variant="destructive" className="text-xs">{CATEGORY_LABELS[cat] || cat}</Badge>
                  ))}
                </div>
              </div>

              {/* Content preview */}
              <div className="bg-background rounded-xl p-4 mb-4 max-h-40 overflow-y-auto border border-border">
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.content}</p>
              </div>

              <div className="flex items-center gap-3">
                <Link href={`/read/${item.storyId}/${item.id}`}>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors" data-testid={`button-preview-${item.id}`}>
                    <Eye className="w-4 h-4" /> Önizle
                  </button>
                </Link>
                <button
                  onClick={() => handleDecision(item.id, "published")}
                  disabled={processing === item.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm transition-colors disabled:opacity-60"
                  data-testid={`button-approve-${item.id}`}>
                  <CheckCircle className="w-4 h-4" /> Onayla
                </button>
                <button
                  onClick={() => handleDecision(item.id, "rejected")}
                  disabled={processing === item.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-colors disabled:opacity-60"
                  data-testid={`button-reject-${item.id}`}>
                  <XCircle className="w-4 h-4" /> Reddet
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
