import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MessageSquare, Heart, Send, X, List, Flag, UserPlus, UserCheck, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChapter, getChaptersByStory, getInlineComments,
  addInlineComment, likeInlineComment, incrementUserReadCount, incrementChapterReadCount, incrementStoryReadCount,
  createNotification, reportContent, followUser, unfollowUser, isFollowingUser,
  Story, Chapter, InlineComment
} from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";

interface CommentThreadProps {
  paragraphIndex: number;
  paragraphAnchor: string;
  storyId: string;
  chapterId: string;
  comments: InlineComment[];
  onClose: () => void;
  onAddComment: (text: string, paragraphIndex: number, paragraphAnchor: string) => Promise<void>;
  onLike: (commentId: string, liked: boolean) => void;
  onReport: (commentId: string) => void;
  userId?: string;
}

function CommentThread({ paragraphIndex, paragraphAnchor, storyId: _storyId, chapterId: _chapterId, comments, onClose, onAddComment, onLike, onReport, userId }: CommentThreadProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Anchor metin eşleşmesi öncelikli; eski yorumlar index ile eşleşir
  const threadComments = comments.filter(c =>
    c.paragraphAnchor ? c.paragraphAnchor === paragraphAnchor : c.paragraphIndex === paragraphIndex
  );

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    await onAddComment(text.trim(), paragraphIndex, paragraphAnchor);
    setText("");
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="absolute left-0 right-0 mt-2 z-20 bg-card border border-border rounded-xl shadow-2xl shadow-primary/10 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-primary">Satır Arası Yorumlar</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-thread">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
        {threadComments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">İlk yorumu sen yap!</p>
        )}
        {threadComments.map(c => (
          <div key={c.id} className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {c.authorName.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold">{c.authorName}</span>
                {userId && userId !== c.authorId && (
                  <button
                    onClick={() => onReport(c.id)}
                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                    title="Yorumu bildir"
                  >
                    <Flag className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-sm text-foreground/90">{c.text}</p>
              <button
                onClick={() => onLike(c.id, !c.likedBy?.includes(userId || ""))}
                className={`flex items-center gap-1 text-xs mt-1 transition-colors ${c.likedBy?.includes(userId || "") ? "text-pink-400" : "text-muted-foreground hover:text-pink-400"}`}
                data-testid={`button-like-comment-${c.id}`}
              >
                <Heart className={`w-3 h-3 ${c.likedBy?.includes(userId || "") ? "fill-pink-400" : ""}`} /> {c.likeCount}
              </button>
            </div>
          </div>
        ))}
      </div>

      {userId && (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Yorumunu yaz..."
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-comment"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-submit-comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
      {!userId && <p className="text-xs text-muted-foreground text-center">Yorum yapmak için <Link href="/auth" className="text-primary hover:underline">giriş yap</Link>.</p>}
    </motion.div>
  );
}

export default function ReadPage() {
  const { storyId, chapterId } = useParams<{ storyId: string; chapterId: string }>();
  const [, setLocation] = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [story, setStory] = useState<Story | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [comments, setComments] = useState<InlineComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openThread, setOpenThread] = useState<number | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  // Font boyutu localStorage'de korunuyor — bölümler arası kaybolmaz
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("spektrum_font_size");
    return saved ? Number(saved) : 18;
  });

  // Font boyutu değişince localStorage'e kaydet
  useEffect(() => {
    localStorage.setItem("spektrum_font_size", String(fontSize));
  }, [fontSize]);

  // Yazar takip durumu
  useEffect(() => {
    if (!user || !story) return;
    if (user.uid === story.authorId) return;
    isFollowingUser(user.uid, story.authorId).then(setIsFollowing).catch(() => {});
  }, [user?.uid, story?.authorId]);

  useEffect(() => {
    if (!storyId || !chapterId) return;
    setLoading(true);
    // Kritik: hikaye + bölüm birlikte yükle. Diğerleri başarısız olsa sayfa çökmez.
    Promise.all([
      getStory(storyId),
      getChapter(chapterId),
    ]).then(([s, ch]) => {
      // Güvenlik: taslak/reddedilen bölüm yalnızca yazar ve moderatör/admin görebilir
      if (ch && ch.status !== "published"
          && user?.uid !== s?.authorId
          && profile?.role !== "moderator"
          && profile?.role !== "admin") {
        setLocation(`/story/${storyId}`);
        return;
      }
      setStory(s);
      setChapter(ch);
      setLoading(false);
      // Firestore kuralı isSignedIn() gerektiriyor; kullanıcı yokken
      // sessionStorage anahtarını YAZMA — auth yüklenince tekrar dener.
      if (user) {
        const sessionKey = `spektrum_read_${chapterId}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, "1");
          incrementChapterReadCount(chapterId).catch(() => {});
          incrementStoryReadCount(storyId).catch(() => {});
          incrementUserReadCount(user.uid).catch(() => {});
        }
      }
      // İkincil veriler — hata olsa sayfa çökmez
      getChaptersByStory(storyId, true)
        .then(allCh => setAllChapters(allCh.filter(c => c.status === "published" || c.id === chapterId)))
        .catch(() => {});
      getInlineComments(chapterId)
        .then(cmts => setComments(cmts))
        .catch(() => {});
    }).catch(() => setLoading(false));
  }, [storyId, chapterId, user?.uid, profile?.role]);

  const paragraphs = chapter?.content.split(/\n+/).filter(p => p.trim()) ?? [];

  // Paragraf anchor'ı: ilk 60 karakter
  const getParagraphAnchor = (para: string) => para.trim().slice(0, 60);

  // Anchor eşleşmesi öncelikli, yoksa index
  const commentCountForParagraph = (idx: number) => {
    const anchor = paragraphs[idx] ? getParagraphAnchor(paragraphs[idx]) : "";
    return comments.filter(c =>
      c.paragraphAnchor ? c.paragraphAnchor === anchor : c.paragraphIndex === idx
    ).length;
  };

  const handleAddComment = async (text: string, paragraphIndex: number, paragraphAnchor: string) => {
    if (!user || !profile || !storyId || !chapterId) return;
    if (profile.banned) {
      toast({ title: "Hesabın askıya alındı", description: profile.banReason || "Askıya alınan hesaplar yorum gönderemez.", variant: "destructive" });
      return;
    }
    try {
      await addInlineComment({ storyId, chapterId, paragraphIndex, paragraphAnchor, authorId: user.uid, authorName: profile.displayName, authorAvatar: profile.avatarUrl, text });
      const updated = await getInlineComments(chapterId);
      setComments(updated);
      if (story && story.authorId !== user.uid) {
        createNotification({
          recipientId: story.authorId,
          senderId: user.uid,
          senderName: profile.displayName,
          senderAvatar: profile.avatarUrl ?? "",
          type: "comment",
          storyId: storyId,
          storyTitle: story.title,
        }).catch(() => {});
      }
    } catch {
      toast({ title: "Yorum gönderilemedi", description: "Lütfen tekrar dene.", variant: "destructive" });
    }
  };

  const handleReport = async (commentId: string) => {
    if (!user) { toast({ title: "Giriş gerekli" }); return; }
    try {
      await reportContent({ reportedId: commentId, reportedType: "comment", reporterId: user.uid });
      toast({ title: "Yorum bildirildi", description: "Moderatörler inceleyecek." });
    } catch {
      toast({ title: "Bildirilemedi", variant: "destructive" });
    }
  };

  const handleFollow = async () => {
    if (!user || !story) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(user.uid, story.authorId);
        setIsFollowing(false);
      } else {
        await followUser(user.uid, story.authorId);
        setIsFollowing(true);
        if (profile) {
          createNotification({
            recipientId: story.authorId,
            senderId: user.uid,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl ?? "",
            type: "follow",
          }).catch(() => {});
        }
      }
    } catch {
      toast({ title: "İşlem başarısız", variant: "destructive" });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleLike = async (commentId: string, liked: boolean) => {
    if (!user) { toast({ title: "Giriş gerekli", description: "Beğenmek için giriş yapmalısın." }); return; }
    await likeInlineComment(commentId, user.uid, liked);
    setComments(prev => prev.map(c => c.id === commentId
      ? { ...c, likeCount: c.likeCount + (liked ? 1 : -1), likedBy: liked ? [...(c.likedBy || []), user.uid] : (c.likedBy || []).filter(id => id !== user.uid) }
      : c
    ));
  };

  const currentIndex = allChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-10">
          <Skeleton className="h-8 w-48 mb-6" />
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 rounded mb-3" />)}
        </div>
      </AppLayout>
    );
  }

  if (!chapter) {
    return <AppLayout><div className="text-center py-20 text-muted-foreground">Bölüm bulunamadı.</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/story/${storyId}`}>
            <span className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1 mb-2">
              <ChevronLeft className="w-4 h-4" /> {story?.title}
            </span>
          </Link>
          <h1 className="text-2xl font-bold font-serif">{chapter.title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <span>Bölüm {chapter.order}</span>
            <span>{chapter.wordCount.toLocaleString("tr-TR")} kelime</span>
            <div className="flex items-center gap-2 ml-auto">
              {/* İçindekiler */}
              <div className="relative">
                <button
                  onClick={() => setShowToc(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border hover:border-primary/50 transition-colors"
                  title="İçindekiler"
                >
                  <List className="w-3.5 h-3.5" /> İçindekiler
                </button>
                <AnimatePresence>
                  {showToc && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-30 max-h-72 overflow-y-auto"
                    >
                      <div className="p-2 space-y-0.5">
                        {allChapters.map((ch, i) => (
                          <Link key={ch.id} href={`/read/${storyId}/${ch.id}`} onClick={() => setShowToc(false)}>
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${ch.id === chapterId ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{i + 1}. {ch.title}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button onClick={() => setFontSize(f => Math.max(14, f - 2))} className="text-xs px-2 py-1 rounded border border-border hover:border-primary/50 transition-colors">A-</button>
              <button onClick={() => setFontSize(f => Math.min(26, f + 2))} className="text-xs px-2 py-1 rounded border border-border hover:border-primary/50 transition-colors">A+</button>
              {user && story && user.uid !== story.authorId && (
                <button
                  onClick={async () => {
                    if (!chapterId) return;
                    try {
                      await reportContent({ reportedId: chapterId, reportedType: "chapter", reporterId: user.uid });
                      toast({ title: "Bölüm şikayet edildi", description: "Moderatörler inceleyecek." });
                    } catch {
                      toast({ title: "Şikayet gönderilemedi", variant: "destructive" });
                    }
                  }}
                  className="text-muted-foreground/50 hover:text-red-400 transition-colors p-1"
                  title="Bölümü şikayet et"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content with inline comments */}
        <div className="space-y-1" onClick={() => setShowToc(false)}>
          {paragraphs.map((para, idx) => {
            const anchor = getParagraphAnchor(para);
            return (
              <div key={idx} className="relative group">
                <div
                  className="relative py-3 pr-10 leading-relaxed cursor-pointer rounded-lg hover:bg-primary/5 transition-colors group"
                  style={{ fontSize: `${fontSize}px` }}
                  onClick={() => setOpenThread(openThread === idx ? null : idx)}
                  data-testid={`paragraph-${idx}`}
                >
                  {para}
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-muted-foreground bg-card border border-border rounded-full px-2 py-1 hover:border-primary/50 hover:text-primary">
                    <MessageSquare className="w-3 h-3" />
                    {commentCountForParagraph(idx) > 0 && <span>{commentCountForParagraph(idx)}</span>}
                  </button>
                </div>

                {commentCountForParagraph(idx) > 0 && openThread !== idx && (
                  <div className="flex items-center gap-1 text-xs text-primary/60 pl-2 pb-1 cursor-pointer" onClick={() => setOpenThread(idx)}>
                    <MessageSquare className="w-3 h-3" /> {commentCountForParagraph(idx)} yorum
                  </div>
                )}

                <AnimatePresence>
                  {openThread === idx && (
                    <CommentThread
                      paragraphIndex={idx}
                      paragraphAnchor={anchor}
                      storyId={storyId!}
                      chapterId={chapterId!}
                      comments={comments}
                      onClose={() => setOpenThread(null)}
                      onAddComment={handleAddComment}
                      onLike={handleLike}
                      onReport={handleReport}
                      userId={user?.uid}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Chapter nav */}
        <div className="flex items-center justify-between mt-16 pt-8 border-t border-border">
          {prevChapter ? (
            <Link href={`/read/${storyId}/${prevChapter.id}`}>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors" data-testid="button-prev-chapter">
                <ChevronLeft className="w-4 h-4" /> Önceki Bölüm
              </button>
            </Link>
          ) : <div />}
          {nextChapter ? (
            <Link href={`/read/${storyId}/${nextChapter.id}`}>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)]" data-testid="button-next-chapter">
                Sonraki Bölüm <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          ) : (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {user && story && user.uid !== story.authorId && (
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isFollowing ? "border border-border hover:border-red-400/50 hover:text-red-400 text-muted-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:shadow-[0_0_12px_hsl(var(--secondary)/0.4)]"}`}
                >
                  {isFollowing ? <><UserCheck className="w-4 h-4" /> Takip Ediliyor</> : <><UserPlus className="w-4 h-4" /> Yazarı Takip Et</>}
                </button>
              )}
              <Link href={`/story/${storyId}`}>
                <button className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors">Hikayeye Dön</button>
              </Link>
            </div>
          )}
        </div>

        {/* Son bölüm tebrik mesajı */}
        {!nextChapter && (
          <div className="mt-8 p-5 rounded-2xl border border-primary/20 bg-primary/5 text-center space-y-2">
            <p className="text-lg font-serif font-semibold">🎉 Hikayenin sonuna ulaştın!</p>
            <p className="text-sm text-muted-foreground">Bu hikayeyi beğendiysen yazarı takip etmeyi unutma.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
