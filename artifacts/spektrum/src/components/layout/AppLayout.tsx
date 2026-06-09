import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { logoutUser } from "@/lib/auth-service";
import { LogOut, User, Search, Menu, X, Compass, PenLine, Shield, MessageSquare, Bell } from "lucide-react";
import { getConversations, getNotifications, markAllNotificationsRead, SpektrumNotification } from "@/lib/firestore-service";

function getNotifUrl(n: SpektrumNotification): string {
  if (n.type === "follow") return `/profile/${n.senderId}`;
  if (n.type === "like" || n.type === "comment") return n.storyId ? `/story/${n.storyId}` : `/profile/${n.senderId}`;
  if (n.type === "qa_answer") return `/profile/${n.senderId}`;
  return "#";
}

export function Navbar() {
  const { user, profile } = useAuth();
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<SpektrumNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { setUnreadTotal(0); return; }
    const unsub = getConversations(user.uid, convs => {
      const total = convs.reduce((sum, c) => sum + (c.unreadCount?.[user.uid] ?? 0), 0);
      setUnreadTotal(total);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) { setNotifCount(0); setNotifs([]); return; }
    const unsub = getNotifications(user.uid, list => {
      setNotifs(list);
      setNotifCount(list.filter(n => !n.read).length);
    });
    return () => unsub();
  }, [user?.uid]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = searchTerm.trim();
    setMobileMenuOpen(false);
    setLocation(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
  };

  // Dropdown + bildirim paneli dışına tıklama ile kapat
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
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
              <Link href="/messages" className="hidden md:flex items-center gap-1.5 relative transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                <span className="relative">
                  <MessageSquare className="w-5 h-5" />
                  {unreadTotal > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  )}
                </span>
                Mesajlar
              </Link>
              {(profile?.role === "moderator" || profile?.role === "admin") && (
                <Link href="/moderator" className="hidden md:block transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                  Panel
                </Link>
              )}

              {/* Bildirimler — masaüstü */}
              <div className="hidden md:block relative" ref={notifRef}>
                <button
                  onClick={() => {
                    const opening = !notifOpen;
                    setNotifOpen(opening);
                    if (opening && user && notifCount > 0) {
                      markAllNotificationsRead(user.uid).catch(() => {});
                      setNotifCount(0);
                    }
                  }}
                  className="relative text-foreground/60 hover:text-primary transition-colors p-1"
                  aria-label="Bildirimler"
                >
                  <Bell className="w-5 h-5" />
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                      {notifCount > 99 ? "99+" : notifCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <span className="font-semibold text-sm">Bildirimler</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                      {notifs.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground text-sm">Henüz bildirim yok.</div>
                      ) : (
                        notifs.slice(0, 20).map(n => (
                          <button
                            key={n.id}
                            className={`w-full text-left flex items-start gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors cursor-pointer ${!n.read ? "bg-primary/5" : ""}`}
                            onClick={() => { setNotifOpen(false); setLocation(getNotifUrl(n)); }}
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 overflow-hidden shrink-0 mt-0.5">
                              {n.senderAvatar
                                ? <img src={n.senderAvatar} alt={n.senderName} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-primary">{n.senderName.charAt(0)}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs leading-relaxed break-words">
                                <span className="font-semibold">{n.senderName}</span>
                                {n.type === "follow" && " seni takip etmeye başladı."}
                                {n.type === "like" && <> <span className="text-pink-400">"{n.storyTitle}"</span> adlı hikayeni beğendi.</>}
                                {n.type === "comment" && <> <span className="text-primary">"{n.storyTitle}"</span> adlı hikayene yorum yaptı.</>}
                                {n.type === "qa_answer" && " anonim sorunuzu yanıtladı."}
                              </p>
                              {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-1" />}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

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
                    {/* Mobilde bildirimler dropdown'da */}
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        if (user && notifCount > 0) {
                          markAllNotificationsRead(user.uid).catch(() => {});
                          setNotifCount(0);
                        }
                        setNotifOpen(v => !v);
                      }}
                      className="md:hidden w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border"
                    >
                      <span className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        Bildirimler
                      </span>
                      {notifCount > 0 && (
                        <span className="min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                          {notifCount > 99 ? "99+" : notifCount}
                        </span>
                      )}
                    </button>
                    {/* Mobil bildirim paneli */}
                    {notifOpen && (
                      <div className="md:hidden border-t border-border max-h-64 overflow-y-auto divide-y divide-border/50">
                        {notifs.length === 0 ? (
                          <div className="py-6 text-center text-muted-foreground text-xs">Henüz bildirim yok.</div>
                        ) : (
                          notifs.slice(0, 10).map(n => (
                            <button
                              key={n.id}
                              className={`w-full text-left flex items-start gap-2 px-4 py-2.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                              onClick={() => { setDropdownOpen(false); setNotifOpen(false); setLocation(getNotifUrl(n)); }}
                            >
                              <div className="w-6 h-6 rounded-full bg-primary/10 overflow-hidden shrink-0 mt-0.5">
                                {n.senderAvatar
                                  ? <img src={n.senderAvatar} alt={n.senderName} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-primary">{n.senderName.charAt(0)}</div>
                                }
                              </div>
                              <p className="break-words leading-relaxed">
                                <span className="font-semibold">{n.senderName}</span>
                                {n.type === "follow" && " seni takip etmeye başladı."}
                                {n.type === "like" && <> <span className="text-pink-400">"{n.storyTitle}"</span> adlı hikayeni beğendi.</>}
                                {n.type === "comment" && <> <span className="text-primary">"{n.storyTitle}"</span> adlı hikayene yorum yaptı.</>}
                                {n.type === "qa_answer" && " anonim sorunuzu yanıtladı."}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {/* Mobilde mesajlar dropdown'da */}
                    <Link href="/messages" onClick={() => setDropdownOpen(false)} className="md:hidden">
                      <div className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <span className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-primary" />
                          Mesajlar
                        </span>
                        {unreadTotal > 0 && (
                          <span className="min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                            {unreadTotal > 99 ? "99+" : unreadTotal}
                          </span>
                        )}
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
