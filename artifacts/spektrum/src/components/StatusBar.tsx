import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createUserStatus, getActiveStatuses, markStatusViewed,
  deleteUserStatus, UserStatus,
} from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";

// 24 saat dolma yüzdesi (ring animasyonu için)
function agePercent(status: UserStatus): number {
  const now = Date.now();
  const created = status.createdAt?.toMillis?.() ?? now;
  const expires = status.expiresAt?.toMillis?.() ?? now + 1;
  const total = expires - created;
  const elapsed = now - created;
  return Math.min(1, elapsed / total);
}

// Kullanıcının statülerini grupla: her kullanıcı için en son statüyü al
function groupByUser(statuses: UserStatus[]): Map<string, UserStatus[]> {
  const map = new Map<string, UserStatus[]>();
  for (const s of statuses) {
    const arr = map.get(s.userId) ?? [];
    arr.push(s);
    map.set(s.userId, arr);
  }
  return map;
}

// SVG ring bileşeni — WhatsApp status halkası
function StatusRing({
  viewed,
  size = 64,
  filled = 1,
}: {
  viewed: boolean;
  size?: number;
  filled?: number;
}) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - filled);
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      style={{ overflow: "visible" }}
    >
      {/* Arka plan halkası */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={viewed ? "hsl(var(--muted))" : "hsl(var(--primary) / 0.25)"}
        strokeWidth={2.5}
      />
      {/* Dolma halkası */}
      {!viewed && (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// ─── Statü Görüntüleyici ─────────────────────────────────────────────────────

function StatusViewer({
  statuses,
  startIdx,
  currentUserId,
  onClose,
  onDeleted,
}: {
  statuses: UserStatus[];
  startIdx: number;
  currentUserId?: string;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const status = statuses[idx];

  useEffect(() => {
    if (status && currentUserId && !status.viewedBy.includes(currentUserId)) {
      markStatusViewed(status.id, currentUserId).catch(() => {});
    }
  }, [status?.id, currentUserId]);

  const handleDelete = async () => {
    if (!status) return;
    setDeleting(true);
    try {
      await deleteUserStatus(status.id);
      onDeleted?.(status.id);
      if (statuses.length === 1) onClose();
      else setIdx(Math.max(0, idx - 1));
      toast({ title: "Statü silindi" });
    } catch {
      toast({ title: "Silinemedi", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!status) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div className="relative w-full max-w-sm mx-auto h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Üst bar */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
            {status.userAvatar
              ? <img src={status.userAvatar} alt={status.userName} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-sm font-bold">{status.userName.charAt(0)}</span>
            }
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">{status.userName}</p>
            <p className="text-white/60 text-xs">
              {status.createdAt?.toDate?.()?.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          {status.userId === currentUserId && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-white/70 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-4 mb-2">
          {statuses.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className={`h-full rounded-full ${i < idx ? "bg-white" : i === idx ? "bg-white" : "bg-transparent"}`}
                style={{ width: i === idx ? "100%" : i < idx ? "100%" : "0%" }} />
            </div>
          ))}
        </div>

        {/* Görsel */}
        <div className="flex-1 relative overflow-hidden rounded-xl mx-2">
          <img
            src={status.imageUrl}
            alt="status"
            className="w-full h-full object-cover"
          />
          {status.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <p className="text-white text-sm">{status.caption}</p>
            </div>
          )}
        </div>

        {/* Gezinti butonları */}
        <div className="flex justify-between px-4 py-3 gap-3">
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="flex-1 py-2 rounded-xl text-sm text-white/70 hover:text-white transition-colors disabled:opacity-30"
          >
            ← Önceki
          </button>
          <button
            onClick={() => { if (idx < statuses.length - 1) setIdx(i => i + 1); else onClose(); }}
            className="flex-1 py-2 rounded-xl text-sm text-white hover:text-white/80 transition-colors"
          >
            {idx < statuses.length - 1 ? "Sonraki →" : "Kapat"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Statü Oluşturma Modal ────────────────────────────────────────────────────

function CreateStatusModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (status: UserStatus) => void;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!user || !profile || !file) return;
    setUploading(true);
    try {
      const imageUrl = await uploadStatusImage(user.uid, file);
      const id = await createUserStatus({
        userId: user.uid,
        userName: profile.displayName,
        userAvatar: profile.avatarUrl,
        imageUrl,
        caption: caption.trim() || undefined,
      });
      const now = Date.now();
      onCreated({
        id,
        userId: user.uid,
        userName: profile.displayName,
        userAvatar: profile.avatarUrl,
        imageUrl,
        caption: caption.trim() || undefined,
        createdAt: { toMillis: () => now, toDate: () => new Date(now) } as any,
        expiresAt: { toMillis: () => now + 86400000, toDate: () => new Date(now + 86400000) } as any,
        viewedBy: [],
      });
      toast({ title: "Statü eklendi", description: "24 saat boyunca görünür." });
      onClose();
    } catch {
      toast({ title: "Yüklenemedi", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Yeni Statü</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {preview ? (
          <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted">
            <img src={preview} alt="önizleme" className="w-full h-full object-cover" />
            <button
              onClick={() => { setPreview(""); setFile(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-3 text-muted-foreground transition-colors"
          >
            <Plus className="w-8 h-8" />
            <span className="text-sm">Fotoğraf seç</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Bir şeyler yaz... (isteğe bağlı)"
          maxLength={150}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-all disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {uploading ? "Yükleniyor..." : "Paylaş"}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function StatusBar() {
  const { user, profile } = useAuth();
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ statuses: UserStatus[]; idx: number } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getActiveStatuses()
      .then(setStatuses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 px-1 no-scrollbar">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
            <div className="w-12 h-2.5 rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const grouped = groupByUser(statuses);
  const myStatuses = user ? (grouped.get(user.uid) ?? []) : [];
  const othersMap = new Map([...grouped].filter(([uid]) => uid !== user?.uid));

  const openOthers = (uid: string) => {
    const group = [...grouped.values()].flatMap(s => s).filter(s => s.userId === uid);
    setViewer({ statuses: group, idx: 0 });
  };

  const isAllViewed = (uid: string) => {
    const group = grouped.get(uid) ?? [];
    return group.every(s => s.viewedBy.includes(user?.uid ?? ""));
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 px-1 no-scrollbar">
        {/* Kendi statüm */}
        {user && profile && (
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => myStatuses.length > 0 ? setViewer({ statuses: myStatuses, idx: 0 }) : setCreating(true)}
              className="relative w-16 h-16"
            >
              {myStatuses.length > 0 && (
                <StatusRing viewed={false} size={64} filled={1 - agePercent(myStatuses[0])} />
              )}
              <div className="absolute inset-1.5 rounded-full overflow-hidden bg-muted">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">{profile.displayName.charAt(0)}</span>
                }
              </div>
              {myStatuses.length === 0 && (
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background">
                  <Plus className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </button>
            <span className="text-[10px] text-muted-foreground truncate w-16 text-center">
              {myStatuses.length > 0 ? "Statüm" : "Ekle"}
            </span>
          </div>
        )}

        {/* Diğer kullanıcılar */}
        {[...othersMap.entries()].map(([uid, group]) => {
          const first = group[0];
          const allViewed = isAllViewed(uid);
          return (
            <div key={uid} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <button onClick={() => openOthers(uid)} className="relative w-16 h-16">
                <StatusRing viewed={allViewed} size={64} filled={1 - agePercent(first)} />
                <div className="absolute inset-1.5 rounded-full overflow-hidden bg-muted">
                  {first.userAvatar
                    ? <img src={first.userAvatar} alt={first.userName} className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">{first.userName.charAt(0)}</span>
                  }
                </div>
              </button>
              <span className="text-[10px] text-muted-foreground truncate w-16 text-center">{first.userName}</span>
            </div>
          );
        })}

        {/* Hiç statü yoksa yönlendirme */}
        {!loading && statuses.length === 0 && !user && (
          <p className="text-xs text-muted-foreground self-center py-2 px-2">Statü görmek için giriş yap.</p>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <CreateStatusModal
            onClose={() => setCreating(false)}
            onCreated={s => setStatuses(prev => [s, ...prev])}
          />
        )}
        {viewer && (
          <StatusViewer
            statuses={viewer.statuses}
            startIdx={viewer.idx}
            currentUserId={user?.uid}
            onClose={() => setViewer(null)}
            onDeleted={id => {
              setStatuses(prev => prev.filter(s => s.id !== id));
              setViewer(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
