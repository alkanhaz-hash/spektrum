import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, registerUser, loginWithGoogle, resetPassword } from "@/lib/auth-service";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import { Mail, CheckCircle, ArrowLeft } from "lucide-react";

type View = "auth" | "forgot" | "verify-email";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("auth");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginUser(loginEmail, loginPassword);
      setLocation("/");
    } catch (err: any) {
      const msg = err.code === "auth/invalid-credential"
        ? "E-posta veya şifre hatalı."
        : err.code === "auth/too-many-requests"
        ? "Çok fazla deneme. Lütfen bekleyin veya şifrenizi sıfırlayın."
        : err.message;
      toast({ title: "Giriş başarısız", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await registerUser(regEmail, regPassword, regName);
      setView("verify-email");
    } catch (err: any) {
      const msg = err.code === "auth/email-already-in-use"
        ? "Bu e-posta zaten kayıtlı."
        : err.code === "auth/weak-password"
        ? "Şifre en az 6 karakter olmalı."
        : err.message;
      toast({ title: "Kayıt başarısız", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(resetEmail);
      toast({ title: "Şifre sıfırlama e-postası gönderildi!", description: `${resetEmail} adresine bakın.` });
      setView("auth");
    } catch (err: any) {
      const msg = err.code === "auth/user-not-found"
        ? "Bu e-posta ile kayıtlı hesap bulunamadı."
        : err.message;
      toast({ title: "Hata", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />

        {/* Email Verification */}
        {view === "verify-email" && (
          <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-serif">E-postanı Doğrula</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">{regEmail}</span> adresine doğrulama linki gönderdik. Linke tıklayarak hesabını aktif et.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>E-postayı göremiyorsan spam/junk klasörüne bak.</span>
              </div>
              <Button className="w-full" onClick={() => setLocation("/")}>
                Ana Sayfaya Git
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Doğrulamadan da giriş yapabilirsin. Bazı özellikler kısıtlı olabilir.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Forgot Password */}
        {view === "forgot" && (
          <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center space-y-2">
              <button onClick={() => setView("auth")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-2">
                <ArrowLeft className="w-4 h-4" /> Geri
              </button>
              <CardTitle className="text-2xl font-serif">Şifreni Sıfırla</CardTitle>
              <CardDescription>E-postana şifre sıfırlama linki göndereceğiz.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">E-posta</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    placeholder="ornek@mail.com"
                    className="bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Gönderiliyor..." : "Sıfırlama Linki Gönder"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Main Auth */}
        {view === "auth" && (
          <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-3xl font-serif tracking-tight">SPEKTRUM</CardTitle>
              <CardDescription>Sözcüklerin neon ışığında parladığı yer.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Giriş Yap</TabsTrigger>
                  <TabsTrigger value="register">Kayıt Ol</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">E-posta</Label>
                      <Input id="login-email" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required placeholder="ornek@mail.com" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Şifre</Label>
                        <button
                          type="button"
                          onClick={() => { setResetEmail(loginEmail); setView("forgot"); }}
                          className="text-xs text-primary hover:underline"
                        >
                          Şifremi Unuttum
                        </button>
                      </div>
                      <Input id="login-password" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="bg-background/50" />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Kullanıcı Adı</Label>
                      <Input id="reg-name" type="text" value={regName} onChange={e => setRegName(e.target.value)} required placeholder="kullanici_adi" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">E-posta</Label>
                      <Input id="reg-email" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required placeholder="ornek@mail.com" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Şifre</Label>
                      <Input id="reg-password" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6} className="bg-background/50" />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Kayıt olunuyor..." : "Kayıt Ol"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex flex-col gap-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Veya</span>
                  </div>
                </div>
                <Button variant="outline" type="button" disabled={loading} onClick={handleGoogle} className="w-full bg-background/50 hover:bg-background">
                  <SiGoogle className="mr-2 h-4 w-4" />
                  Google ile devam et
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
