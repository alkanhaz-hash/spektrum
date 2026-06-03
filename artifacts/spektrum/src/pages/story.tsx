import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Heart, MessageSquare, ChevronRight, User, Palette,
  Mic, Play, Pause, Send, Upload, Clock, Trash2, CheckCircle, XCircle, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChaptersByStory, getTalentPortfoliosByStory, likeStory,
  getNarrationsByStory, getNarrationRequest, createNarrationRequest, uploadNarration, deleteNarration,
  getOrCreateConversation, sendMessage,
  Story, Chapter, TalentPortfolio, Narration, NarrationRequest,
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
  const [, setLocation] = useLocation();
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [myRequest, setMyRequest] = useState<NarrationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // BUG FIX: useRef hook'u conditional return'dan önce tanımlanmalı (React hook kuralı)
  const authorInputRef = useRef<HTMLInputElement>(null);

  const isAuthor = user?.uid === story.authorId;
  const isNarrator = !!myRequest && myRequest.status === "approved";

  useEffect(() => {
    const init = async () => {
      const [narrs, req] = await Promise.all([
        getNarrationsByStory(story.id),
        user ? getNarrationRequest(story.id, user.uid) : Promise.resolve(null),
      ]);
      setNarrations(narrs);
      setMyRequest(req);
      setLoading(false);
    };
    init().catch(() => setLoading(false));
  }, [story.id, user?.uid]);

  const handleRequest = async () => {
    if (!user || !profile) { setLocation("/auth"); return; }
    if (user.uid === story.authorId) {
      toast({ title: "Kendi hikayeni seslendirmek için izne gerek yok!" });
      return;
    }
    setRequesting(true);
    try {
      // 1 — DM konuşması aç / bul
      const convId = await getOrCreateConversation(
        user.uid,
        story.authorId,
        { [user.uid]: profile.displayName, [story.authorId]: story.authorName },
        { [user.uid]: profile.avatarUrl || "", [story.authorId]: story.authorAvatar || "" }
      );

      // 2 — İzin isteği kaydı
      const reqId = await createNarrationRequest({
        storyId: story.id,
        storyTitle: story.title,
        narratorId: user.uid,
        narratorName: profile.displayName,
        narratorAvatar: profile.avatarUrl || "",
        authorId: story.authorId,
        status: "pending",
        conversationId: convId,
      });

      // 3 — DM mesajı gönder
      const msg = `🎙️ Merhaba! "${story.title}" adlı hikayenizi seslendirmek istiyorum. İzin verir misiniz?\n\n(Bu istek otomatik oluşturulmuştur — istek ID: ${reqId})`;
      await sendMessage({
        conversationId: convId,
        senderId: user.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl || "",
        text: msg,
      });

      setMyRequest({ id: reqId, storyId: story.id, storyTitle: story.title, narratorId: user.uid, narratorName: profile.displayName, narratorAvatar: profile.avatarUrl || "", authorId: story.authorId, status: "pending", conversationId: convId, createdAt: null as any });
      toast({ title: "İzin isteği gönderildi!", description: "Yazara DM olarak mesaj iletildi." });
    } catch (err) {
      console.error(err);
      toast({ title: "Hata", description: "İstek gönderilemedi.", variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    if (!file.type.includes("audio")) {
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

      {/* ─ YAZAR: Kendi Seslendirmesi ─ */}
      {user && isAuthor && (
        <div className="border border-primary/30 rounded-2xl p-5 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">👑</span>
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
                onClick={() => authorInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 shrink-0"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Yükleniyor..." : "Ses Yükle"}
              </button>
              <input
                ref={authorInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/m4a,audio/*"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Seslendirmeni yayında
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

      {/* ─ Narrator action area (okuyucular için) ─ */}
      {user && !isAuthor && (
        <div className="border border-border rounded-2xl p-5 bg-card">
          {!myRequest && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Bu hikayeyi seslendirmek ister misin?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Yazara DM üzerinden izin isteği gönderilir.</p>
              </div>
              <button onClick={handleRequest} disabled={requesting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 shrink-0">
                {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                İzin İste
              </button>
            </div>
          )}

          {myRequest?.status === "pending" && (
            <div className="flex items-center gap-3 text-amber-400">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">İzin isteğin bekleniyor</p>
                <p className="text-xs text-muted-foreground">Yazar DM'inden onayladığında ses yükleyebilirsin.</p>
              </div>
              <Link href={`/messages/${myRequest.conversationId}`}>
                <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 text-xs hover:bg-amber-400/10 transition-colors">
                  <Send className="w-3 h-3" /> DM'e Git
                </button>
              </Link>
            </div>
          )}

          {myRequest?.status === "rejected" && (
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">İzin isteğin reddedildi.</p>
            </div>
          )}

          {(myRequest?.status === "approved" || isAuthor) && !myNarration && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-green-400">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">İzin onaylandı!</p>
                  <p className="text-xs text-muted-foreground">MP3 veya WAV dosyasını yükleyebilirsin (max 100MB).</p>
                </div>
              </div>
              <button onClick={() => audioInputRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all disabled:opacity-60 shrink-0">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Yükleniyor..." : "Ses Yükle"}
              </button>
              <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/wav,audio/mp3,audio/*" className="hidden" onChange={handleUpload} />
            </div>
          )}

          {myNarration && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-green-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Senin Seslendirmen</p>
                <button onClick={() => handleDelete(myNarration)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <AudioPlayer narration={myNarration} />
            </div>
          )}
        </div>
      )}

      {/* ─ All narrations list ─ */}
      {narrations.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-border rounded-2xl">
          <Mic className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Henüz seslendirme yok.</p>
          <p className="text-sm text-muted-foreground mt-1">İlk seslendiren sen ol!</p>
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
                  <p className="text-xs text-muted-foreground">{Math.floor(n.durationSeconds / 60)}:{String(n.durationSeconds % 60).padStart(2, "0")} dakika</p>
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

        {/* Tabs */}
        <Tabs defaultValue="chapters">
          <TabsList className="bg-card border border-border mb-6">
            <TabsTrigger value="chapters" data-testid="tab-chapters">
              Bölümler ({chapters.length})
            </TabsTrigger>
            <TabsTrigger value="narrations">
              <Mic className="w-4 h-4 mr-1" /> Sesli
            </TabsTrigger>
            <TabsTrigger value="talent" data-testid="tab-talent">
              <Palette className="w-4 h-4 mr-1" /> Yetenek ({talents.length})
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

          <TabsContent value="narrations">
            <NarrationsTab story={story} />
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
