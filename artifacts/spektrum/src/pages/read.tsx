import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MessageSquare, Heart, Send, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStory, getChapter, getChaptersByStory, getInlineComments,
  addInlineComment, likeInlineComment, incrementUserReadCount, incrementChapterReadCount,
  createNotification,
  Story, Chapter, InlineComment
} from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";

interface CommentThreadProps {
  paragraphIndex: number;
  storyId: string;
  chapterId: string;
  comments: InlineComment[];
  onClose: () => void;
  onAddComment: (text: string, paragraphIndex: number) => Promise<void>;
  onLike: (commentId: string, liked: boolean) => void;
  userId?: string;
}

function CommentThread({ paragraphIndex, storyId: _storyId, chapterId: _chapterId, comments, onClose, onAddComment, onLike, userId }: CommentThreadProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const threadComments = comments.filter(c => c.paragraphIndex === paragraphIndex);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    await onAddComment(text.trim(), paragraphIndex);
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
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">{c.authorName}</span>
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
  // Font boyutu localStorage'de korunuyor — bölümler arası kaybolmaz
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("spektrum_font_size");
    return saved ? Number(saved) : 18;
  });

  // Font boyutu değişince localStorage'e kaydet
  useEffect(() => {
    localStorage.setItem("spektrum_font_size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (!storyId || !chapterId) return;
    setLoading(true);
    Promise.all([
      getStory(storyId),
      getChapter(chapterId),
      getChaptersByStory(storyId, true),
      getInlineComments(chapterId),
    ]).then(([s, ch, allCh, cmts]) => {
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
      setAllChapters(allCh.filter(c => c.status === "published" || c.id === chapterId));
      setComments(cmts);
      setLoading(false);
      const sessionKey = `spektrum_read_${chapterId}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        incrementChapterReadCount(chapterId).catch(() => {});
        if (user) incrementUserReadCount(user.uid).catch(() => {});
      }
    }).catch(() => setLoading(false));
  }, [storyId, chapterId, user?.uid, profile?.role]);

  const paragraphs = chapter?.content.split(/\n+/).filter(p => p.trim()) ?? [];

  const commentCountForParagraph = (idx: number) => comments.filter(c => c.paragraphIndex === idx).length;

  const handleAddComment = async (text: string, paragraphIndex: number) => {
    if (!user || !profile || !storyId || !chapterId) return;
    try {
      await addInlineComment({ storyId, chapterId, paragraphIndex, authorId: user.uid, authorName: profile.displayName, authorAvatar: profile.avatarUrl, text });
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
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Bölüm {chapter.order}</span>
            <span>{chapter.wordCount.toLocaleString("tr-TR")} kelime</span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setFontSize(f => Math.max(14, f - 2))} className="text-xs px-2 py-1 rounded border border-border hover:border-primary/50 transition-colors">A-</button>
              <button onClick={() => setFontSize(f => Math.min(26, f + 2))} className="text-xs px-2 py-1 rounded border border-border hover:border-primary/50 transition-colors">A+</button>
            </div>
          </div>
        </div>

        {/* Content with inline comments */}
        <div className="space-y-1">
          {paragraphs.map((para, idx) => (
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
                    storyId={storyId!}
                    chapterId={chapterId!}
                    comments={comments}
                    onClose={() => setOpenThread(null)}
                    onAddComment={handleAddComment}
                    onLike={handleLike}
                    userId={user?.uid}
                  />
                )}
              </AnimatePresence>
            </div>
          ))}
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
            <Link href={`/story/${storyId}`}>
              <button className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors">Hikayeye Dön</button>
            </Link>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
