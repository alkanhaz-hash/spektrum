import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Users, Edit3, Instagram, Globe, Camera,
  MessageSquarePlus, Check, Trash2, Send, X, Pencil, ExternalLink, Mic, Play, Pause
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, updateUserProfile, ensureUserProfile, UserProfile } from "@/lib/auth-service";
import {
  getStoriesByAuthor, Story,
  getAnsweredQuestions, getUnansweredQuestions, sendAnonymousQuestion, answerQuestion, deleteQuestion, AnonymousQuestion,
  getNarrationsByNarrator, Narration,
} from "@/lib/firestore-service";
import { uploadUserAvatar, uploadUserCover } from "@/lib/storage-service";
import { moderateText } from "@/lib/moderation-service";
import { useToast } from "@/hooks/use-toast";

// ─── MINI AUDIO PLAYER (for profile narration cards) ─────────────────────────

function NarrationCard({ narration, index }: { narration: Narration; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="border border-border rounded-2xl p-4 bg-card">
      <div className="flex gap-3 mb-3">
        {narration.storyCoverUrl && (
          <img src={narration.storyCoverUrl} alt={narration.storyTitle} className="w-12 h-16 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <Link href={`/story/${narration.storyId}`}>
            <p className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer truncate">{narration.storyTitle}</p>
          </Link>
          <p className="text-xs text-muted-foreground">{narration.authorName} · {fmt(narration.durationSeconds)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors shadow-[0_0_10px_hsl(var(--primary)/0.35)]">
          {playing
            ? <Pause className="w-3.5 h-3.5 text-primary-foreground" />
            : <Play className="w-3.5 h-3.5 text-primary-foreground ml-0.5" />}
        </button>
        <input type="range" min="0" max="100" value={progress}
          onChange={e => {
            if (!audioRef.current) return;
            audioRef.current.currentTime = (Number(e.target.value) / 100) * (audioRef.current.duration || 0);
          }}
          className="flex-1 h-1 accent-primary cursor-pointer" />
        <span className="text-xs text-muted-foreground w-10 text-right">{fmt(currentTime)}</span>
      </div>
      <audio ref={audioRef} src={narration.audioUrl}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrentTime(audioRef.current.currentTime);
          setProgress((audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }} />
    </motion.div>
  );
}

// ─── BADGES ──────────────────────────────────────────────────────────────────

const BADGE_DEFS = [
  // Yazarlık rozetleri
  { id: "author", emoji: "✍️", label: "Hikayeci", desc: "İlk hikayesini yayınladı", condition: (p: UserProfile) => (p.storyCount ?? 0) >= 1 },
  { id: "ink_master", emoji: "🖋️", label: "Mürekkep Ustası", desc: "5+ hikaye yazdı", condition: (p: UserProfile) => (p.storyCount ?? 0) >= 5 },
  // Okuma rozetleri
  { id: "bookworm", emoji: "📚", label: "Kitap Kurdu", desc: "10+ hikaye okudu", condition: (p: UserProfile) => (p.readCount ?? 0) >= 10 },
  // Takipçi rozetleri — kademeli
  { id: "rising", emoji: "🌱", label: "Yükselen", desc: "50+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 50 },
  { id: "shining", emoji: "💫", label: "Parlayan", desc: "200+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 200 },
  { id: "popular", emoji: "🔥", label: "Popüler", desc: "1.000+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 1000 },
  { id: "celebrated", emoji: "⭐", label: "Ünlü", desc: "5.000+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 5000 },
  { id: "icon", emoji: "💎", label: "İkon", desc: "10.000+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 10000 },
  { id: "elite", emoji: "👑", label: "Elit", desc: "50.000+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 50000 },
  { id: "legend", emoji: "🏆", label: "Efsane", desc: "100.000+ takipçi", condition: (p: UserProfile) => (p.followerCount ?? 0) >= 100000 },
];

function getBadges(profile: UserProfile) {
  return BADGE_DEFS.filter(b => b.condition(profile));
}

// ─── EDIT PROFILE PANEL ───────────────────────────────────────────────────────

interface EditPanelProps {
  profile: UserProfile;
  onSave: (updated: UserProfile) => void;
  onClose: () => void;
}

function EditPanel({ profile, onSave, onClose }: EditPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    displayName: profile.displayName || "",
    bio: profile.bio || "",
    status: profile.status || "",
    instagram: profile.instagram || "",
    tiktok: profile.tiktok || "",
    website: profile.website || "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatarUrl || "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(profile.coverUrl || "");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let avatarUrl = profile.avatarUrl;
      let coverUrl = profile.coverUrl;
      if (avatarFile) avatarUrl = await uploadUserAvatar(user.uid, avatarFile);
      if (coverFile) coverUrl = await uploadUserCover(user.uid, coverFile);

      const updated = { ...form, avatarUrl, coverUrl };
      await updateUserProfile(user.uid, updated);
      onSave({ ...profile, ...updated });
      toast({ title: "Profil güncellendi!" });
      onClose();
    } catch {
      toast({ title: "Hata", description: "Profil kaydedilemedi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold text-lg font-serif">Profili Düzenle</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cover Photo */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Kapak Fotoğrafı</label>
            <div
              className="relative h-32 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border overflow-hidden cursor-pointer group"
              onClick={() => coverInputRef.current?.click()}
            >
              {coverPreview && <img src={coverPreview} alt="Kapak" className="w-full h-full object-cover" />}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
                <span className="text-white text-sm ml-2">Değiştir</span>
              </div>
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
          </div>

          {/* Avatar */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Profil Fotoğrafı</label>
            <div className="flex items-center gap-4">
              <div
                className="relative w-20 h-20 rounded-2xl bg-primary/10 border-2 border-border overflow-hidden cursor-pointer group flex-shrink-0"
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary">{form.displayName.charAt(0)}</div>
                }
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </div>
              <button onClick={() => avatarInputRef.current?.click()} className="text-sm text-primary hover:underline">
                Fotoğraf Seç
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Kullanıcı Adı</label>
            <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Durum (Status)</label>
            <input value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              placeholder="Şu an ne yapıyorsun?" maxLength={60}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Bio */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Hakkında</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Kendinden biraz bahset..." rows={3} maxLength={300}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>

          {/* Social Links */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground block">Sosyal Medya</label>
            <div className="flex items-center gap-3">
              <Instagram className="w-4 h-4 text-pink-400 shrink-0" />
              <input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                placeholder="instagram.com/kullanici" 
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[15px] shrink-0">🎵</span>
              <input value={form.tiktok} onChange={e => setForm(f => ({ ...f, tiktok: e.target.value }))}
                placeholder="tiktok.com/@kullanici"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                placeholder="https://websiteniz.com"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">İptal</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── ANONYMOUS Q&A ────────────────────────────────────────────────────────────

function QASection({ profile, isOwner }: { profile: UserProfile; isOwner: boolean }) {
  const { toast } = useToast();
  const [answered, setAnswered] = useState<AnonymousQuestion[]>([]);
  const [pending, setPending] = useState<AnonymousQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [answeringId, setAnsweringId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAnsweredQuestions(profile.uid),
      isOwner ? getUnansweredQuestions(profile.uid) : Promise.resolve([]),
    ]).then(([ans, pen]) => {
      setAnswered(ans);
      setPending(pen);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [profile.uid, isOwner]);

  const handleSend = async () => {
    if (!question.trim() || sending) return;
    setSending(true);
    try {
      const result = await moderateText(question, "tr");
      if (result.action === "rejected") {
        toast({ title: "Soru gönderilemedi", description: "Uygunsuz içerik tespit edildi.", variant: "destructive" });
        return;
      }
      await sendAnonymousQuestion(profile.uid, question.trim());
      setQuestion("");
      toast({ title: "Soru gönderildi!", description: "Yanıtlandığında profilinde görünecek." });
    } catch {
      toast({ title: "Hata", description: "Soru gönderilemedi.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleAnswer = async (qid: string) => {
    const ans = answerText[qid];
    if (!ans?.trim()) return;
    try {
      await answerQuestion(qid, ans.trim());
      const q = pending.find(p => p.id === qid);
      if (q) {
        setPending(prev => prev.filter(p => p.id !== qid));
        setAnswered(prev => [{ ...q, answer: ans.trim(), isAnswered: true }, ...prev]);
      }
      setAnsweringId(null);
      toast({ title: "Yanıtlandı!" });
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  };

  const handleDelete = async (qid: string, isPending: boolean) => {
    await deleteQuestion(qid);
    if (isPending) setPending(prev => prev.filter(p => p.id !== qid));
    else setAnswered(prev => prev.filter(a => a.id !== qid));
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Send question box (not shown to owner) */}
      {!isOwner && (
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Anonim Soru Sor</span>
            <span className="text-xs text-muted-foreground ml-auto">Kim olduğun gizli kalır</span>
          </div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Aklındaki soruyu yaz..."
            rows={3}
            maxLength={280}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{question.length}/280</span>
            <button onClick={handleSend} disabled={sending || !question.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
              <Send className="w-3.5 h-3.5" />
              {sending ? "Gönderiliyor..." : "Gönder"}
            </button>
          </div>
        </div>
      )}

      {/* Pending (only owner sees) */}
      {isOwner && pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Yanıt Bekleyen ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(q => (
              <div key={q.id} className="border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  <button onClick={() => handleDelete(q.id, true)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {answeringId === q.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={answerText[q.id] || ""}
                      onChange={e => setAnswerText(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Yanıtını yaz..."
                      rows={2}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleAnswer(q.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                        <Check className="w-3 h-3" /> Yanıtla
                      </button>
                      <button onClick={() => setAnsweringId(null)} className="px-3 py-1.5 rounded-lg border border-border text-xs">İptal</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAnsweringId(q.id)}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Yanıtla
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answered Q&As */}
      {answered.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-2xl">
          <MessageSquarePlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Henüz yanıtlanmış soru yok.</p>
          {!isOwner && <p className="text-muted-foreground text-xs mt-1">İlk soruyu sormak için yukarıdaki kutuyu kullan.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {answered.map(q => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="border border-border rounded-2xl overflow-hidden">
              <div className="bg-muted/30 px-5 py-3">
                <p className="text-sm text-muted-foreground">🙋 {q.question}</p>
              </div>
              <div className="px-5 py-3 flex items-start justify-between gap-2">
                <p className="text-sm">{q.answer}</p>
                {isOwner && (
                  <button onClick={() => handleDelete(q.id, false)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PROFILE PAGE ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stories" | "narrations" | "qa">("stories");
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const isOwner = user?.uid === uid;

  useEffect(() => {
    if (!uid || authLoading) return;
    setLoading(true);
    setError(null);
    const fetch = async () => {
      try {
        let p: UserProfile | null = null;
        if (isOwner && user) p = await ensureUserProfile(user);
        else p = await getUserProfile(uid);
        const [s, narrs] = await Promise.all([
          getStoriesByAuthor(uid),
          getNarrationsByNarrator(uid),
        ]);
        setProfile(p);
        setStories(s.filter(st => st.status === "published" || isOwner));
        setNarrations(narrs);
      } catch (err: any) {
        setError(err?.message || "Profil yüklenemedi");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [uid, authLoading, isOwner]);

  const handleProfileSave = async (updated: UserProfile) => {
    setProfile(updated);
    await refreshProfile();
  };

  if (loading || authLoading) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          <Skeleton className="h-52 rounded-2xl" />
          <div className="flex items-end gap-4 -mt-10 px-4">
            <Skeleton className="w-24 h-24 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2 pb-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-destructive font-medium mb-2">Profil yüklenemedi</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Tekrar Dene</button>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return <AppLayout><div className="text-center py-20 text-muted-foreground">Kullanıcı bulunamadı.</div></AppLayout>;
  }

  const badges = getBadges(profile);

  return (
    <AppLayout>
      {/* Edit Panel */}
      <AnimatePresence>
        {editOpen && (
          <EditPanel
            profile={profile}
            onSave={handleProfileSave}
            onClose={() => setEditOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto px-4 pb-16">

        {/* ── Cover ── */}
        <div className="relative h-52 bg-gradient-to-br from-primary/30 via-secondary/20 to-background border-b border-border overflow-hidden">
          {profile.coverUrl && <img src={profile.coverUrl} alt="Kapak" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          {isOwner && (
            <button
              onClick={() => setEditOpen(true)}
              className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/20 text-white text-xs hover:bg-black/70 transition-colors"
            >
              <Edit3 className="w-3 h-3" /> Profili Düzenle
            </button>
          )}
        </div>

        {/* ── Avatar + Info ── */}
        <div className="px-4 sm:px-6">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl border-4 border-background bg-card overflow-hidden shadow-xl">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary bg-primary/10">{profile.displayName?.charAt(0) || "?"}</div>
                }
              </div>
            </div>
            {isOwner && (
              <Link href="/write">
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.3)]">
                  <Edit3 className="w-3.5 h-3.5" /> Yaz
                </button>
              </Link>
            )}
          </div>

          {/* Name + Status */}
          <div className="mb-3">
            <h1 className="text-2xl font-bold font-serif">{profile.displayName}</h1>
            {profile.status && (
              <div className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {profile.status}
              </div>
            )}
          </div>

          {/* Bio */}
          {profile.bio && <p className="text-muted-foreground text-sm mb-4 max-w-lg leading-relaxed">{profile.bio}</p>}

          {/* Social Links */}
          {(profile.instagram || profile.tiktok || profile.website) && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {profile.instagram && (
                <a href={profile.instagram.startsWith("http") ? profile.instagram : `https://${profile.instagram}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-pink-400 transition-colors border border-border hover:border-pink-400/50 rounded-lg px-3 py-1.5">
                  <Instagram className="w-3.5 h-3.5" /> Instagram
                </a>
              )}
              {profile.tiktok && (
                <a href={profile.tiktok.startsWith("http") ? profile.tiktok : `https://${profile.tiktok}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border hover:border-primary/50 rounded-lg px-3 py-1.5">
                  🎵 TikTok
                </a>
              )}
              {profile.website && (
                <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-cyan-400 transition-colors border border-border hover:border-cyan-400/50 rounded-lg px-3 py-1.5">
                  <Globe className="w-3.5 h-3.5" /> Website
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 mb-5 text-sm">
            <div className="text-center">
              <p className="font-bold text-lg">{profile.storyCount ?? 0}</p>
              <p className="text-muted-foreground text-xs">Hikaye</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followerCount ?? 0}</p>
              <p className="text-muted-foreground text-xs">Takipçi</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followingCount ?? 0}</p>
              <p className="text-muted-foreground text-xs">Takip</p>
            </div>
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {badges.map(b => (
                <div key={b.id} title={b.desc}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 text-xs font-semibold cursor-default">
                  <span>{b.emoji}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-1 border-b border-border mb-6">
            {[
              { key: "stories", label: "Hikayeleri", icon: <BookOpen className="w-4 h-4" /> },
              { key: "narrations", label: "Sesli Kitaplar", icon: <Mic className="w-4 h-4" /> },
              { key: "qa", label: "Soru & Cevap", icon: <MessageSquarePlus className="w-4 h-4" /> },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Stories Tab ── */}
          {activeTab === "stories" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {stories.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border rounded-2xl">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{isOwner ? "Henüz hikaye yazmamışsın." : "Yayınlanmış hikaye yok."}</p>
                  {isOwner && (
                    <Link href="/write">
                      <button className="mt-3 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                        İlk Hikayeni Yaz
                      </button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {stories.map((s, i) => (
                    <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Link href={`/story/${s.id}`}>
                        <div className="group cursor-pointer">
                          <div className="aspect-[2/3] rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border overflow-hidden mb-2 group-hover:border-primary/50 transition-all group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.2)]">
                            {s.coverUrl && <img src={s.coverUrl} alt={s.title} className="w-full h-full object-cover" />}
                          </div>
                          <h3 className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{s.title}</h3>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs border-primary/20 text-primary/70">{s.genre}</Badge>
                            {isOwner && s.status !== "published" && (
                              <Badge variant="secondary" className="text-xs">
                                {s.status === "draft" ? "Taslak" : s.status === "completed" ? "Tamamlandı" : s.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Narrations Tab ── */}
          {activeTab === "narrations" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {narrations.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border rounded-2xl">
                  <Mic className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{isOwner ? "Henüz bir hikaye seslendirmemişsin." : "Yayınlanmış seslendirme yok."}</p>
                  {isOwner && <p className="text-xs text-muted-foreground mt-1">Bir hikaye sayfasından izin isteyerek başlayabilirsin.</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  {narrations.map((n, i) => (
                    <NarrationCard key={n.id} narration={n} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Q&A Tab ── */}
          {activeTab === "qa" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <QASection profile={profile} isOwner={isOwner} />
            </motion.div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
