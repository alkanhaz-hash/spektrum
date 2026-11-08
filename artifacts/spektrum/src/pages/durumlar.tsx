import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBar } from "@/components/StatusBar";
import { useAuth } from "@/contexts/AuthContext";
import { CirclePlus } from "lucide-react";
import { Link } from "wouter";

export default function DurumlarPage() {
  const { user, loading } = useAuth();

  return (
    <AppLayout>
      <main className="container mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CirclePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif">Durumlar</h1>
              <p className="text-sm text-muted-foreground">Fotoğraf veya yazı paylaş; 24 saat sonra otomatik kaybolsun.</p>
            </div>
          </div>
        </div>

        {!loading && !user ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground mb-4">Durum paylaşmak ve arkadaşlarının durumlarını görmek için giriş yap.</p>
            <Link href="/auth" className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Giriş Yap
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            <StatusBar />
          </div>
        )}
      </main>
    </AppLayout>
  );
}