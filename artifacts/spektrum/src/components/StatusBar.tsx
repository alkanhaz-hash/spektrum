import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Image as ImageIcon, Trash2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveStatuses, createStatus, deleteStatus, UserStatus } from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";
import { moderateText } from "@/lib/moderation-service";
import { useToast } from "@/hooks/use-toast";

function timeLeft(expiresAt: { seconds?: number; toDate?: () => Date } | null): string {
  if (!expiresAt) return "";
  const exp = expiresAt.seconds
    ? expiresAt.seconds * 1000
    : (expiresAt.toDate?.()?.getTime() ?? Date.now());
  const diff = exp - Date.now();
  if (diff <= 0) return "Süresi doldu";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return hours > 0 ? `${hours} saat kaldı` : `${mins} dk kaldı`;
}

// ─── Görüntüleyici ────────────────────────────────────────────────────────────

interface ViewerProps {
  statuses: UserStatus[];
  startIndex: number;
  onClose: () => void;
  currentUserId?: string;
  onDelete: (id: string) => void;
}

function StatusViewer({ statuses, startIndex, onClose, currentUserId, onDelete }: ViewerProps) {
  const [idx, setIdx] = useState(startIndex);
  const status = statuses[idx];
  if (!status) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {/* İlerleme çubuğu */}
        <div className="flex gap-1 mb-4">
          {statuses.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                i === idx ? "bg-white" : i < idx ? "bg-white/50" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* Üst bilgi */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary shrink-0">
              {status.avatarUrl ? (
                <img src={status.avatarUrl} alt={status.displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {status.displayName.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{status.displayName}</p>
              <p className="text-xs text-white/50">{timeLeft(status.expiresAt as any)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {status.uid === currentUserId && (
              <button
                onClick={() => { onDelete(status.id); onClose(); }}
                className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Durumu sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-white/60 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 min-h-52">
          {status.imageUrl && (
            <img src={status.imageUrl} alt="" className="w-full object-cover max-h-72" />
          )}
          {status.text && (
            <div className="p-6">
              <p className="text-white text-lg leading-relaxed font-medium">{status.text}</p>
            </div>
          )}
        </div>

        {/* Gezinme */}
        {statuses.length > 1 && (
          <div className="flex justify-between mt-4">
            <button
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Önceki
            </button>
            <span className="text-xs text-white/40 self-center">{idx + 1}/{statuses.length}</span>
            <button
              onClick={() => setIdx(i => Math.min(statuses.length - 1, i + 1))}
              disabled={idx === statuses.length - 1}
              className="flex items-center gap-1 px-3 py-2 text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              Sonraki <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Oluşturma Modalı ─────────────────────────────────────────────────────────

function StatusCreate({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    if (!text.trim() && !imgFile) {
      toast({ title: "Metin veya fotoğraf ekle", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (text.trim()) {
        const result = await moderateText(text);
        if (result.action === "rejected") {
          toast({ title: "Durum yayınlanamadı", description: "İçerik politikalarına aykırı.", variant: "destructive" });
          return;
        }
      }
      let imageUrl: string | undefined;
      if (imgFile) {
        imageUrl = await uploadStatusImage(user.uid, imgFile);
      }
      await createStatus({
        uid: user.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? "",
        text: text.trim(),
        imageUrl,
      });
      toast({ title: "Durum yayınlandı!", description: "24 saat sonra otomatik silinir." });
      onClose();
    } catch {
      toast({ title: "Hata", description: "Durum yayınlanamadı.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg font-serif">Durum Ekle</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {imgPreview && (
          <div className="relative mb-4 rounded-xl overflow-hidden">
            <img src={imgPreview} alt="" className="w-full max-h-40 object-cover" />
            <button
              onClick={() => { setImgFile(null); setImgPreview(""); }}
              className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder="Ne düşünüyorsun? (en fazla 200 karakter)"
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-1"
        />
        <p className="text-xs text-muted-foreground text-right mb-4">{text.length}/200</p>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImgChange} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <ImageIcon className="w-4 h-4" /> Fotoğraf
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (!text.trim() && !imgFile)}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {submitting ? "Yayınlanıyor..." : "Yayınla"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
          <Clock className="w-3 h-3" /> 24 saat sonra otomatik silinir
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function StatusBar() {
  const { user, profile } = useAuth();
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const unsub = getActiveStatuses(setStatuses);
    return () => unsub();
  }, []);

  const myStatus = user ? statuses.find(s => s.uid === user.uid) ?? null : null;
  const others = statuses.filter(s => !user || s.uid !== user.uid);

  if (!user && statuses.length === 0) return null;

  const handleDelete = async (id: string) => {
    try { await deleteStatus(id); } catch { /* yoksay */ }
  };

  return (
    <>
      <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
        <div className="flex gap-3 pb-2 min-w-max">
          {/* Kendi durumum / ekle butonu */}
          {user && profile && (
            <button
              onClick={() => {
                if (myStatus) {
                  setViewerIdx(statuses.findIndex(s => s.uid === user.uid));
                } else {
                  setCreateOpen(true);
                }
              }}
              className="flex flex-col items-center gap-1.5 w-16"
            >
              <div
                className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-colors ${
                  myStatus
                    ? "border-primary shadow-[0_0_10px_hsl(var(--primary)/0.4)]"
                    : "border-dashed border-primary/40 hover:border-primary/70"
                }`}
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {profile.displayName.charAt(0)}
                  </div>
                )}
                {!myStatus && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                    <Plus className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <span className="text-xs text-center truncate w-full text-muted-foreground leading-tight">
                {myStatus ? "Durumun" : "Durum Ekle"}
              </span>
            </button>
          )}

          {/* Diğer kullanıcıların durumları */}
          {others.map(status => {
            const globalIdx = statuses.findIndex(s => s.id === status.id);
            return (
              <button
                key={status.id}
                onClick={() => setViewerIdx(globalIdx)}
                className="flex flex-col items-center gap-1.5 w-16"
              >
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-secondary/60 hover:border-secondary transition-colors">
                  {status.avatarUrl ? (
                    <img src={status.avatarUrl} alt={status.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-secondary/10 flex items-center justify-center text-lg font-bold text-secondary">
                      {status.displayName.charAt(0)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-center truncate w-full text-muted-foreground leading-tight">
                  {status.displayName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {viewerIdx !== null && (
          <StatusViewer
            statuses={statuses}
            startIndex={viewerIdx}
            onClose={() => setViewerIdx(null)}
            currentUserId={user?.uid}
            onDelete={handleDelete}
          />
        )}
        {createOpen && (
          <StatusCreate onClose={() => setCreateOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
