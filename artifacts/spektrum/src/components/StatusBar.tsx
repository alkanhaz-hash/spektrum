import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, ImageIcon, AlignLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getActiveStatuses,
  createStatus,
  markStatusViewed,
  deleteStatus,
  UserStatus,
} from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";
import { useToast } from "@/hooks/use-toast";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const BG_PRESETS = [
  "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #059669 0%, #0d9488 100%)",
  "linear-gradient(135deg, #ea580c 0%, #dc2626 100%)",
  "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #854d0e 0%, #ca8a04 100%)",
  "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
];

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface StatusGroup {
  uid: string;
  displayName: string;
  avatarUrl: string;
  latest: UserStatus;
  hasUnviewed: boolean;
}

// ─── Yardımcı: zaman bilgisi ─────────────────────────────────────────────────

function timeAgo(ts: { seconds: number }): string {
  const diff = Math.floor(Date.now() / 1000 - ts.seconds);
  if (diff < 60) return "Az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  return `${Math.floor(diff / 3600)} sa`;
}

// ─── Görüntüleme Modalı ────────────────────────────────────────────────────────

interface ViewModalProps {
  group: StatusGroup;
  currentUid: string;
  onClose: () => void;
  onDelete: (statusId: string) => void;
  onViewed: (statusId: string) => void;
}

