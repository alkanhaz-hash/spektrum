import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { freezeAccount } from "@/lib/auth-service";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { PauseCircle, Settings, Trash2, X } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export default function HesapAyarlariPage() {
  const { locale, setLocale, t } = useLocale();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [freezing, setFreezing] = useState(false);

  const handleFreeze = async () => {
    if (!password) return;
    setFreezing(true);
    try {
      await freezeAccount(password);
      toast({ title: t("Hesap donduruldu"), description: t("Tekrar giriş yaptığında hesabın otomatik olarak etkinleşecek.") });
      setLocation("/auth");
    } catch (error) {
      toast({
        title: t("Hesap dondurulamadı"),
        description: error instanceof Error ? t(error.message) : t("Şifreni kontrol edip tekrar dene."),
        variant: "destructive",
      });
      setFreezing(false);
    }
  };

  if (!loading && !user) {
    return (
      <AppLayout>
        <main className="container mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-muted-foreground mb-5">{t("Hesap ayarlarını açmak için giriş yapmalısın.")}</p>
          <Link href="/auth" className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Giriş Yap</Link>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="container mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-serif">{t("Hesap Ayarları")}</h1>
            <p className="text-sm text-muted-foreground">{t("Hesabını dondurabilir veya kalıcı olarak silebilirsin.")}</p>
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t("Dil")}</h2>
              <p className="text-xs text-muted-foreground mt-1">{t("Dil tercihi bu cihazda saklanır.")}</p>
            </div>
            <select
              aria-label={t("Dil")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={locale}
              onChange={event => setLocale(event.target.value as "tr" | "en")}
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>
        </section>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button onClick={() => setFreezeOpen(true)} className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/50 transition-colors">
            <PauseCircle className="w-5 h-5 text-amber-500" />
            <span className="flex-1">
              <span className="block font-semibold">{t("Hesabı Dondur")}</span>
              <span className="block text-xs text-muted-foreground mt-1">{t("Profilini geçici olarak devre dışı bırak. Tekrar giriş yapınca hesabın açılır.")}</span>
            </span>
          </button>
          <Link href="/hesap-sil" className="flex items-center gap-4 p-5 border-t border-border hover:bg-red-500/5 transition-colors">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span className="flex-1">
              <span className="block font-semibold text-red-500">{t("Hesabı Kalıcı Olarak Sil")}</span>
              <span className="block text-xs text-muted-foreground mt-1">{t("Bu işlem geri alınamaz.")}</span>
            </span>
          </Link>
        </div>
      </main>

      {freezeOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !freezing && setFreezeOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <PauseCircle className="w-6 h-6 text-amber-500" />
              <h2 className="font-semibold text-lg">{t("Hesabı Dondur")}</h2>
              <button className="ml-auto" onClick={() => setFreezeOpen(false)} disabled={freezing}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t("Onaylamak için mevcut şifreni gir.")} {t("Tekrar giriş yaptığında hesabın otomatik etkinleşir.")}</p>
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={t("Mevcut şifren")} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
            <div className="flex gap-3 mt-5">
              <button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold" onClick={() => setFreezeOpen(false)} disabled={freezing}>{t("Vazgeç")}</button>
              <button className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={handleFreeze} disabled={!password || freezing}>{freezing ? t("Donduruluyor…") : t("Hesabı Dondur")}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}