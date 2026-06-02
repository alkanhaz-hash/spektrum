import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Heart, MessageSquare, ChevronRight, User, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChaptersByStory, getTalentPortfoliosByStory, likeStory,
  Story, Chapter, TalentPortfolio
} from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [talents, setTalents] = useState<TalentPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getStory(id),
      getChaptersByStory(id),
      getTalentPortfoliosByStory(id),
    ]).then(([s, ch, t]) => {
      setStory(s);
      setChapters(ch.filter(c => c.status === "published"));
      setTalents(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleLike = async () => {
    if (!user || !story) return;
    if (liked) return;
    try {
      await likeStory(story.id, user.uid);
      setLiked(true);
      setStory(s => s ? { ...s, likeCount: s.likeCount + 1 } : s);
    } catch {
      toast({ title: "Hata", description: "Beğeni kaydedilemedi.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-10 max-w-4xl">
          <Skeleton className="h-64 rounded-2xl mb-6" />
          <Skeleton className="h-8 w-64 mb-3" />
          <Skeleton className="h-4 w-48 mb-6" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!story) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground">Hikaye bulunamadı.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Cover + info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="w-full md:w-48 h-64 md:h-72 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 overflow-hidden shrink-0">
            {story.coverUrl && <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1">
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">{story.genre}</Badge>
            <h1 className="text-3xl md:text-4xl font-bold font-serif mb-2">{story.title}</h1>
            <Link href={`/profile/${story.authorId}`}>
              <span className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-4 cursor-pointer">
                <User className="w-4 h-4" /> {story.authorName}
              </span>
            </Link>
            <p className="text-muted-foreground leading-relaxed mb-6">{story.summary}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {story.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" /> {story.readCount.toLocaleString("tr-TR")} okuma</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {story.commentCount} yorum</span>
              <button
                onClick={handleLike}
                disabled={liked || !user}
                className={`flex items-center gap-1 transition-colors ${liked ? "text-pink-400" : "hover:text-pink-400"}`}
                data-testid="button-like"
              >
                <Heart className={`w-4 h-4 ${liked ? "fill-pink-400" : ""}`} /> {story.likeCount}
              </button>
            </div>
            {chapters.length > 0 && (
              <Link href={`/read/${story.id}/${chapters[0].id}`}>
                <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all" data-testid="button-start-reading">
                  <BookOpen className="w-4 h-4" /> Okumaya Başla
                </button>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Tabs: chapters + talent */}
        <Tabs defaultValue="chapters">
          <TabsList className="bg-card border border-border mb-6">
            <TabsTrigger value="chapters" data-testid="tab-chapters">Bölümler ({chapters.length})</TabsTrigger>
            <TabsTrigger value="talent" data-testid="tab-talent">
              <Palette className="w-4 h-4 mr-1" /> Yetenek Pazarı ({talents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chapters">
            <div className="space-y-2">
              {chapters.length === 0 && <p className="text-muted-foreground py-8 text-center">Henüz yayınlanmış bölüm yok.</p>}
              {chapters.map((ch, i) => (
                <motion.div key={ch.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/read/${story.id}/${ch.id}`}>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/50 bg-card hover:bg-card/80 transition-all cursor-pointer group" data-testid={`card-chapter-${ch.id}`}>
                      <div>
                        <span className="text-xs text-muted-foreground mb-1 block">Bölüm {ch.order}</span>
                        <h3 className="font-semibold group-hover:text-primary transition-colors">{ch.title}</h3>
                        <span className="text-xs text-muted-foreground">{ch.wordCount.toLocaleString("tr-TR")} kelime · {ch.readCount.toLocaleString("tr-TR")} okuma</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="talent">
            {talents.length === 0 && (
              <div className="py-12 text-center border border-dashed border-border rounded-2xl">
                <Palette className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Bu hikaye için henüz kapak tasarımı sunulmamış.</p>
                <p className="text-sm text-muted-foreground mt-1">Sen de çizer/tasarımcıysan katkıda bulunabilirsin.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {talents.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                      {t.userName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{t.userName}</p>
                      <p className="text-xs text-muted-foreground">{t.style}</p>
                    </div>
                  </div>
                  {t.coverDesigns.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {t.coverDesigns.slice(0, 2).map((url, idx) => (
                        <img key={idx} src={url} alt="Tasarım" className="rounded-lg aspect-[2/3] object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.bio}</p>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