function ViewStatusModal({ group, currentUid, onClose, onDelete, onViewed }: ViewModalProps) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOwn = group.uid === currentUid;
  const DURATION = 5000;

  useEffect(() => {
    onViewed(group.latest.id);
    setProgress(0);
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          onClose();
          return 100;
        }
        return p + 100 / (DURATION / 100);
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [group.latest.id]);

  const handleDelete = () => {
    onDelete(group.latest.id);
    onClose();
  };

  const s = group.latest;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-sm mx-4 rounded-3xl overflow-hidden shadow-2xl"
        style={{ aspectRatio: "9/16", maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Arkaplan / içerik */}
        {s.type === "image" && s.mediaUrl ? (
          <img src={s.mediaUrl} alt="Durum" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center p-8"
            style={{ background: s.backgroundColor || BG_PRESETS[0] }}
          >
            <p className="text-white text-2xl font-bold text-center leading-relaxed font-serif">
              {s.text}
            </p>
          </div>
        )}

        {/* Progres çubuğu */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
          <motion.div
            className="h-full bg-white"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Üst bilgi */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full border-2 border-white/60 overflow-hidden bg-muted flex-shrink-0">
              {group.avatarUrl
                ? <img src={group.avatarUrl} alt={group.displayName} className="w-full h-full object-cover" />
                : <span className="flex items-center justify-center w-full h-full text-sm font-bold text-white/70">{group.displayName.charAt(0)}</span>
              }
            </div>
            <div>
              <p className="text-white text-sm font-semibold drop-shadow">{group.displayName}</p>
              <p className="text-white/60 text-xs">{timeAgo(s.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwn && (
              <button
                onClick={handleDelete}
                className="w-8 h-8 rounded-full bg-red-500/20 backdrop-blur flex items-center justify-center hover:bg-red-500/40 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-300" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Görüntüleyenler (sadece sahibe göster) */}
        {isOwn && s.viewedBy.length > 0 && (
          <div className="absolute bottom-6 left-4 right-4 flex items-center gap-2">
            <div className="flex -space-x-1">
              {Array.from({ length: Math.min(3, s.viewedBy.length) }).map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-white/30 border border-white/20" />
              ))}
            </div>
            <span className="text-white/70 text-xs">{s.viewedBy.length} kişi gördü</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Oluşturma Modalı ─────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (status: UserStatus) => void;
}

function CreateStatusModal({ onClose, onCreated }: CreateModalProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [selectedBg, setSelectedBg] = useState(BG_PRESETS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!user || !profile) return;
    if (tab === "text" && !text.trim()) {
      toast({ title: "Metin boş", description: "Durum metni yaz.", variant: "destructive" });
      return;
    }
    if (tab === "image" && !imageFile) {
      toast({ title: "Görsel seçilmedi", description: "Bir görsel seç.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let mediaUrl: string | undefined;
      if (tab === "image" && imageFile) {
        mediaUrl = await uploadStatusImage(user.uid, imageFile);
      }
      const id = await createStatus(user.uid, {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? "",
        type: tab,
        ...(tab === "text" ? { text: text.trim(), backgroundColor: selectedBg } : { mediaUrl }),
      });
      const now = Date.now();
      const newStatus: UserStatus = {
        id,
        uid: user.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? "",
        type: tab,
        ...(tab === "text" ? { text: text.trim(), backgroundColor: selectedBg } : { mediaUrl }),
        viewedBy: [],
        createdAt: { seconds: Math.floor(now / 1000), nanoseconds: 0 } as any,
        expiresAt: { seconds: Math.floor(now / 1000) + 86400, nanoseconds: 0 } as any,
      };
      onCreated(newStatus);
      toast({ title: "Durum paylaşıldı", description: "24 saat boyunca görünecek." });
      onClose();
    } catch {
      toast({ title: "Hata", description: "Durum paylaşılamadı.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewBg = tab === "image" && imagePreview ? undefined : selectedBg;
  const previewText = tab === "text" ? text || "Metnin burada görünecek..." : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 26 }}
        className="relative w-full max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-lg font-bold font-serif">Yeni Durum</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sekmeler */}
        <div className="flex px-6 pt-4 gap-2">
          <button
            onClick={() => setTab("text")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              tab === "text"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <AlignLeft className="w-4 h-4" /> Metin
          </button>
          <button
            onClick={() => setTab("image")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              tab === "image"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Görsel
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {tab === "text" ? (
            <>
              {/* Önizleme */}
              <div
                className="w-full h-36 rounded-2xl flex items-center justify-center p-4 transition-all"
                style={{ background: selectedBg }}
              >
                <p className="text-white text-lg font-bold text-center font-serif leading-snug">
                  {text || "Metnin burada görünecek..."}
                </p>
              </div>
              {/* Metin girişi */}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Ne paylaşmak istiyorsun?"
                maxLength={200}
                rows={3}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{text.length}/200</p>
              {/* Renk seçimi */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Arkaplan rengi</p>
                <div className="flex gap-2 flex-wrap">
                  {BG_PRESETS.map((bg, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedBg(bg)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedBg === bg ? "border-white scale-110" : "border-transparent"
                      }`}
                      style={{ background: bg }}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Görsel seçimi */}
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full h-48 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center overflow-hidden"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Önizleme" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="w-8 h-8" />
                    <p className="text-sm">Görsel seç veya buraya sürükle</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </>
          )}
        </div>

        {/* Paylaş butonu */}
        <div className="px-6 pb-6">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_hsl(var(--primary)/0.3)] disabled:opacity-60"
          >
            {saving ? "Paylaşılıyor..." : "Durumu Paylaş"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Avatar Halkası ───────────────────────────────────────────────────────────

interface AvatarItemProps {
  group?: StatusGroup;
  isMe?: boolean;
  hasStatus?: boolean;
  displayName: string;
  avatarUrl: string;
  onClick: () => void;
}

function AvatarItem({ group, isMe, hasStatus, displayName, avatarUrl, onClick }: AvatarItemProps) {
  const ringClass = !hasStatus
    ? "ring-2 ring-border"
    : group?.hasUnviewed
    ? "" // gradient ring via inline style
    : "ring-2 ring-muted-foreground/30";

  const ringStyle = hasStatus && group?.hasUnviewed
    ? { padding: 2, background: "linear-gradient(135deg, #7c3aed, #06b6d4)", borderRadius: "50%" }
    : {};

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div style={ringStyle}>
        <div className={`w-14 h-14 rounded-full overflow-hidden bg-muted relative flex items-center justify-center ${ringClass}`}>
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            : <span className="text-lg font-bold text-muted-foreground">{displayName.charAt(0)}</span>
          }
          {isMe && !hasStatus && (
            <div className="absolute inset-0 bg-primary/80 flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground max-w-[60px] truncate">
        {isMe ? "Durumum" : displayName}
      </span>
    </button>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function StatusBar() {
  const { user, profile } = useAuth();
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingGroup, setViewingGroup] = useState<StatusGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const loadStatuses = useCallback(() => {
    if (!user) return;
    getActiveStatuses()
      .then(s => { setStatuses(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // Kullanıcıya göre grupla (en son durum)
  const { myGroup, othersGroups } = useMemo(() => {
    const map = new Map<string, StatusGroup>();
    for (const s of statuses) {
      if (!map.has(s.uid)) {
        map.set(s.uid, {
          uid: s.uid,
          displayName: s.displayName,
          avatarUrl: s.avatarUrl,
          latest: s,
          hasUnviewed: false,
        });
      }
      const g = map.get(s.uid)!;
      if (s.createdAt?.seconds > (g.latest.createdAt?.seconds ?? 0)) g.latest = s;
      if (!s.viewedBy.includes(user?.uid ?? "")) g.hasUnviewed = true;
    }
    const my = user ? map.get(user.uid) ?? null : null;
    const others = Array.from(map.values())
      .filter(g => g.uid !== user?.uid)
      .sort((a, b) => (b.hasUnviewed ? 1 : 0) - (a.hasUnviewed ? 1 : 0));
    return { myGroup: my, othersGroups: others };
  }, [statuses, user]);

  const handleViewed = useCallback(async (statusId: string) => {
    if (!user) return;
    setStatuses(prev =>
      prev.map(s => s.id === statusId
        ? { ...s, viewedBy: s.viewedBy.includes(user.uid) ? s.viewedBy : [...s.viewedBy, user.uid] }
        : s
      )
    );
    try { await markStatusViewed(statusId, user.uid); } catch { /* sessiz */ }
  }, [user]);

  const handleDelete = useCallback(async (statusId: string) => {
    setStatuses(prev => prev.filter(s => s.id !== statusId));
    try { await deleteStatus(statusId); } catch { /* sessiz */ }
  }, []);

  const handleCreated = useCallback((newStatus: UserStatus) => {
    setStatuses(prev => [newStatus, ...prev]);
  }, []);

  if (!user || loading) return null;

  const hasAnyContent = myGroup || othersGroups.length > 0;
  if (!hasAnyContent && !profile) return null;

  return (
    <>
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <h2 className="text-base font-semibold text-muted-foreground">Durumlar</h2>
          <span className="text-xs text-muted-foreground/50">· 24 saat</span>
        </div>
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
            {/* Benim durumum */}
            <AvatarItem
              group={myGroup ?? undefined}
              isMe
              hasStatus={!!myGroup}
              displayName={profile?.displayName ?? ""}
              avatarUrl={profile?.avatarUrl ?? ""}
              onClick={() => myGroup ? setViewingGroup(myGroup) : setCreating(true)}
            />

            {/* Diğer kullanıcılar */}
            {othersGroups.map(g => (
              <AvatarItem
                key={g.uid}
                group={g}
                hasStatus
                displayName={g.displayName}
                avatarUrl={g.avatarUrl}
                onClick={() => setViewingGroup(g)}
              />
            ))}

            {/* Durum yokken + butonu */}
            {!myGroup && othersGroups.length === 0 && (
              <div className="flex items-center gap-3 py-2">
                <p className="text-sm text-muted-foreground">
                  İlk durumu sen paylaş —
                </p>
                <button
                  onClick={() => setCreating(true)}
                  className="text-sm text-primary hover:text-primary/80 font-medium underline underline-offset-2 transition-colors"
                >
                  Durum ekle
                </button>
              </div>
            )}
          </div>

          {/* Yeni durum ekle (durum varsa ayrı butona gerek yok, avatar'a tıklanır) */}
          {myGroup && (
            <button
              onClick={() => setCreating(true)}
              className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              + Yeni durum ekle
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {viewingGroup && user && (
          <ViewStatusModal
            key={viewingGroup.uid}
            group={viewingGroup}
            currentUid={user.uid}
            onClose={() => setViewingGroup(null)}
            onDelete={handleDelete}
            onViewed={handleViewed}
          />
        )}
        {creating && (
          <CreateStatusModal
            key="create"
            onClose={() => setCreating(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}
