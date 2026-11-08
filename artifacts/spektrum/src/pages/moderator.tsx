import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, CheckCircle, XCircle, Eye, Search, Ban, ShieldOff, AlertTriangle, ExternalLink, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPendingChapters, updateChapterStatus, updateStory, getStory, getChapter,
  Chapter, Story, InlineComment,
  banUser, unbanUser, searchUsersForMod, getAllUsersForMod, findAdminUserByEmail, createNotification, setUserRole,
  getReports, resolveReport, Report,
  getUserById, getInlineCommentById, deleteInlineComment,
  getPlatformStats, PlatformStats,
} from "@/lib/firestore-service";
import type { AdminUserSearchResult } from "@/lib/firestore-service";
import type { UserProfile } from "@/lib/auth-service";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface PendingItem extends Chapter {
  storyTitle?: string;
  authorId?: string;
  authorName?: string;
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
  const { user, profile: modProfile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getPendingChapters().then(async (chs) => {
      const withTitles = await Promise.all(chs.map(async ch => {
        const story = await getStory(ch.storyId).catch(() => null);
        return { ...ch, storyTitle: story?.title, authorId: story?.authorId, authorName: story?.authorName };
      }));
      setItems(withTitles);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDecision = async (chapterId: string, decision: "published" | "rejected") => {
    setProcessing(chapterId);
    try {
      await updateChapterStatus(chapterId, decision);
      const item = items.find(i => i.id === chapterId);
      setItems(prev => prev.filter(i => i.id !== chapterId));
      if (decision === "published" && item?.storyId) {
        updateStory(item.storyId, { status: "published" }).catch(() => {});
      }
      toast({ title: decision === "published" ? "Bölüm onaylandı" : "Bölüm reddedildi" });
      if (item?.authorId && user && modProfile) {
        createNotification({
          recipientId: item.authorId,
          senderId: user.uid,
          senderName: modProfile.displayName,
          senderAvatar: modProfile.avatarUrl ?? "",
          type: decision === "published" ? "chapter_approved" : "chapter_rejected",
          storyId: item.storyId,
          storyTitle: item.storyTitle,
        }).catch(() => {});
      }
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

function UsersTab({ currentUid }: { currentUid: string }) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [emailResults, setEmailResults] = useState<AdminUserSearchResult[] | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSearchError, setEmailSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(""); setResults([]); setVisibleCount(50);
    let cancelled = false;
    void (async () => {
      try {
        const users = await getAllUsersForMod();
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setError("Kullanıcılar yüklenemedi. Bağlantını ve yönetici izinlerini kontrol edip yeniden dene.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUid, reload]);

  const queryText = term.trim();
  const emailMode = queryText.includes("@");
  const needle = queryText.toLocaleLowerCase("tr");
  useEffect(() => {
    if (!emailMode) {
      setEmailResults(null);
      setEmailLoading(false);
      setEmailSearchError("");
      return;
    }
    setEmailResults([]);
    setEmailLoading(true);
    setEmailSearchError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(queryText)) {
      setEmailLoading(false);
      setEmailSearchError("E-posta ile aramak için adresin tamamını yaz.");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setEmailLoading(true);
      void findAdminUserByEmail(queryText).then(found => {
        if (!cancelled) setEmailResults(found);
      }).catch((error: unknown) => {
        if (!cancelled) setEmailSearchError(error instanceof Error ? error.message : "E-posta araması tamamlanamadı.");
      }).finally(() => {
        if (!cancelled) setEmailLoading(false);
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [emailMode, queryText, currentUid]);
  const filtered: Array<UserProfile | AdminUserSearchResult> = emailMode
    ? emailResults ?? []
    : results.filter(u => u.displayName.toLocaleLowerCase("tr").includes(needle)
      || u.uid.toLocaleLowerCase("tr").includes(needle));

  const handleRoleChange = async (u: UserProfile | AdminUserSearchResult, newRole: "user" | "moderator") => {
    if (u.uid === currentUid) {
      toast({ title: "Kendi rolünü değiştiremezsin.", variant: "destructive" });
      return;
    }
    setSaving(u.uid);
    try {
      await setUserRole(u.uid, newRole);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, role: newRole } : r));
      setEmailResults(prev => prev?.map(r => r.uid === u.uid ? { ...r, role: newRole } : r) ?? null);
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Kayıtlı kullanıcıları görüntüle, profillerini aç ve rollerini yönet.</p>
        <button type="button" disabled={loading} onClick={() => setReload(n => n + 1)} className="text-sm text-primary disabled:opacity-50">Yenile</button>
      </div>
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={term}
          onChange={e => { setTerm(e.target.value); setVisibleCount(50); }}
          placeholder="İsim, kullanıcı kimliği veya tam e-posta ara..."
          aria-label="İsim veya tam e-posta ile kullanıcı ara"
          className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <p className="text-xs text-muted-foreground mb-3">İsimle arayabilir veya e-posta adresinin tamamını yazabilirsin.</p>
      {(loading || emailLoading) && <Skeleton className="h-16 rounded-xl" />}

      {error && <p role="alert" className="text-sm text-destructive py-4">{error}</p>}
      {emailSearchError && <p role="alert" className="text-sm text-destructive py-4">{emailSearchError}</p>}
      {!loading && !emailLoading && !error && !emailSearchError && <p className="text-xs text-muted-foreground mb-3" role="status">{emailMode ? `${filtered.length} kullanıcı bulundu` : `${filtered.length} / ${results.length} kullanıcı`}</p>}
      {!loading && !emailLoading && !error && !emailSearchError && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">{needle ? "Aramana uygun kullanıcı bulunamadı." : "Henüz kayıtlı kullanıcı yok."}</p>
      )}

      {!loading && !emailLoading && !error && !emailSearchError && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.slice(0, visibleCount).map(u => (
            <div key={u.uid} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold text-muted-foreground">{u.displayName.charAt(0)}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{u.displayName}</p>
                  {"email" in u && u.email && <p className="text-xs text-muted-foreground break-all">{u.email}</p>}
                  <p className="text-xs text-muted-foreground truncate max-w-52" title={u.uid}>{u.uid}</p>
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/profile/${encodeURIComponent(u.uid)}`} className="px-3 py-1.5 rounded-lg text-xs border border-border text-primary">Profili aç</Link>
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

      {!loading && !emailLoading && !error && !emailSearchError && visibleCount < filtered.length && <button type="button" onClick={() => setVisibleCount(n => n + 50)}
        className="mt-4 w-full rounded-xl border border-border py-3 text-sm text-primary">Daha fazla göster ({filtered.length - visibleCount})</button>}
    </div>
  );
}

// ─── Kullanıcı Askıya Alma (moderatör + admin) ───────────────────────────────

function BanTab() {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [banReason, setBanReason] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = term.trim();
    if (!t) { setResults([]); setSearched(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const users = await searchUsersForMod(t);
        if (!cancelled) { setResults(users); setSearched(true); }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term]);

  const handleBan = async (u: UserProfile) => {
    const reason = banReason[u.uid]?.trim() || "Topluluk kurallarını ihlal";
    setSaving(u.uid);
    try {
      await banUser(u.uid, reason);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: true, banReason: reason } : r));
      toast({ title: `${u.displayName} askıya alındı` });
    } catch {
      toast({ title: "Hata", description: "İşlem başarısız.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleUnban = async (u: UserProfile) => {
    setSaving(u.uid);
    try {
      await unbanUser(u.uid);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: false, banReason: "" } : r));
      toast({ title: `${u.displayName} yasağı kaldırıldı` });
    } catch {
      toast({ title: "Hata", description: "İşlem başarısız.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Kullanıcıyı askıya al veya yasağını kaldır. Askıya alınan kullanıcılar içerik üretemez.</p>
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
        <div className="space-y-3">
          {results.map(u => (
            <div key={u.uid} className={`p-4 rounded-xl border ${u.banned ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold text-muted-foreground">{u.displayName?.charAt(0)}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{u.displayName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs border rounded-full px-2 py-0.5 ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    {u.banned && (
                      <span className="text-xs border border-red-500/40 text-red-400 bg-red-500/10 rounded-full px-2 py-0.5 flex items-center gap-1">
                        <Ban className="w-3 h-3" /> Askıya Alındı
                      </span>
                    )}
                  </div>
                  {u.banned && u.banReason && (
                    <p className="text-xs text-red-400/70 mt-1 truncate">Sebep: {u.banReason}</p>
                  )}
                </div>
              </div>

              {!u.banned && (
                <div className="flex gap-2">
                  <input
                    value={banReason[u.uid] ?? ""}
                    onChange={e => setBanReason(prev => ({ ...prev, [u.uid]: e.target.value }))}
                    placeholder="Askıya alma sebebi (isteğe bağlı)"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500/50"
                  />
                  <button
                    onClick={() => handleBan(u)}
                    disabled={saving === u.uid || u.role === "admin"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    {saving === u.uid ? "İşleniyor..." : "Askıya Al"}
                  </button>
                </div>
              )}

              {u.banned && (
                <button
                  onClick={() => handleUnban(u)}
                  disabled={saving === u.uid}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  {saving === u.uid ? "İşleniyor..." : "Yasağı Kaldır"}
                </button>
              )}
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

// ─── Şikayetler ──────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
  story: "Hikaye",
  chapter: "Bölüm",
  comment: "Yorum",
  user: "Kullanıcı",
};

interface ReportDetail {
  loading: boolean;
  reporterName: string;
  reporterAvatar: string;
  targetUser?: UserProfile | null;
  targetStory?: Story | null;
  targetChapter?: (Chapter & { storyTitle?: string; authorId?: string; authorName?: string }) | null;
  targetComment?: InlineComment | null;
  /** Hedef içerik yüklenemediğinde kısmi bilgi: yazar + hikaye adı contextId'den */
  contextStory?: Story | null;
}

function Avatar({ url, name, size = 8 }: { url?: string | null; name?: string | null; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden`;
  return (
    <div className={cls}>
      {url ? <img src={url} className="w-full h-full object-cover" /> : <span>{name?.charAt(0) ?? "?"}</span>}
    </div>
  );
}

function ReportsTab({ modUid, modName, modAvatar }: { modUid: string; modName: string; modAvatar: string }) {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [details, setDetails] = useState<Record<string, ReportDetail>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [banModal, setBanModal] = useState<{ reportId: string; uid: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [directiveModal, setDirectiveModal] = useState<{
    reportId: string; authorId: string; authorName: string;
    storyId: string; storyTitle: string;
  } | null>(null);
  const [directiveText, setDirectiveText] = useState("");

  useEffect(() => {
    getReports("pending").then(async (reps) => {
      setReports(reps);
      setLoading(false);
      for (const r of reps) {
        setDetails(prev => ({ ...prev, [r.id]: { loading: true, reporterName: "", reporterAvatar: "" } }));
        loadDetail(r).then(d => setDetails(prev => ({ ...prev, [r.id]: d })));
      }
    }).catch(() => setLoading(false));
  }, []);

  const loadDetail = async (r: Report): Promise<ReportDetail> => {
    const base: ReportDetail = { loading: false, reporterName: "Bilinmiyor", reporterAvatar: "" };
    try {
      const reporter = await getUserById(r.reporterId).catch(() => null);
      base.reporterName = reporter?.displayName ?? `#${r.reporterId.slice(0, 8)}`;
      base.reporterAvatar = reporter?.avatarUrl ?? "";

      if (r.reportedType === "user") {
        base.targetUser = await getUserById(r.reportedId).catch(() => null);

      } else if (r.reportedType === "story") {
        base.targetStory = await getStory(r.reportedId).catch(() => null);

      } else if (r.reportedType === "chapter") {
        const ch = await getChapter(r.reportedId).catch(() => null);
        if (ch) {
          const story = await getStory(ch.storyId).catch(() => null);
          base.targetChapter = { ...ch, storyTitle: story?.title, authorId: story?.authorId, authorName: story?.authorName };
        } else {
          // Bölüm okunamadı (kural hatası vb.) — contextId'den hikayeyi çek
          const fallbackStoryId = r.contextId ?? null;
          if (fallbackStoryId) {
            base.contextStory = await getStory(fallbackStoryId).catch(() => null);
          }
        }

      } else if (r.reportedType === "comment") {
        base.targetComment = await getInlineCommentById(r.reportedId).catch(() => null);
        // Yorum okunamadıysa contextId'den hikayeyi çek
        if (!base.targetComment && r.contextId) {
          base.contextStory = await getStory(r.contextId).catch(() => null);
        }
      }
    } catch { /* ignore */ }
    return base;
  };

  const drop = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    setDetails(prev => { const d = { ...prev }; delete d[id]; return d; });
  };

  const handleResolve = async (reportId: string, res: "resolved" | "dismissed") => {
    setProcessing(reportId);
    try {
      await resolveReport(reportId, res);
      drop(reportId);
      toast({ title: res === "resolved" ? "Şikayet çözüldü" : "Şikayet reddedildi" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleBan = async () => {
    if (!banModal) return;
    setProcessing(banModal.reportId);
    try {
      await banUser(banModal.uid, banReason);
      await resolveReport(banModal.reportId, "resolved");
      drop(banModal.reportId);
      setBanModal(null); setBanReason("");
      toast({ title: "Hesap askıya alındı", description: `${banModal.name} hesabı askıya alındı.` });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleUnban = async (reportId: string, uid: string) => {
    setProcessing(reportId);
    try {
      await unbanUser(uid);
      await resolveReport(reportId, "resolved");
      drop(reportId);
      toast({ title: "Askı kaldırıldı" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleDirective = async () => {
    if (!directiveModal) return;
    setProcessing(directiveModal.reportId);
    try {
      await createNotification({
        recipientId: directiveModal.authorId,
        senderId: modUid, senderName: modName, senderAvatar: modAvatar,
        type: "moderator_directive",
        storyId: directiveModal.storyId, storyTitle: directiveModal.storyTitle,
        directiveMessage: directiveText,
      });
      setDirectiveModal(null); setDirectiveText("");
      toast({ title: "Direktif gönderildi", description: `${directiveModal.authorName} yazara bildirim gönderildi.` });
    } catch { toast({ title: "Gönderilemedi", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleUnpublishStory = async (reportId: string, storyId: string) => {
    setProcessing(reportId);
    try {
      await updateStory(storyId, { status: "draft" });
      await resolveReport(reportId, "resolved");
      drop(reportId);
      toast({ title: "Hikaye yayından kaldırıldı" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleUnpublishChapter = async (reportId: string, chapterId: string) => {
    setProcessing(reportId);
    try {
      await updateChapterStatus(chapterId, "rejected");
      await resolveReport(reportId, "resolved");
      drop(reportId);
      toast({ title: "Bölüm yayından kaldırıldı" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const handleDeleteComment = async (reportId: string, commentId: string) => {
    setProcessing(reportId);
    try {
      await deleteInlineComment(commentId);
      await resolveReport(reportId, "resolved");
      drop(reportId);
      toast({ title: "Yorum silindi" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>;

  if (reports.length === 0) {
    return (
      <div className="py-20 text-center border border-dashed border-border rounded-2xl">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <p className="text-lg font-semibold mb-1">Bekleyen şikayet yok!</p>
        <p className="text-muted-foreground text-sm">Tüm şikayetler işlendi.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {reports.map((r, i) => {
          const d = details[r.id];
          const busy = processing === r.id;
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">

              {/* Başlık */}
              <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-amber-500/10">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                    {REPORT_TYPE_LABELS[r.reportedType] ?? r.reportedType} Şikayeti
                  </Badge>
                </div>
                {r.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt.seconds * 1000).toLocaleDateString("tr-TR")}
                  </span>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Şikayet eden ↔ şikayet edilen */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-background/60 rounded-xl p-3 border border-border">
                    <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Şikayet Eden</p>
                    {!d || d.loading ? <Skeleton className="h-8 w-full" /> : (
                      <Link href={`/profile/${r.reporterId}`} className="flex items-center gap-2 group">
                        <Avatar url={d.reporterAvatar} name={d.reporterName} />
                        <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">{d.reporterName}</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                      </Link>
                    )}
                  </div>

                  <div className="bg-background/60 rounded-xl p-3 border border-border">
                    <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Şikayet Edilen</p>
                    {!d || d.loading ? <Skeleton className="h-8 w-full" /> : (
                      r.reportedType === "user" && d.targetUser ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar url={d.targetUser.avatarUrl} name={d.targetUser.displayName} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link href={`/profile/${r.reportedId}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
                                {d.targetUser.displayName}
                              </Link>
                              {d.targetUser.banned && (
                                <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 shrink-0">Askıda</span>
                              )}
                            </div>
                            {d.targetUser.bio && <p className="text-xs text-muted-foreground truncate">{d.targetUser.bio}</p>}
                          </div>
                        </div>
                      ) : r.reportedType === "story" && d.targetStory ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {d.targetStory.coverUrl && <img src={d.targetStory.coverUrl} className="w-8 h-10 rounded object-cover shrink-0" />}
                          <div className="min-w-0">
                            <Link href={`/story/${r.reportedId}`} className="text-sm font-medium hover:text-primary transition-colors block truncate">
                              {d.targetStory.title}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">Yazar: {d.targetStory.authorName}</p>
                          </div>
                        </div>
                      ) : r.reportedType === "chapter" && d.targetChapter ? (
                        <div className="min-w-0">
                          <Link href={`/read/${d.targetChapter.storyId}/${r.reportedId}`} className="text-sm font-medium hover:text-primary transition-colors block truncate">
                            {d.targetChapter.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {d.targetChapter.storyTitle ?? "–"} · {d.targetChapter.authorName ?? "–"}
                          </p>
                        </div>
                      ) : r.reportedType === "comment" && d.targetComment ? (
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{d.targetComment.authorName}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 italic">"{d.targetComment.text}"</p>
                        </div>
                      ) : d.contextStory ? (
                        /* Bölüm/yorum doğrudan yüklenemedi ama üst hikaye bulundu */
                        <div className="min-w-0">
                          <Link href={`/story/${d.contextStory.id}`} className="text-sm font-medium hover:text-primary transition-colors block truncate">
                            {d.contextStory.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            Yazar: {d.contextStory.authorName} · {REPORT_TYPE_LABELS[r.reportedType]} içinde
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">ID: {r.reportedId.slice(0, 16)}…</p>
                        </div>
                      ) : (
                        /* Hiçbir şey yüklenemedi — tür + ID göster, doğrudan link sun */
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-amber-400">
                            {REPORT_TYPE_LABELS[r.reportedType] ?? r.reportedType} şikayeti
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 font-mono">ID: {r.reportedId}</p>
                          {r.reportedType === "story" && (
                            <Link href={`/story/${r.reportedId}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> Hikayeye git
                            </Link>
                          )}
                          {r.reportedType === "user" && (
                            <Link href={`/profile/${r.reportedId}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> Profile git
                            </Link>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Bölüm içerik önizlemesi */}
                {r.reportedType === "chapter" && d?.targetChapter?.content && (
                  <div className="bg-background rounded-xl p-3 border border-border max-h-28 overflow-y-auto">
                    <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
                      {d.targetChapter.content.slice(0, 500)}{d.targetChapter.content.length > 500 ? "…" : ""}
                    </p>
                  </div>
                )}

                {/* Şikayet sebebi */}
                {r.reason && (
                  <p className="text-sm text-foreground/70 bg-background rounded-xl px-3 py-2 border border-border italic">
                    Sebep: "{r.reason}"
                  </p>
                )}

                {/* Eylem butonları */}
                <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-amber-500/10">
                  <div className="flex flex-wrap gap-2">
                    {/* Kullanıcı aksiyonları */}
                    {r.reportedType === "user" && d?.targetUser && (
                      <>
                        <Link href={`/profile/${r.reportedId}`} target="_blank">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                            <ExternalLink className="w-3 h-3" /> Profili Gör
                          </button>
                        </Link>
                        {d.targetUser.banned ? (
                          <button onClick={() => handleUnban(r.id, r.reportedId)} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                            <ShieldOff className="w-3 h-3" /> Askıyı Kaldır
                          </button>
                        ) : (
                          <button onClick={() => setBanModal({ reportId: r.id, uid: r.reportedId, name: d.targetUser?.displayName ?? "Kullanıcı" })} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                            <Ban className="w-3 h-3" /> Hesabı Askıya Al
                          </button>
                        )}
                      </>
                    )}

                    {/* Hikaye aksiyonları */}
                    {r.reportedType === "story" && d?.targetStory && (
                      <>
                        <Link href={`/story/${r.reportedId}`} target="_blank">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                            <ExternalLink className="w-3 h-3" /> Hikayeyi Gör
                          </button>
                        </Link>
                        <button onClick={() => handleUnpublishStory(r.id, r.reportedId)} disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          <XCircle className="w-3 h-3" /> Yayından Kaldır
                        </button>
                      </>
                    )}

                    {/* Bölüm aksiyonları */}
                    {r.reportedType === "chapter" && d?.targetChapter && (
                      <>
                        <Link href={`/read/${d.targetChapter.storyId}/${r.reportedId}`} target="_blank">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                            <ExternalLink className="w-3 h-3" /> Bölümü Gör
                          </button>
                        </Link>
                        <button onClick={() => handleUnpublishChapter(r.id, r.reportedId)} disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          <XCircle className="w-3 h-3" /> Yayından Kaldır
                        </button>
                        {d.targetChapter.authorId && (
                          <button onClick={() => setDirectiveModal({
                            reportId: r.id, authorId: d.targetChapter!.authorId!,
                            authorName: d.targetChapter!.authorName ?? "Yazar",
                            storyId: d.targetChapter!.storyId, storyTitle: d.targetChapter!.storyTitle ?? "",
                          })} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50">
                            <MessageSquare className="w-3 h-3" /> Yazara Direktif Gönder
                          </button>
                        )}
                      </>
                    )}

                    {/* Yorum aksiyonları */}
                    {r.reportedType === "comment" && (
                      <>
                        {d?.targetComment && (
                          <Link href={`/read/${d.targetComment.storyId}/${d.targetComment.chapterId}`} target="_blank">
                            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                              <ExternalLink className="w-3 h-3" /> Konuma Git
                            </button>
                          </Link>
                        )}
                        <button onClick={() => handleDeleteComment(r.id, r.reportedId)} disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          <XCircle className="w-3 h-3" /> Yorumu Sil
                        </button>
                      </>
                    )}
                  </div>

                  {/* Ortak: Reddet + Çözüldü */}
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleResolve(r.id, "dismissed")} disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" /> Geçersiz
                    </button>
                    <button onClick={() => handleResolve(r.id, "resolved")} disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                      <CheckCircle className="w-3.5 h-3.5" /> {busy ? "…" : "Çözüldü"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Ban modalı */}
      {banModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setBanModal(null); setBanReason(""); }}>
          <div className="bg-card border border-red-500/30 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-red-400" />
              <h3 className="font-bold text-lg">Hesabı Askıya Al</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{banModal.name}</span> kullanıcısı hesabından çıkarılacak ve giriş yapamayacak.
            </p>
            <textarea
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="Askıya alma sebebini yaz (zorunlu)…"
              className="w-full bg-background border border-border rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:border-red-500/50"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setBanModal(null); setBanReason(""); }}
                className="flex-1 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                İptal
              </button>
              <button onClick={handleBan} disabled={!banReason.trim() || processing === banModal.reportId}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                {processing === banModal.reportId ? "İşleniyor…" : "Askıya Al"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direktif modalı */}
      {directiveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setDirectiveModal(null); setDirectiveText(""); }}>
          <div className="bg-card border border-amber-500/30 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-lg">Yazara Direktif Gönder</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{directiveModal.authorName}</span> yazarına bildirim olarak iletilecek.
            </p>
            <textarea
              value={directiveText}
              onChange={e => setDirectiveText(e.target.value)}
              placeholder="Direktif mesajı… (örn: '3. paragraftaki ifadeleri kaldırmanız gerekmektedir.')"
              className="w-full bg-background border border-border rounded-xl p-3 text-sm resize-none h-28 focus:outline-none focus:border-amber-500/50"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setDirectiveModal(null); setDirectiveText(""); }}
                className="flex-1 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                İptal
              </button>
              <button onClick={handleDirective} disabled={!directiveText.trim() || processing === directiveModal.reportId}
                className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50">
                {processing === directiveModal.reportId ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ModeratorPage() {
  const [, setLocation] = useLocation();
  const { user, profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"review" | "reports" | "ban">("review");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return; // auth yüklenene kadar bekle — erken yönlendirmeyi önler
    if (!user) { setLocation("/auth"); return; }
    if (!profile || (profile.role !== "moderator" && profile.role !== "admin")) {
      setLocation("/");
    }
  }, [user, profile, authLoading]);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== "moderator" && profile.role !== "admin") return;
    getPlatformStats().then(setStats).catch(() => {});
  }, [user?.uid, profile?.role]);

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

        {/* Platform İstatistikleri */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {([
            { label: "Kullanıcı", value: stats?.userCount, icon: "👤", color: "text-primary" },
            { label: "Hikaye", value: stats?.storyCount, icon: "📖", color: "text-emerald-400" },
            { label: "Yayın. Bölüm", value: stats?.chapterCount, icon: "📄", color: "text-cyan-400" },
            { label: "İncelemede", value: stats?.pendingCount, icon: "⏳", color: "text-amber-400" },
            { label: "Bekleyen Şikayet", value: stats?.reportCount, icon: "🚨", color: "text-red-400" },
          ] as { label: string; value: number | undefined; icon: string; color: string }[]).map(({ label, value, icon, color }) => {
            const content = (
              <>
                <span className="text-lg">{icon}</span>
                <span className={`text-2xl font-bold tabular-nums ${color}`}>
                  {value === undefined ? <span className="text-muted-foreground text-base animate-pulse">…</span> : value.toLocaleString("tr-TR")}
                </span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </>
            );
            return label === "Kullanıcı" && isAdmin ? (
              <button
                key={label}
                type="button"
                disabled={value === undefined}
                onClick={() => setUsersOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={usersOpen}
                aria-label={`${value?.toLocaleString("tr-TR") ?? "Kullanıcı"} kullanıcıyı görüntüle`}
                className="bg-card border border-border rounded-xl p-4 flex flex-col items-start text-left gap-1 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
              >
                {content}
              </button>
            ) : (
              <div key={label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
                {content}
              </div>
            );
          })}
        </div>

        {/* Sekmeler */}
        <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
          <button
            onClick={() => setTab("review")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === "review" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Eye className="w-4 h-4" /> Bölüm İnceleme
          </button>
          <button
            onClick={() => setTab("reports")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === "reports" ? "border-amber-400 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <AlertTriangle className="w-4 h-4" /> Şikayetler
          </button>
          <button
            onClick={() => setTab("ban")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === "ban" ? "border-red-500 text-red-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Ban className="w-4 h-4" /> Kullanıcı Askıya Al
          </button>
        </div>

        {tab === "review" && <ReviewTab />}
        {tab === "reports" && user && profile && (
          <ReportsTab modUid={user.uid} modName={profile.displayName ?? "Moderatör"} modAvatar={profile.avatarUrl ?? ""} />
        )}
        {tab === "ban" && <BanTab />}
      </div>
      <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kullanıcılar {stats ? `(${stats.userCount})` : ""}</DialogTitle>
            <DialogDescription>İsim veya kullanıcı kimliğiyle listede ara; e-postayla aramak için tam adresi yaz.</DialogDescription>
          </DialogHeader>
          {usersOpen && isAdmin && user && <UsersTab key={user.uid} currentUid={user.uid} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
