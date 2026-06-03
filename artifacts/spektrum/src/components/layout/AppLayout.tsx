import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { logoutUser } from "@/lib/auth-service";
import { LogOut, User, Search } from "lucide-react";

export function Navbar() {
  const { user, profile } = useAuth();
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = searchTerm.trim();
    setLocation(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setDropdownOpen(false);
    setLocation("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
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
        <div className="flex items-center gap-4">
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
          <Link href="/search" className="sm:hidden text-foreground/60 hover:text-primary transition-colors" aria-label="Ara">
            <Search className="w-5 h-5" />
          </Link>
          {user ? (
            <>
              <Link href="/messages" className="transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                Mesajlar
              </Link>
              {(profile?.role === "moderator" || profile?.role === "admin") && (
                <Link href="/moderator" className="transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                  Panel
                </Link>
              )}
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
            </>
          ) : (
            <Link href="/auth" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
              Giriş Yap
            </Link>
          )}
        </div>
      </div>
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
