import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useLocation, Link } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Image, Smile, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getConversations, listenMessages, sendMessage, markConversationRead, Conversation, Message } from "@/lib/firestore-service";
import { uploadMessageMedia } from "@/lib/storage-service";
import { checkImageSafety } from "@/lib/nsfw-service";
import { useToast } from "@/hooks/use-toast";

const EMOJIS = ["😂", "❤️", "🔥", "👏", "😭", "🙌", "✨", "💜", "🎉", "😍", "🤩", "💯"];

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find(c => c.id === conversationId);
  const otherUid = activeConv?.participants.find(p => p !== user?.uid);
  const otherName = otherUid ? activeConv?.participantNames[otherUid] : "";

  useEffect(() => {
    if (!user) { setLocation("/auth"); return; }
    const unsub = getConversations(user.uid, (convs) => {
      setConversations(convs);
      setConvsLoading(false);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, [user]);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = listenMessages(conversationId, (msgs) => setMessages(msgs));
    return () => { if (typeof unsub === "function") unsub(); };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user) return;
    markConversationRead(conversationId, user.uid).catch(() => {});
  }, [conversationId, user?.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !user || !profile || !conversationId) return;
    setSending(true);
    try {
      await sendMessage({ conversationId, senderId: user.uid, senderName: profile.displayName, senderAvatar: profile.avatarUrl, text });
      setText("");
    } catch { toast({ title: "Hata", description: "Mesaj gönderilemedi.", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile || !conversationId) return;
    setSending(true);
    try {
      const mediaType = file.type === "image/gif" ? "gif" : "image";
      // Yükleme ÖNCESİ tarayıcıda moderasyon — uygunsuzsa hiç upload edilmez (sıfır kredi).
      const check = await checkImageSafety(file);
      if (!check.safe) {
        toast({ title: "Medya uygun değil", description: "Görselde uygunsuz (cinsel/müstehcen) içerik tespit edildi.", variant: "destructive" });
        return;
      }
      const url = await uploadMessageMedia(conversationId, file);
      await sendMessage({ conversationId, senderId: user.uid, senderName: profile.displayName, senderAvatar: profile.avatarUrl, text: "", mediaUrl: url, mediaType });
    } catch { toast({ title: "Hata", description: "Medya gönderilemedi.", variant: "destructive" }); }
    finally { setSending(false); e.target.value = ""; }
  };

  if (!user) return null;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Conversation list */}
        <div className={`${conversationId ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-border bg-card`}>
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-bold font-serif">Mesajlar</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-14 rounded-xl" /></div>)}
            {!convsLoading && conversations.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">Henüz mesaj yok.</div>
            )}
            {conversations.map(conv => {
              const otherUid = conv.participants.find(p => p !== user.uid);
              const name = otherUid ? conv.participantNames[otherUid] : "Bilinmeyen";
              const avatar = otherUid ? conv.participantAvatars[otherUid] : "";
              const isActive = conv.id === conversationId;
              return (
                <button key={conv.id} onClick={() => setLocation(`/messages/${conv.id}`)}
                  className={`w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors ${isActive ? "bg-primary/10 border-r-2 border-primary" : ""}`}
                  data-testid={`conv-${conv.id}`}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {avatar ? <img src={avatar} alt={name} className="w-full h-full rounded-full object-cover" /> : name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMessage || "Konuşma başladı"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        {conversationId ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
              <button onClick={() => setLocation("/messages")} className="md:hidden text-muted-foreground hover:text-foreground" data-testid="button-back-convs">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <Link href={otherUid ? `/profile/${otherUid}` : "#"} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary overflow-hidden">
                  {otherUid && activeConv?.participantAvatars[otherUid]
                    ? <img src={activeConv.participantAvatars[otherUid]} alt={otherName || ""} className="w-full h-full object-cover" />
                    : otherName?.charAt(0) || "?"}
                </div>
                <span className="font-semibold">{otherName}</span>
              </Link>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === user.uid;
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5 ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}
                      data-testid={`message-${msg.id}`}>
                      {msg.mediaUrl && (
                        <img src={msg.mediaUrl} alt="Medya" className="rounded-xl max-w-full mb-2 cursor-pointer" onClick={() => window.open(msg.mediaUrl, "_blank")} />
                      )}
                      {msg.text && <p className="text-sm">{msg.text}</p>}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border bg-card">
              {/* Emoji picker dış tıklama overlay */}
              {showEmoji && <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />}
              <AnimatePresence>
                {showEmoji && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="relative z-20 flex flex-wrap gap-2 mb-3 p-3 bg-background rounded-xl border border-border">
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => { setText(t => t + e); setShowEmoji(false); }}
                        className="text-xl hover:scale-110 transition-transform" data-testid={`emoji-${e}`}>{e}</button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowEmoji(v => !v)} className="text-muted-foreground hover:text-primary transition-colors" data-testid="button-emoji">
                  <Smile className="w-5 h-5" />
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-primary transition-colors" data-testid="button-media">
                  <Image className="w-5 h-5" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,image/gif" className="hidden" onChange={handleMediaUpload} />
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Mesajını yaz..."
                  className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="input-message" />
                <button onClick={handleSend} disabled={!text.trim() || sending}
                  className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all hover:shadow-[0_0_12px_hsl(var(--primary)/0.4)] disabled:opacity-60"
                  data-testid="button-send">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Send className="w-7 h-7 text-primary" />
            </div>
            <p className="font-semibold">Bir konuşma seç</p>
            <p className="text-sm">Sol taraftaki listeden bir konuşmaya tıkla.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
