import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { logoutUser } from "@/lib/auth-service";
import { LogOut, User, Search, Menu, X, Compass, PenLine, Shield } from "lucide-react";

export function Navbar() {
  const { user, profile } = useAuth();
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = searchTerm.trim();
    setMobileMenuOpen(false);
    setLocation(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
  };

  // Dropdown dışına tıklama/dokunma ile kapat (mousedown + touchstart)
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    setLocation("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">

        {/* Sol: Logo + masaüstü nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-serif text-2xl font-bold tracking-tighter text-primary">SPEKTRUM</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/discover" className="transition-colors hover:text-primary text-foreground/60">
              Keşfet
            </Link>
            <Link href="/write" className="transition-colors hover:text-primary text-foreground/60">
              Yaz
            </Link>
          </nav>
        </div>

        {/* Sağ: Arama + kullanıcı menüsü */}
        <div className="flex items-center gap-3">
          {/* Masaüstü arama */}
          <form onSubmit={handleSearchSubmit} className="hidden sm:flex items-center relative">
            <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Kitap ara..."
              className="w-40 lg:w-56 bg-muted/50 border border-border rounded-full pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:w-48 lg:focus:w-64 transition-all"
              data-testid="input-navbar-search"
            />
          </form>

          {/* Mobil arama ikonu */}
          <Link href="/search" className="sm:hidden text-foreground/60 hover:text-primary transition-colors" aria-label="Ara">
            <Search className="w-5 h-5" />
          </Link>

          {user ? (
            <>
              {/* Mesajlar — masaüstü */}
              <Link href="/messages" className="hidden md:block transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                Mesajlar
              </Link>
              {(profile?.role === "moderator" || profile?.role === "admin") && (
                <Link href="/moderator" className="hidden md:block transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                  Panel
                </Link>
              )}

              {/* Profil dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center border border-border hover:border-primary/50 transition-colors"
                >
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium">{profile?.displayName?.charAt(0) || user.email?.charAt(0) || "U"}</span>
                  )}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                    <Link href={`/profile/${user.uid}`} onClick={() => setDropdownOpen(false)}>
                      <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer">
                        <User className="w-4 h-4 text-primary" />
                        <span>Profilim</span>
                      </div>
                    </Link>
                    {/* Mobilde mesajlar dropdown'da */}
                    <Link href="/messages" onClick={() => setDropdownOpen(false)} className="md:hidden">
                      <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <span>Mesajlar</span>
                      </div>
                    </Link>
                    {/* Mobilde moderatör/admin paneli */}
                    {(profile?.role === "moderator" || profile?.role === "admin") && (
                      <Link href="/moderator" onClick={() => setDropdownOpen(false)} className="md:hidden">
                        <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border text-primary">
                          <Shield className="w-4 h-4" />
                          <span>Panel</span>
                        </div>
                      </Link>
                    )}
                    <div className="border-t border-border" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors text-destructive"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Çıkış Yap</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Mobil hamburger */}
              <button
                onClick={() => setMobileMenuOpen(v => !v)}
                className="md:hidden p-1.5 rounded-lg text-foreground/60 hover:text-primary hover:bg-muted transition-colors"
                aria-label="Menü"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <>
              <Link href="/auth" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
                Giriş Yap
              </Link>
              {/* Giriş yapmamış kullanıcı için mobil hamburger */}
              <button
                onClick={() => setMobileMenuOpen(v => !v)}
                className="md:hidden p-1.5 rounded-lg text-foreground/60 hover:text-primary hover:bg-muted transition-colors"
                aria-label="Menü"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobil açılır menü */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur">
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
            <Link
              href="/discover"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground/70 hover:text-primary hover:bg-muted transition-colors"
            >
              <Compass className="w-4 h-4" />
              Keşfet
            </Link>
            <Link
              href="/write"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground/70 hover:text-primary hover:bg-muted transition-colors"
            >
              <PenLine className="w-4 h-4" />
              Yaz
            </Link>
            {(profile?.role === "moderator" || profile?.role === "admin") && (
              <Link
                href="/moderator"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Shield className="w-4 h-4" />
                Panel
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
