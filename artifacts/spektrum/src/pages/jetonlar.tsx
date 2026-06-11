import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { subscribeJetonTransactions, JetonTransaction } from "@/lib/firestore-service";
import { JETON_PACKAGES, JETON_COSTS } from "@/lib/jeton-packages";
import { Coins, TrendingUp, TrendingDown, RotateCcw, Lock, Star, Zap, Gift, Sparkles } from "lucide-react";
import { Timestamp } from "firebase/firestore";

function formatDate(ts: Timestamp | undefined): string {
  if (!ts) return "";
  const d = ts.toDate();
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TxIcon({ type }: { type: "earn" | "spend" | "refund" }) {
  if (type === "earn") return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (type === "refund") return <RotateCcw className="w-4 h-4 text-blue-500" />;
  return <TrendingDown className="w-4 h-4 text-rose-500" />;
}

const FEATURE_CARDS = [
  { icon: Zap, label: "Hikaye Öne Çıkar", desc: "24 saat boyunca keşfet sayfasının başında", cost: JETON_COSTS.STORY_BOOST },
  { icon: Star, label: "Profil Rozeti", desc: "Profilinde özel yazar rozeti", cost: JETON_COSTS.PROFILE_BADGE },
  { icon: Sparkles, label: "Ücretli Bölüm", desc: "Kilitli bölümlere eriş", cost: JETON_COSTS.PAID_CHAPTER },
  { icon: Gift, label: "Yazar Destekle", desc: "Sevdiğin yazara bahşiş gönder", cost: JETON_COSTS.TIP_WRITER_MEDIUM },
];

export default function JetonlarPage() {
  const { user, profile } = useAuth();
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<JetonTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLocation("/auth"); return; }
    setTxLoading(true);
    const unsub = subscribeJetonTransactions(user.uid, txs => {
      setTransactions(txs);
      setTxLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const balance = profile?.jetonBalance ?? 0;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* Bakiye kartı */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-6 mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Mevcut Jeton Bakiyesi</p>
            <div className="flex items-center gap-2">
              <Coins className="w-7 h-7 text-amber-500" />
              <span className="text-4xl font-bold tabular-nums text-foreground">{balance.toLocaleString("tr-TR")}</span>
              <span className="text-lg text-muted-foreground">jeton</span>
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-muted-foreground">Ödeme sistemi</p>
            <p className="text-sm font-semibold text-primary">Yakında Aktif</p>
          </div>
        </div>

        {/* Jeton paketleri */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Jeton Satın Al</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {JETON_PACKAGES.map(pkg => (
              <div
                key={pkg.id}
                className={`relative rounded-xl border ${pkg.popular ? "border-primary bg-primary/5" : "border-border bg-card"} p-4 flex flex-col items-center gap-2 opacity-80 select-none`}
              >
                {pkg.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                    ⭐ Popüler
                  </span>
                )}
                {pkg.bonusPercent > 0 && (
                  <span className="absolute -top-2.5 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                    +%{pkg.bonusPercent}
                  </span>
                )}
                <Coins className="w-6 h-6 text-amber-500" />
                <span className="text-xl font-bold tabular-nums">{pkg.jetonAmount.toLocaleString("tr-TR")}</span>
                <span className="text-xs text-muted-foreground">{pkg.label}</span>
                <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  <span className="text-xs font-medium">Yakında</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Ödeme sistemi entegre edildiğinde paketler aktif olacak.
          </p>
        </section>

        {/* Premium özellikler */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Jetonlarla Neler Yapabilirsin?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURE_CARDS.map(fc => (
              <div key={fc.label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <fc.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{fc.label}</p>
                  <p className="text-xs text-muted-foreground">{fc.desc}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold tabular-nums">{fc.cost}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* İşlem geçmişi */}
        <section>
          <h2 className="text-lg font-semibold mb-4">İşlem Geçmişi</h2>
          {txLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center">
              <Coins className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">Henüz jeton işlemi yok.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3 bg-card">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <TxIcon type={tx.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.reason}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${tx.type === "spend" ? "text-rose-500" : "text-emerald-500"}`}>
                      {tx.type === "spend" ? "-" : "+"}{tx.amount.toLocaleString("tr-TR")}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.balanceAfter.toLocaleString("tr-TR")} jeton</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
