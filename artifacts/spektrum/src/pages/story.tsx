import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Heart, MessageSquare, ChevronRight, User,
  Mic, Play, Pause, Send, Upload, Clock, Trash2, CheckCircle, XCircle, Loader2, Edit3,
  Bookmark, BookmarkCheck, Share2, Check, Flag
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChaptersByStory, likeStory, unlikeStory, hasUserLikedStory,
  getNarrationsByStory, uploadNarration, deleteNarration,
  reportContent,
  bookmarkStory, unbookmarkStory, isStoryBookmarked, createNotification,
  Story, Chapter, Narration,
} from "@/lib/firestore-service";
import { uploadNarrationFile, uploadNarrationAudio } from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";

// ─── AUDIO PLAYER ─────────────────────────────────────────────────────────────

function AudioPlayer({ narration }: { narration: Narration }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    setProgress((audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const val = Number(e.target.value);
    audioRef.current.currentTime = (val / 100) * (audioRef.current.duration || 0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3">
      <button onClick={toggle}
        className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors shadow-[0_0_12px_hsl(var(--primary)/0.4)]">
        {playing ? <Pause className="w-4 h-4 text-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <input type="range" min="0" max="100" value={progress} onChange={handleSeek}
          className="w-full h-1 accent-primary cursor-pointer" />
        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(narration.durationSeconds)}</span>
        </div>
      </div>
      <audio ref={audioRef} src={narration.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }} />
    </div>
  );
}

// ─── NARRATIONS TAB ───────────────────────────────────────────────────────────

function NarrationsTab({ story }: { story: Story }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAuthor = user?.uid === story.authorId;

  useEffect(() => {
    getNarrationsByStory(story.id)
      .then(setNarrations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [story.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    if (!file.type.startsWith("audio/")) {
      toast({ title: "Sadece ses dosyası yükleyebilirsin", variant: "destructive" });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "Dosya çok büyük (max 100MB)", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const [audioUrl, durationSeconds] = await Promise.all([
        uploadNarrationFile(story.id, user.uid, file),
        uploadNarrationAudio(story.id, user.uid, file),
      ]);
      await uploadNarration({
        storyId: story.id,
        storyTitle: story.title,
        storyCoverUrl: story.coverUrl,
        narratorId: user.uid,
        narratorName: profile.displayName,
        narratorAvatar: profile.avatarUrl || "",
        authorId: story.authorId,
        authorName: story.authorName,
        audioUrl,
        durationSeconds,
      });
      const fresh = await getNarrationsByStory(story.id);
      setNarrations(fresh);
      toast({ title: "Seslendirme yüklendi!" });
    } catch {
      toast({ title: "Yükleme hatası", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (narration: Narration) => {
    if (!user || user.uid !== narration.narratorId) return;
    await deleteNarration(narration.id);
    setNarrations(prev => prev.filter(n => n.id !== narration.id));
    toast({ title: "Seslendirme silindi." });
  };

  if (loading) return (
    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  );

  const myNarration = narrations.find(n => n.narratorId === user?.uid);

  return (
    <div className="space-y-6">

      {/* ─ YAZAR: Yükleme Paneli ─ */}
      {user && isAuthor && (
        <div className="border border-primary/30 rounded-2xl p-5 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🎙️</span>
            <p className="font-semibold text-sm text-primary">Yazar Seslendirmesi</p>
            <span className="text-xs bg-primary/15 border border-primary/30 text-primary px-2 py-0.5 rounded-full">Resmi</span>
          </div>

          {!myNarration ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm">Hikayeni kendi sesinde yayınla.</p>
                <p className="text-xs text-muted-foreground mt-0.5">MP3, WAV veya M4A · En fazla 100 MB</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 shrink-0"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Yükleniyor..." : "Ses Yükle"}
              </button>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Seslendirmen yayında
                </p>
                <button
                  onClick={() => handleDelete(myNarration)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Seslendirmeyi sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <AudioPlayer narration={myNarration} />
            </div>
          )}
        </div>
      )}

      {/* ─ Seslendirme Listesi ─ */}
      {narrations.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-border rounded-2xl">
          <Mic className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Henüz seslendirme yok.</p>
          {!isAuthor && <p className="text-sm text-muted-foreground mt-1">Yazar henüz sesli anlatım eklemedi.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {narrations.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="border border-border rounded-2xl p-4 bg-card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 overflow-hidden shrink-0">
                  {n.narratorAvatar
                    ? <img src={n.narratorAvatar} alt={n.narratorName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-primary">{n.narratorName.charAt(0)}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/profile/${n.narratorId}`}>
                      <span className="text-sm font-semibold hover:text-primary transition-colors cursor-pointer">{n.narratorName}</span>
                    </Link>
                    {n.narratorId === n.authorId && (
                      <span className="text-xs bg-primary/15 border border-primary/30 text-primary px-1.5 py-0.5 rounded-full leading-none">👑 Yazar</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{Math.floor(n.durationSeconds / 60)}:{String(n.durationSeconds % 60).padStart(2, "0")}</p>
                </div>
                <Mic className="w-4 h-4 text-primary/50" />
              </div>
              <AudioPlayer narration={n} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    Promise.all([
      getStory(id),
      getChaptersByStory(id, true),
      user ? hasUserLikedStory(id, user.uid) : Promise.resolve(false),
      user ? isStoryBookmarked(user.uid, id) : Promise.resolve(false),
    ]).then(([s, ch, alreadyLiked, alreadyBookmarked]) => {
      setStory(s);
      setChapters(ch);
      setLiked(alreadyLiked);
      setBookmarked(alreadyBookmarked);
      setLoading(false);
    }).catch(() => {
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
                title={bookmarked ? "Yer imini kaldır" : "Sonra oku"}
                data-testid="button-bookmark"
              >
                {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                <span className="text-xs">{bookmarked ? "Kaydedildi" : "Kaydet"}</span>
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

        {/* Tabs */}
        <Tabs defaultValue="chapters">
          <TabsList className="bg-card border border-border mb-6 overflow-x-auto">
            <TabsTrigger value="chapters" data-testid="tab-chapters">
              Bölümler ({chapters.length})
            </TabsTrigger>
            <TabsTrigger value="narrations">
              <Mic className="w-4 h-4 mr-1" /> Sesli
            </TabsTrigger>
            {/* Yetenek sekmesi geçici olarak gizlendi */}
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

          <TabsContent value="narrations">
            <NarrationsTab story={story} />
          </TabsContent>

          {/* Yetenek sekmesi içeriği geçici olarak gizlendi */}
        </Tabs>
      </div>
    </AppLayout>
  );
}
