import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Heart, MessageSquare, ChevronRight, User,
  Send, Clock, Edit3,
  Bookmark, BookmarkCheck, Share2, Check, Flag
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChaptersByStory, likeStory, unlikeStory, hasUserLikedStory,
  reportContent,
  bookmarkStory, unbookmarkStory, isStoryBookmarked, createNotification,
  Story, Chapter,
} from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadError(false);
    // Önce hikayeyi yükle — hikaye yüklenemezse sayfayı tamamen hata göster.
    // Bölümler, beğeni ve yer imi ayrıca yükleniyor; bunlar başarısız olsa da
    // hikaye sayfası yine de gösterilir.
    getStory(id)
      .then(s => {
        if (!s) { setLoadError(true); setLoading(false); return; }
        setStory(s);
        setLoading(false);
        // İkincil veriler — hataları yutuyoruz, sayfa çökmez
        getChaptersByStory(id, true)
          .then(ch => setChapters(ch))
          .catch(() => {});
        if (user) {
          hasUserLikedStory(id, user.uid)
            .then(v => setLiked(v))
            .catch(() => {});
          isStoryBookmarked(user.uid, id)
            .then(v => setBookmarked(v))
            .catch(() => {});
        }
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, [id, user?.uid]);

  const handleLike = async () => {
    if (!user || !story) return;
    try {
      if (liked) {
        await unlikeStory(story.id, user.uid);
        setLiked(false);
        setStory(s => s ? { ...s, likeCount: Math.max(0, s.likeCount - 1) } : s);
      } else {
        await likeStory(story.id, user.uid);
        setLiked(true);
        setStory(s => s ? { ...s, likeCount: s.likeCount + 1 } : s);
        if (profile && story.authorId !== user.uid) {
          createNotification({
            recipientId: story.authorId,
            senderId: user.uid,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl ?? "",
            type: "like",
            storyId: story.id,
            storyTitle: story.title,
          }).catch(() => {});
        }
      }
    } catch {
      toast({ title: "Hata", description: "Beğeni güncellenemedi.", variant: "destructive" });
    }
  };

  const handleBookmark = async () => {
    if (!user) { toast({ title: "Giriş gerekli", description: "Kaydetmek için giriş yapmalısın." }); return; }
    if (!story) return;
    try {
      if (bookmarked) {
        await unbookmarkStory(user.uid, story.id);
        setBookmarked(false);
        toast({ title: "Yer imi kaldırıldı" });
      } else {
        await bookmarkStory(user.uid, story.id);
        setBookmarked(true);
        toast({ title: "Kaydedildi!", description: "Profilindeki 'Kaydedilenler' sekmesinde bulabilirsin." });
      }
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  };

  const handleReport = async (type: "story") => {
    if (!user) { toast({ title: "Giriş gerekli" }); return; }
    if (!story || reporting) return;
    setReporting(true);
    try {
      await reportContent({ reportedId: story.id, reportedType: type, reporterId: user.uid });
      toast({ title: "Şikayet iletildi", description: "Moderatörler inceleyecek." });
    } catch {
      toast({ title: "Şikayet gönderilemedi", variant: "destructive" });
    } finally {
      setReporting(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = story?.title ?? "SPEKTRUM";
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* kullanıcı iptal etti */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Link kopyalandı!" });
    } catch {
      toast({ title: "Kopyalanamadı", variant: "destructive" });
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

  if (loadError) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-destructive font-medium mb-2">Hikaye yüklenemedi</p>
          <p className="text-muted-foreground text-sm mb-4">Bağlantı hatası olabilir. Lütfen tekrar dene.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Yenile</button>
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
            <div className="flex items-center flex-wrap gap-4 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" /> {story.readCount.toLocaleString("tr-TR")} okuma</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {story.commentCount} yorum</span>
              <button
                onClick={handleLike}
                disabled={!user}
                className={`flex items-center gap-1 transition-colors ${liked ? "text-pink-400 hover:text-pink-300" : "hover:text-pink-400"}`}
                data-testid="button-like"
                title={liked ? "Beğeniyi geri al" : "Beğen"}
              >
                <Heart className={`w-4 h-4 ${liked ? "fill-pink-400" : ""}`} /> {story.likeCount}
              </button>
              <button
                onClick={handleBookmark}
                className={`flex items-center gap-1 transition-colors ${bookmarked ? "text-primary" : "hover:text-primary"}`}
                title={bookmarked ? "Favorilerden çıkar" : "Favorilerime ekle"}
                data-testid="button-bookmark"
              >
                {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                <span className="text-xs">{bookmarked ? "Favorilerimde" : "Favorilerime Ekle"}</span>
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
                title="Paylaş"
                data-testid="button-share"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
                <span className="text-xs">{copied ? "Kopyalandı!" : "Paylaş"}</span>
              </button>
              {user && user.uid !== story.authorId && (
                <button
                  onClick={() => handleReport("story")}
                  disabled={reporting}
                  className="flex items-center gap-1 text-muted-foreground/50 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Hikayeyi şikayet et"
                  data-testid="button-report-story"
                >
                  <Flag className="w-4 h-4" />
                  <span className="text-xs">Şikayet</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {chapters.length > 0 && (
                <Link href={`/read/${story.id}/${chapters[0].id}`}>
                  <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all" data-testid="button-start-reading">
                    <BookOpen className="w-4 h-4" /> Okumaya Başla
                  </button>
                </Link>
              )}
              {user?.uid === story.authorId && (
                <Link href={`/write/${story.id}`}>
                  <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-all" data-testid="button-edit-story">
                    <Edit3 className="w-4 h-4" /> Düzenle / Devam Et
                  </button>
                </Link>
              )}
            </div>
          </div>
        </motion.div>

        {/* Bölümler */}
        <div>
          <h2 className="font-semibold text-base mb-4" data-testid="tab-chapters">Bölümler ({chapters.length})</h2>
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
        </div>
      </div>
    </AppLayout>
  );
}
