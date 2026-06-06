import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, registerUser, loginWithGoogle, getGoogleRedirectResult, resetPassword, resendVerificationEmail } from "@/lib/auth-service";
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SiGoogle } from "react-icons/si";
import { Mail, CheckCircle, ArrowLeft } from "lucide-react";

type View = "auth" | "forgot" | "verify-email";

function googleErrorMsg(code: string, fallback: string): string {
  if (code === "auth/account-exists-with-different-credential")
    return "Bu e-posta başka bir yöntemle (e-posta/şifre) kayıtlı. O yöntemle giriş yap.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
    return "Google girişi iptal edildi.";
  if (code === "auth/network-request-failed")
    return "Bağlantı hatası. İnternet bağlantını kontrol et.";
  return fallback;
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("auth");

  // Zaten giriş yapmış kullanıcıyı ana sayfaya yönlendir
  useEffect(() => {
    if (!authLoading && user) setLocation("/");
  }, [user, authLoading]);

  // Mobil Google redirect'ten dönüşü yakala
  useEffect(() => {
    getGoogleRedirectResult()
      .then(u => { if (u) setLocation("/"); })
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code ?? "";
        const msg = (err as { message?: string })?.message ?? "Google ile giriş başarısız.";
        if (code && code !== "auth/redirect-cancelled-by-user") {
          toast({ title: "Google girişi başarısız", description: googleErrorMsg(code, msg), variant: "destructive" });
        }
      });
  }, []);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [kvkkAccepted, setKvkkAccepted] = useState(false);

  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginUser(loginEmail, loginPassword);
      setLocation("/");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/email-not-verified") {
        setRegEmail(loginEmail);
        setView("verify-email");
      } else {
        const msg = code === "auth/invalid-credential"
          ? "E-posta veya şifre hatalı."
          : code === "auth/user-not-found" || code === "auth/invalid-email"
          ? "Bu e-posta ile kayıtlı hesap bulunamadı."
          : code === "auth/too-many-requests"
          ? "Çok fazla deneme. Lütfen bekleyin veya şifrenizi sıfırlayın."
          : (err as { message?: string })?.message ?? "Bilinmeyen bir hata oluştu.";
        toast({ title: "Giriş başarısız", description: msg, variant: "destructive" });
      }
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
      const u = await loginWithGoogle();
      // Masaüstü: user döner → yönlendir
      // Mobil: null döner (sayfa redirect oluyor) → bekle, useEffect yakalar
      if (u) setLocation("/");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const msg = (err as { message?: string })?.message ?? "Google ile giriş başarısız.";
      toast({ title: "Google ile giriş başarısız", description: googleErrorMsg(code, msg), variant: "destructive" });
      setLoading(false);
    }
    // Mobil redirect durumunda setLoading(false) çağrılmaz — sayfa zaten yenilenir
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(resetEmail);
      toast({ title: "Şifre sıfırlama e-postası gönderildi!", description: `${resetEmail} adresine bakın.` });
      setView("auth");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const msg = code === "auth/user-not-found" || code === "auth/invalid-email"
        ? "Bu e-posta ile kayıtlı hesap bulunamadı."
        : (err as { message?: string })?.message ?? "Bilinmeyen bir hata oluştu.";
      toast({ title: "Hata", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5 pointer-events-none" />
        <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}noise.svg)` }} />

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
                <span>E-postayı göremiyorsan spam/junk klasörüne bak. Doğrulamadan giriş yapılamaz.</span>
              </div>
              <Button
                className="w-full"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await resendVerificationEmail();
                    toast({ title: "Mail tekrar gönderildi!", description: "Gelen kutunu kontrol et." });
                  } catch (err: any) {
                    toast({ title: "Gönderilemedi", description: err.message, variant: "destructive" });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "Gönderiliyor..." : "Doğrulama Mailini Tekrar Gönder"}
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => setView("auth")}>
                Giriş Sayfasına Dön
              </Button>
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
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name">Takma Ad <span className="text-muted-foreground font-normal">(Nickname)</span></Label>
                      <Input
                        id="reg-name"
                        type="text"
                        value={regName}
                        onChange={e => setRegName(e.target.value)}
                        required
                        minLength={3}
                        maxLength={30}
                        placeholder="takma_adın"
                        className="bg-background/50"
                      />
                      <p className="text-xs text-muted-foreground">Diğer kullanıcılar seni bu isimle arayacak ve profilinde görünecek.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">E-posta</Label>
                      <Input id="reg-email" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required placeholder="ornek@mail.com" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Şifre</Label>
                      <Input id="reg-password" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6} className="bg-background/50" />
                    </div>
                    {/* Onay kutuları */}
                    <div className="space-y-3 pt-1">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={e => setTermsAccepted(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border transition-colors ${termsAccepted ? "bg-primary border-primary" : "border-border bg-background/50 group-hover:border-primary/50"}`}>
                            {termsAccepted && <svg viewBox="0 0 10 8" className="w-full p-0.5 text-primary-foreground fill-none stroke-current stroke-2"><polyline points="1,4 4,7 9,1" /></svg>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          <Link href="/terms" className="text-primary hover:underline font-medium" target="_blank">Kullanıcı Sözleşmesi</Link>'ni okudum ve onaylıyorum.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={kvkkAccepted}
                            onChange={e => setKvkkAccepted(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border transition-colors ${kvkkAccepted ? "bg-primary border-primary" : "border-border bg-background/50 group-hover:border-primary/50"}`}>
                            {kvkkAccepted && <svg viewBox="0 0 10 8" className="w-full p-0.5 text-primary-foreground fill-none stroke-current stroke-2"><polyline points="1,4 4,7 9,1" /></svg>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          <Link href="/kvkk" className="text-primary hover:underline font-medium" target="_blank">KVKK Aydınlatma Metni</Link>'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
                        </span>
                      </label>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading || !termsAccepted || !kvkkAccepted}>
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
