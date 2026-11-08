import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserProfile, type UserProfile } from "@/lib/auth-service";
import { qaErrorMessage, sendAnonymousQuestion } from "@/lib/anonymous-qa";
import { usePageSeo } from "@/hooks/use-page-seo";
import { MessageSquarePlus, ShieldCheck, CheckCircle2 } from "lucide-react";
import { OpenInAppLink } from "@/components/OpenInAppLink";

export default function AnonymousAskPage() {
  const { uid = "" } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  usePageSeo(profile ? `${profile.displayName} için anonim soru sor | SPEKTRUM` : "Anonim soru sor | SPEKTRUM", "SPEKTRUM yazarına hesap açmadan anonim soru gönder. Soru ve cevap herkese açık paylaşılabilir.");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setProfile(null); setQuestion(""); setSent(false);
    getUserProfile(uid).then(p => {
      if (!active) return;
      if (!p || p.banned || p.accountDeletionPending) setError("Bu soru bağlantısı artık kullanılamıyor.");
      else setProfile(p);
    }).catch(() => { if (active) setError("Profil yüklenemedi. Bağlantını kontrol edip sayfayı yenile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid]);
  async function send() {
    if (sending || !question.trim()) return;
    setSending(true); setError("");
    try { await sendAnonymousQuestion(uid, question); setSent(true); setQuestion(""); }
    catch (e) { setError(qaErrorMessage(e)); }
    finally { setSending(false); }
  }
  return <AppLayout><main className="mx-auto min-h-[60dvh] w-full max-w-lg px-4 py-8 sm:py-16">
    <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-5">
      <OpenInAppLink path={`/ask/${encodeURIComponent(uid)}`} />
      <MessageSquarePlus className="h-9 w-9 text-primary" />
      {loading ? <div role="status" aria-live="polite" className="space-y-3"><div className="h-6 w-3/4 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><span className="sr-only">Profil yükleniyor…</span></div> : profile ? <>
        <div>
          <p className="text-sm text-muted-foreground">SPEKTRUM • Anonim soru-cevap</p>
          <h1 className="mt-2 text-2xl font-bold">{profile.displayName} için bir sorun var mı?</h1>
          <p className="mt-2 text-muted-foreground">Uygulama indirmeden, hesap oluşturmadan sorunu gönder.</p>
        </div>
        {sent ? <div className="space-y-4" data-testid="qa-send-success" role="status">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <h2 className="text-xl font-semibold">Sorun gönderildi.</h2>
          <p className="text-muted-foreground">Cevaplandığında yazarın profilinde görünebilir.</p>
          <Link href={`/profile/${encodeURIComponent(uid)}`} className="block text-primary underline">Yazarın profilini ve kitaplarını keşfet</Link>
          <button type="button" className="text-sm underline" onClick={() => setSent(false)}>Başka bir soru sor</button>
        </div> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send(); }}>
          <label htmlFor="anonymous-question" className="block font-medium">Anonim sorun</label>
          <textarea id="anonymous-question" data-testid="qa-question-input" value={question} onChange={e => setQuestion(e.target.value)} aria-describedby="qa-privacy qa-count" aria-invalid={question.length > 280}
            disabled={sending} maxLength={280} rows={5} placeholder="Kitapları, karakterleri veya merak ettiğin bir konu hakkında sor…"
            className="w-full resize-none rounded-xl border border-border bg-background p-4 focus:outline-none focus:ring-2 focus:ring-primary" />
          <p id="qa-count" className="text-right text-xs text-muted-foreground">{question.length}/280</p>
          <button data-testid="qa-send-button" disabled={sending || !question.trim() || question.length > 280}
            type="submit" aria-busy={sending} className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Gönderiliyor…" : "Anonim soruyu gönder"}</button>
        </form>}
        <p id="qa-privacy" className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Kimliğin güvenlik için sistemde tutulur; soruyu alan kişiye veya paylaşımı görenlere gösterilmez. Giriş yapmadan gönderirsen bu kimlik gerçek kişiyi değil, tarayıcına atanan rastgele bir misafir oturum kimliğini (guest UID) gösterir; giriş yaptıysan hesabın kullanılır. Ana oturumun etkilenmez. Sorunun içeriği ve cevabı herkese açık paylaşılabilir.
        </p>
        <Link href={`/profile/${encodeURIComponent(uid)}`} className="inline-block text-sm text-primary underline">Yazarın profiline git</Link>
      </> : <div><h1 className="text-xl font-semibold">Soru bağlantısı kullanılamıyor</h1><Link href="/" className="mt-3 inline-block text-sm text-primary underline">SPEKTRUM’u keşfet</Link></div>}
      {error && <p role="alert" data-testid="qa-error" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </div>
  </main></AppLayout>;
}
