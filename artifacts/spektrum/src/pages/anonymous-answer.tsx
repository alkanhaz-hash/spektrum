import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserProfile } from "@/lib/auth-service";
import { getPublicAnsweredQuestion, type AnonymousQuestion } from "@/lib/anonymous-qa";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSeo } from "@/hooks/use-page-seo";
import { shareQuestionCard } from "@/lib/qa-sharing";
import { OpenInAppLink } from "@/components/OpenInAppLink";

export default function AnonymousAnswerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [question, setQuestion] = useState<AnonymousQuestion | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const snippet = question ? question.question.replace(/\s+/g, " ").slice(0, 110) : "";
  usePageSeo(question ? `${name}: anonim soru-cevap | SPEKTRUM` : "Anonim soru-cevap | SPEKTRUM", question ? `Anonim soru: ${snippet}` : "SPEKTRUM anonim soru-cevap.");
  useEffect(() => {
    let active = true;
    setLoading(true); setQuestion(null); setMessage("");
    getPublicAnsweredQuestion(id).then(async q => {
      if (!q) return;
      const profile = await getUserProfile(q.targetUid);
      if (active && profile && !profile.banned && !profile.accountDeletionPending) { setQuestion(q); setName(profile.displayName); }
    }).catch(() => { if (active) setQuestion(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return <AppLayout><main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
    {!loading && question && <div className="mb-4"><OpenInAppLink path={`/qa/${encodeURIComponent(question.id)}`} /></div>}
    {loading ? <div role="status" aria-live="polite" className="space-y-3"><div className="h-40 animate-pulse rounded-3xl bg-muted" /><span className="sr-only">Soru-cevap yükleniyor…</span></div> : question ? <article className="rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-6">
      <p className="text-sm font-semibold text-primary">SPEKTRUM • {name}</p>
      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Anonim soru</p><h1 className="mt-2 whitespace-pre-wrap break-words text-xl font-semibold">{question.question}</h1></div>
      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Cevap</p><p className="mt-2 whitespace-pre-wrap break-words">{question.answer}</p></div>
      <Link href={`/ask/${encodeURIComponent(question.targetUid)}`} className="block rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">Sen de anonim soru sor</Link>
      <Link href={`/profile/${encodeURIComponent(question.targetUid)}`} className="block text-center text-sm text-primary underline">Yazarın kitaplarını keşfet</Link>
      {user?.uid === question.targetUid && <button type="button" disabled={sharing} className="text-sm underline disabled:opacity-50" onClick={async () => {
        setSharing(true);
        try { setMessage(await shareQuestionCard(question, name)); }
        catch { setMessage("Kart paylaşılamadı. Lütfen yeniden dene."); }
        finally { setSharing(false); }
      }}>{sharing ? "Kart hazırlanıyor…" : "Kartı paylaş / PNG indir"}</button>}
      {message && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
    </article> : <div className="rounded-3xl border border-border bg-card p-8 space-y-3">
      <h1 className="text-xl font-semibold">Bu soru-cevap kullanılamıyor</h1>
      <p className="text-muted-foreground">Silinmiş, henüz cevaplanmamış veya paylaşılmamış olabilir.</p>
      <Link href="/" className="text-primary underline">SPEKTRUM’u keşfet</Link>
    </div>}
  </main></AppLayout>;
}
