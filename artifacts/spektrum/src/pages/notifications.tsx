import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getNotifications, markAllNotificationsRead, markNotificationRead, SpektrumNotification } from "@/lib/firestore-service";
import { Bell, Heart, MessageSquare, UserPlus, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";

function getNotifUrl(n: SpektrumNotification): string {
  if (n.type === "follow") return `/profile/${n.senderId}`;
  if (n.type === "like" || n.type === "comment") return n.storyId ? `/story/${n.storyId}` : `/profile/${n.senderId}`;
  if (n.type === "qa_answer") return `/profile/${n.senderId}`;
  if (n.type === "chapter_approved" || n.type === "chapter_rejected") return n.storyId ? `/write/${n.storyId}` : "/";
  return "/";
}

function timeAgo(ts: { seconds: number } | undefined): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return `${Math.floor(diff / 604800)} hafta önce`;
}

function NotifIcon({ type }: { type: SpektrumNotification["type"] }) {
  const base = "w-4 h-4";
  if (type === "follow") return <UserPlus className={`${base} text-primary`} />;
  if (type === "like") return <Heart className={`${base} text-pink-400`} />;
  if (type === "comment") return <MessageSquare className={`${base} text-primary`} />;
  if (type === "chapter_approved") return <CheckCircle className={`${base} text-emerald-400`} />;
  if (type === "chapter_rejected") return <XCircle className={`${base} text-destructive`} />;
  if (type === "qa_answer") return <HelpCircle className={`${base} text-yellow-400`} />;
  return <Bell className={`${base} text-muted-foreground`} />;
}

function notifText(n: SpektrumNotification): { main: string; highlight?: string; highlightColor?: string } {
  switch (n.type) {
    case "follow":
      return { main: `${n.senderName} seni takip etmeye başladı.` };
    case "like":
      return {
        main: `${n.senderName} hikayeni beğendi.`,
        highlight: n.storyTitle,
        highlightColor: "text-pink-400",
      };
    case "comment":
      return {
        main: `${n.senderName} hikayene yorum yaptı.`,
        highlight: n.storyTitle,
        highlightColor: "text-primary",
      };
    case "qa_answer":
      return { main: `${n.senderName} anonim sorunuzu yanıtladı.` };
    case "chapter_approved":
      return {
        main: "Bölümün onaylandı ve yayınlandı.",
        highlight: n.storyTitle,
        highlightColor: "text-emerald-400",
      };
    case "chapter_rejected":
      return {
        main: "Bölümün reddedildi.",
        highlight: n.storyTitle,
        highlightColor: "text-destructive",
      };
    default:
      return { main: "Yeni bildirim." };
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [notifs, setNotifs] = useState<SpektrumNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = getNotifications(user.uid, (data) => {
      setNotifs(data);
      setLoading(false);
    });
    // Sayfaya girilince tüm bildirimleri okundu işaretle
    markAllNotificationsRead(user.uid).catch(() => {});
    return unsub;
  }, [user]);

  const handleClick = (n: SpektrumNotification) => {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
    }
    setLocation(getNotifUrl(n));
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground">Bildirimleri görmek için giriş yapmalısın.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Bildirimler</h1>
          {notifs.some(n => !n.read) && (
            <button
              onClick={() => markAllNotificationsRead(user.uid).catch(() => {})}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Tümünü okundu işaretle
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : notifs.length === 0 ? (
          <div className="py-20 text-center">
            <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Henüz hiç bildirim yok.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n, i) => {
              const txt = notifText(n);
              return (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-colors hover:border-primary/40 hover:bg-muted/40 ${
                    !n.read
                      ? "border-primary/20 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 overflow-hidden">
                      {n.senderAvatar
                        ? <img src={n.senderAvatar} alt={n.senderName} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-primary">
                            {n.senderName.charAt(0).toUpperCase()}
                          </div>
                      }
                    </div>
                    {/* Tip ikonu */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
                      <NotifIcon type={n.type} />
                    </div>
                  </div>

                  {/* İçerik */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">
                      {txt.highlight ? (
                        <>
                          {txt.main.split(txt.highlight ?? "").length > 1
                            ? <>
                                {txt.main.slice(0, txt.main.indexOf("."))}
                                {" — "}
                                <span className={txt.highlightColor}>"{txt.highlight}"</span>
                              </>
                            : <>
                                <span className="font-semibold">{n.senderName}</span>
                                {" "}
                                {txt.main.replace(n.senderName, "").trim()}
                                {" "}
                                {txt.highlight && <span className={txt.highlightColor}>"{txt.highlight}"</span>}
                              </>
                          }
                        </>
                      ) : (
                        <span className="font-semibold">{txt.main}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {timeAgo(n.createdAt as { seconds: number } | undefined)}
                    </p>
                  </div>

                  {/* Okunmadı göstergesi */}
                  {!n.read && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
