import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, CheckCircle, XCircle, Eye, Users, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPendingChapters, updateChapterStatus, getStory, Chapter,
} from "@/lib/firestore-service";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface UserSummary {
  uid: string;
  displayName: string;
  avatarUrl: string;
  role: "user" | "moderator" | "admin";
}

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

// ─── Bölüm İnceleme ──────────────────────────────────────────────────────────

function ReviewTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getPendingChapters().then(async (chs) => {
      const withTitles = await Promise.all(chs.map(async ch => {
        const story = await getStory(ch.storyId).catch(() => null);
        return { ...ch, storyTitle: story?.title };
      }));
      setItems(withTitles);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;

  if (items.length === 0) {
    return (
      <div className="py-20 text-center border border-dashed border-border rounded-2xl">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <p className="text-lg font-semibold mb-1">Her şey temiz!</p>
        <p className="text-muted-foreground">İnceleme bekleyen bölüm yok.</p>
      </div>
    );
  }

  return (
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
          <div className="bg-background rounded-xl p-4 mb-4 max-h-40 overflow-y-auto border border-border">
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.content}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/read/${item.storyId}/${item.id}`}>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-primary/50 text-sm transition-colors" data-testid={`button-preview-${item.id}`}>
                <Eye className="w-4 h-4" /> Önizle
              </button>
            </Link>
            <button onClick={() => handleDecision(item.id, "published")} disabled={processing === item.id}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm transition-colors disabled:opacity-60"
              data-testid={`button-approve-${item.id}`}>
              <CheckCircle className="w-4 h-4" /> Onayla
            </button>
            <button onClick={() => handleDecision(item.id, "rejected")} disabled={processing === item.id}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-colors disabled:opacity-60"
              data-testid={`button-reject-${item.id}`}>
              <XCircle className="w-4 h-4" /> Reddet
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Kullanıcı Yönetimi (yalnızca admin) ─────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { user: "Kullanıcı", moderator: "Moderatör", admin: "Admin" };
const ROLE_COLORS: Record<string, string> = {
  user: "text-muted-foreground border-border",
  moderator: "text-primary border-primary/40",
  admin: "text-amber-400 border-amber-400/40",
};

function UsersTab({ currentUid, getToken }: { currentUid: string; getToken: () => Promise<string> }) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const t = term.trim();
    if (!t) { setResults([]); setSearched(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(t)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Arama başarısız");
        const data = await res.json() as UserSummary[];
        if (!cancelled) { setResults(data); setSearched(true); }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term, getToken]);

  const handleRoleChange = async (u: UserSummary, newRole: "user" | "moderator") => {
    if (u.uid === currentUid) {
      toast({ title: "Kendi rolünü değiştiremezsin.", variant: "destructive" });
      return;
    }
    setSaving(u.uid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${u.uid}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "İzin reddedildi");
      }
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, role: newRole } : r));
      toast({ title: newRole === "moderator" ? `${u.displayName} moderatör yapıldı` : `${u.displayName} rolü kaldırıldı` });
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "Bilinmeyen hata";
      toast({ title: "Hata", description: msg, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Kullanıcı adıyla ara, moderatör yap veya rolü kaldır.</p>
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Kullanıcı adı ara..."
          className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {loading && <Skeleton className="h-16 rounded-xl" />}

      {!loading && searched && results.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">Kullanıcı bulunamadı.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          {results.map(u => (
            <div key={u.uid} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold text-muted-foreground">{u.displayName.charAt(0)}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{u.displayName}</p>
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {u.role !== "admin" && u.uid !== currentUid && (
                  u.role === "moderator" ? (
                    <button
                      onClick={() => handleRoleChange(u, "user")}
                      disabled={saving === u.uid}
                      className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                      Rolü Kaldır
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRoleChange(u, "moderator")}
                      disabled={saving === u.uid}
                      className="px-3 py-1.5 rounded-lg text-xs border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
                      Moderatör Yap
                    </button>
                  )
                )}
                {u.uid === currentUid && (
                  <span className="text-xs text-muted-foreground italic">Sen</span>
                )}
                {u.role === "admin" && u.uid !== currentUid && (
                  <span className="text-xs text-amber-400/60 italic">Admin değiştirilemez</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!searched && (
        <p className="text-muted-foreground text-sm text-center py-8">Aramak için kullanıcı adı yaz.</p>
      )}
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ModeratorPage() {
  const [, setLocation] = useLocation();
  const { user, profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"review" | "users">("review");

  useEffect(() => {
    if (authLoading) return; // auth yüklenene kadar bekle — erken yönlendirmeyi önler
    if (!user) { setLocation("/auth"); return; }
    if (!profile || (profile.role !== "moderator" && profile.role !== "admin")) {
      setLocation("/");
    }
  }, [user, profile, authLoading]);

  if (authLoading || !profile) return null;

  const isAdmin = profile.role === "admin";

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold font-serif">Moderatör Paneli</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              isAdmin
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-primary/15 border-primary/40 text-primary"
            }`}>
              {isAdmin ? "👑 Admin" : "🛡️ Moderatör"}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? "Bölüm inceleme + kullanıcı yönetimi yetkisine sahipsin."
              : "Bölüm inceleme yetkisine sahipsin. Kullanıcı yönetimi için Admin rolü gerekir."}
          </p>
          {!isAdmin && (
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
            >
              Rol güncellemediyse sayfayı yenile →
            </button>
          )}
        </motion.div>

        {/* Sekmeler */}
        <div className="flex gap-1 border-b border-border mb-6">
          <button
            onClick={() => setTab("review")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "review" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Eye className="w-4 h-4" /> Bölüm İnceleme
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("users")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <Users className="w-4 h-4" /> Kullanıcı Yönetimi
            </button>
          )}
        </div>

        {tab === "review" && <ReviewTab />}
        {tab === "users" && isAdmin && user && (
          <UsersTab currentUid={user.uid} getToken={() => user.getIdToken()} />
        )}
      </div>
    </AppLayout>
  );
}
