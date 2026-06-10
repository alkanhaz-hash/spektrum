import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, Eye, ChevronLeft, ChevronRight, Type } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  UserStatus,
  createStatus,
  getActiveStatuses,
  markStatusViewed,
  deleteStatus,
} from "@/lib/firestore-service";
import { getFollowing } from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";

const BG_COLORS = [
  "from-purple-900 to-cyan-900",
  "from-violet-900 to-indigo-900",
  "from-fuchsia-900 to-purple-900",
  "from-cyan-900 to-teal-900",
  "from-indigo-900 to-blue-900",
  "from-rose-900 to-pink-900",
];

// ─── Gruplama ────────────────────────────────────────────────────────────────
interface StatusGroup {
  userId: string;
  userDisplayName: string;
  userAvatar: string;
  statuses: UserStatus[];
  allViewed: boolean;
}

function groupStatuses(statuses: UserStatus[], currentUserId: string): StatusGroup[] {
  const map = new Map<string, UserStatus[]>();
  for (const s of statuses) {
    if (!map.has(s.userId)) map.set(s.userId, []);
    map.get(s.userId)!.push(s);
  }
  const groups: StatusGroup[] = [];
  for (const [userId, items] of map.entries()) {
    const allViewed = items.every(s => s.viewedBy.includes(currentUserId));
    groups.push({
      userId,
      userDisplayName: items[0].userDisplayName,
      userAvatar: items[0].userAvatar,
      statuses: items,
      allViewed,
    });
  }
  // Kendi statusu en başa, sonra görülmemişler, sonra görülmüşler
  return groups.sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return 0;
  });
}

// ─── Status İzleyici Modal ───────────────────────────────────────────────────

