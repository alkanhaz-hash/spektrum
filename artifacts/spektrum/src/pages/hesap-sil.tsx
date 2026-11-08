import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { deleteAccount } from "@/lib/auth-service";
import { useLocation } from "wouter";

export default function HesapSilPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const needsPassword = user?.providerData.some(provider => provider.providerId === "password") ?? false;

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await deleteAccount(password);
      setLocation("/auth");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Bir hata oluştu.";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Şifre hatalı. Lütfen tekrar dene.");
      } else if (msg.includes("requires-recent-login")) {
        setError("Güvenlik nedeniyle lütfen çıkış yapıp tekrar giriş yap, ardından hesabını sil.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="container mx-auto max-w-lg px-4 py-20 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Hesabını silmek için önce giriş yapman gerekiyor.</p>
          <Button className="mt-6" onClick={() => setLocation("/auth")}>Giriş Yap</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto max-w-lg px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold font-serif">Hesabı Sil</h1>
          </div>

          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-8 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Bu işlem geri alınamaz.</p>
              <p>Hesabını sildiğinde şunlar kalıcı olarak silinir:</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1">
                <li>Profil bilgilerin (kullanıcı adı, biyografi, avatar)</li>
                <li>Yazdığın hikayeler ve bölümler</li>
                <li>Yorumların ve mesajlaşma geçmişin</li>
                <li>Jeton bakiyen</li>
              </ul>
            </div>
          </div>

          {!confirmed ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Hesabını silmek istediğinden emin misin? Devam etmek için aşağıdaki butona bas.
              </p>
              <Button variant="destructive" className="w-full" onClick={() => setConfirmed(true)}>
                Evet, hesabımı kalıcı olarak silmek istiyorum
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {needsPassword
                  ? "Kimliğini doğrulamak için şifreni gir."
                  : "Devam ettiğinde Google hesabınla kimliğini doğrulaman istenecek."}
              </p>
              {needsPassword && <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Şifreni gir"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleDelete()}
                />
              </div>}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmed(false)} disabled={loading}>
                  Vazgeç
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={loading || (needsPassword && !password)}>
                  {loading ? "Siliniyor..." : "Hesabı Sil"}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
