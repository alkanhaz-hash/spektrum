import { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { user, profile } = useAuth();

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
          {user ? (
            <>
              <Link href="/messages" className="transition-colors hover:text-primary text-foreground/60">
                Mesajlar
              </Link>
              {profile?.role === "moderator" || profile?.role === "admin" ? (
                <Link href="/moderator" className="transition-colors hover:text-primary text-foreground/60">
                  Panel
                </Link>
              ) : null}
              <Link href={`/profile/${user.uid}`}>
                <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center border border-border">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium">{profile?.displayName?.charAt(0) || "U"}</span>
                  )}
                </div>
              </Link>
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