function StatusViewer({
  group,
  currentUserId,
  onClose,
  onDeleted,
  isOwn,
}: {
  group: StatusGroup;
  currentUserId: string;
  onClose: () => void;
  onDeleted: (statusId: string) => void;
  isOwn: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const current = group.statuses[idx];

  useEffect(() => {
    if (!current) return;
    if (!current.viewedBy.includes(currentUserId)) {
      markStatusViewed(current.id, currentUserId).catch(() => {});
    }
    timerRef.current = setTimeout(() => {
      if (idx < group.statuses.length - 1) setIdx(i => i + 1);
      else onClose();
    }, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, current?.id]);

  const handleDelete = async () => {
    if (!current) return;
    try {
      await deleteStatus(current.id);
      onDeleted(current.id);
      if (group.statuses.length <= 1) onClose();
      else setIdx(i => Math.min(i, group.statuses.length - 2));
      toast({ title: "Status silindi" });
    } catch {
      toast({ title: "Silinemedi", variant: "destructive" });
    }
  };

  if (!current) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm mx-auto h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-3 pt-3">
          {group.statuses.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <motion.div
                className="h-full bg-white"
                initial={{ width: i < idx ? "100%" : i === idx ? "0%" : "0%" }}
                animate={{ width: i < idx ? "100%" : i === idx ? "100%" : "0%" }}
                transition={{ duration: i === idx ? 5 : 0, ease: "linear" }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/30">
              {current.userAvatar
                ? <img src={current.userAvatar} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-primary/40 flex items-center justify-center text-xs font-bold text-white">{current.userDisplayName.charAt(0)}</div>
              }
            </div>
            <div>
              <p className="text-white text-sm font-semibold drop-shadow">{current.userDisplayName}</p>
              <p className="text-white/60 text-xs">
                {current.createdAt ? new Date(current.createdAt.seconds * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwn && (
              <button
                onClick={() => setShowViewers(v => !v)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <Eye className="w-4 h-4 text-white" />
              </button>
            )}
            {isOwn && (
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-full bg-white/10 hover:bg-red-500/40 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className={`flex-1 flex items-center justify-center bg-gradient-to-br ${current.bgColor ?? "from-gray-900 to-gray-800"}`}>
          {current.mediaUrl ? (
            <img src={current.mediaUrl} alt="status" className="w-full h-full object-contain" />
          ) : (
            <p className="text-white text-2xl font-bold text-center px-8 leading-relaxed drop-shadow-lg">
              {current.text}
            </p>
          )}
        </div>

        {/* Viewers panel */}
        <AnimatePresence>
          {showViewers && isOwn && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur rounded-t-2xl p-4 max-h-48 overflow-y-auto border-t border-border"
            >
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                {current.viewedBy.length} kişi gördü
              </p>
              {current.viewedBy.length === 0
                ? <p className="text-xs text-muted-foreground">Henüz kimse görmedi.</p>
                : <p className="text-xs text-muted-foreground">{current.viewedBy.length} görüntülenme</p>
              }
            </motion.div>
          )}
        </AnimatePresence>

        {/* Önceki / Sonraki dokunma alanları */}
        <button
          className="absolute left-0 top-12 bottom-0 w-1/3 z-20"
          onClick={() => setIdx(i => Math.max(0, i - 1))}
        />
        <button
          className="absolute right-0 top-12 bottom-0 w-1/3 z-20"
          onClick={() => {
            if (idx < group.statuses.length - 1) setIdx(i => i + 1);
            else onClose();
          }}
        />
      </div>
    </motion.div>
  );
}

// ─── Status Oluştur Modal ────────────────────────────────────────────────────

function CreateStatusModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"pick" | "image" | "text">("pick");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setMode("image");
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      let mediaUrl: string | undefined;
      if (mode === "image" && imageFile) {
        mediaUrl = await uploadStatusImage(user.uid, imageFile);
      }
      await createStatus(user.uid, profile.displayName, profile.avatarUrl ?? "", {
        mediaUrl,
        text: mode === "text" ? text.trim() : undefined,
        bgColor,
      });
      toast({ title: "Status paylaşıldı! 24 saat görünür." });
      onCreated();
      onClose();
    } catch {
      toast({ title: "Status paylaşılamadı", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold font-serif">Status Paylaş</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === "pick" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Fotoğraf</span>
            </button>
            <button
              onClick={() => setMode("text")}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-secondary/50 hover:bg-secondary/5 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <Type className="w-6 h-6 text-secondary" />
              </div>
              <span className="text-sm font-medium">Metin</span>
            </button>
          </div>
        )}

        {mode === "image" && imagePreview && (
          <div className="space-y-4">
            <div className="aspect-square rounded-xl overflow-hidden bg-muted">
              <img src={imagePreview} alt="" className="w-full h-full object-cover" />
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              {saving ? "Paylaşılıyor..." : "Status Olarak Paylaş"}
            </button>
          </div>
        )}

        {mode === "text" && (
          <div className="space-y-4">
            <div className={`aspect-square rounded-xl bg-gradient-to-br ${bgColor} flex items-center justify-center p-4`}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Ne düşünüyorsun?"
                maxLength={200}
                className="w-full bg-transparent text-white text-xl font-bold text-center resize-none outline-none placeholder:text-white/40 leading-relaxed"
                rows={4}
                autoFocus
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {BG_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${c} flex-shrink-0 border-2 transition-all ${bgColor === c ? "border-white scale-110" : "border-transparent"}`}
                />
              ))}
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || !text.trim()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              {saving ? "Paylaşılıyor..." : "Status Olarak Paylaş"}
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      </motion.div>
    </motion.div>
  );
}

// ─── Ana StatusBar ────────────────────────────────────────────────────────────

export function StatusBar() {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingGroup, setViewingGroup] = useState<StatusGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadStatuses = async () => {
    if (!user) return;
    try {
      const following = await getFollowing(user.uid);
      const followingIds = following.map(f => f.uid);
      const statuses = await getActiveStatuses(user.uid, followingIds);
      setGroups(groupStatuses(statuses, user.uid));
    } catch {
      // sessiz hata
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadStatuses();
  }, [user?.uid]);

  const handleDeleted = (statusId: string) => {
    setGroups(prev =>
      prev
        .map(g => ({ ...g, statuses: g.statuses.filter(s => s.id !== statusId) }))
        .filter(g => g.statuses.length > 0)
    );
  };

  const handleViewed = (groupUserId: string, statusId: string) => {
    if (!user) return;
    setGroups(prev =>
      prev.map(g => {
        if (g.userId !== groupUserId) return g;
        const updated = g.statuses.map(s =>
          s.id === statusId ? { ...s, viewedBy: [...new Set([...s.viewedBy, user.uid])] } : s
        );
        return { ...g, statuses: updated, allViewed: updated.every(s => s.viewedBy.includes(user.uid)) };
      })
    );
  };

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });

  if (!user || loading) return null;

  const ownGroup = groups.find(g => g.userId === user.uid);
  const hasOwnStatus = !!ownGroup;

  return (
    <>
      <div className="relative mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Statuslar</span>
        </div>
        <div className="relative">
          {/* Scroll buttons */}
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-card border border-border shadow flex items-center justify-center hover:border-primary/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-card border border-border shadow flex items-center justify-center hover:border-primary/50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide px-8 py-2"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Kendi status balonu */}
            <button
              onClick={() => hasOwnStatus ? setViewingGroup(ownGroup) : setShowCreate(true)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div className={`relative w-14 h-14 rounded-full p-0.5 ${hasOwnStatus ? "bg-gradient-to-br from-primary to-secondary" : "bg-border"}`}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-background bg-muted">
                  {profile?.avatarUrl
                    ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">{profile?.displayName?.charAt(0)}</div>
                  }
                </div>
                {!hasOwnStatus && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                    <Plus className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground max-w-[60px] truncate">
                {hasOwnStatus ? "Senin" : "Ekle"}
              </span>
            </button>

            {/* Diğer kullanıcıların statusları */}
            {groups.filter(g => g.userId !== user.uid).map(group => (
              <button
                key={group.userId}
                onClick={() => {
                  setViewingGroup(group);
                  // İlk görülmemiş statusa mark et
                  const first = group.statuses.find(s => !s.viewedBy.includes(user.uid)) ?? group.statuses[0];
                  if (first) handleViewed(group.userId, first.id);
                }}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className={`relative w-14 h-14 rounded-full p-0.5 ${group.allViewed ? "bg-muted" : "bg-gradient-to-br from-primary to-secondary"}`}>
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-background bg-muted">
                    {group.userAvatar
                      ? <img src={group.userAvatar} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">{group.userDisplayName.charAt(0)}</div>
                    }
                  </div>
                </div>
                <span className="text-xs text-muted-foreground max-w-[60px] truncate">{group.userDisplayName}</span>
              </button>
            ))}

            {groups.filter(g => g.userId !== user.uid).length === 0 && !hasOwnStatus && (
              <div className="flex items-center text-xs text-muted-foreground pl-2 py-2">
                Takip ettiğin kişilerin statusları burada görünür.
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {viewingGroup && (
          <StatusViewer
            group={viewingGroup}
            currentUserId={user.uid}
            isOwn={viewingGroup.userId === user.uid}
            onClose={() => setViewingGroup(null)}
            onDeleted={handleDeleted}
          />
        )}
        {showCreate && (
          <CreateStatusModal
            onClose={() => setShowCreate(false)}
            onCreated={loadStatuses}
          />
        )}
      </AnimatePresence>
    </>
  );
}
