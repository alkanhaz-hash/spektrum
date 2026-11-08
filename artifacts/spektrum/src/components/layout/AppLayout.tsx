import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { logoutUser } from "@/lib/auth-service";
import {
  LogOut, User, Search, Menu, Compass, PenLine, Shield,
  MessageSquare, Bell, Coins, Info, Mail, FileText, HelpCircle,
  ChevronRight, Home, Settings, CirclePlus,
} from "lucide-react";
import {
  getConversations, getNotifications, markAllNotificationsRead,
  SpektrumNotification,
} from "@/lib/firestore-service";

function getNotifUrl(n: SpektrumNotification): string {
  if (n.type === "follow") return `/profile/${n.senderId}`;
  if (n.type === "like" || n.type === "comment") return n.storyId ? `/story/${n.storyId}` : `/profile/${n.senderId}`;
  if (n.type === "qa_answer") return `/profile/${n.senderId}`;
  if (n.type === "chapter_approved" || n.type === "chapter_rejected") return n.storyId ? `/write/${n.storyId}` : "/";
  if (n.type === "moderator_directive") return n.storyId ? `/write/${n.storyId}` : "/";
  return "/";
}

function timeAgo(ts: { seconds: number } | undefined): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

const SITE_MENU_ITEMS = [
  { href: "/iletisim",   label: "İletişim",             icon: Mail },
  { href: "/hakkimizda", label: "Hakkımızda",            icon: Info },
  { href: "/sss",        label: "Sıkça Sorulan Sorular", icon: HelpCircle },
  { href: "/kvkk",       label: "KVKK & Gizlilik",       icon: FileText },
  { href: "/terms",      label: "Kullanım Koşulları",    icon: FileText },
];

export function Navbar() {
  const { user, profile } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<SpektrumNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const siteMenuRef = useRef<HTMLDivElement>(null);

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
    setLocation(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
  };

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (siteMenuRef.current && !siteMenuRef.current.contains(e.target as Node)) setSiteMenuOpen(false);
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
    setLocation("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">

        {/* Sol: Logo + masaüstü nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="SPEKTRUM" className="w-8 h-8 object-contain" />
            <span className="font-serif text-2xl font-bold tracking-tighter text-primary">SPEKTRUM</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/discover" className="transition-colors hover:text-primary text-foreground/60">{t("Keşfet")}</Link>
            <Link href="/write" className="transition-colors hover:text-primary text-foreground/60">{t("Yaz")}</Link>
          </nav>
        </div>

        {/* Sağ */}
        <div className="flex items-center gap-3">

          {/* Masaüstü arama */}
          <form onSubmit={handleSearchSubmit} className="hidden sm:flex items-center relative">
            <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t("Kitap ara...")}
              className="w-40 lg:w-56 bg-muted/50 border border-border rounded-full pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:w-48 lg:focus:w-64 transition-all"
              data-testid="input-navbar-search"
            />
          </form>

          {/* Mobil arama ikonu */}
          <Link href="/search" className="sm:hidden text-foreground/60 hover:text-primary transition-colors" aria-label={t("Ara")}>
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
                {t("Mesajlar")}
              </Link>

              {(profile?.role === "moderator" || profile?.role === "admin") && (
                <Link href="/moderator" className="hidden md:block transition-colors hover:text-primary text-foreground/60 text-sm font-medium">
                  Panel
                </Link>
              )}

              {/* Jeton bakiyesi — masaüstü */}
              <Link
                href="/jetonlar"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-300/60 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-700 text-sm font-semibold tabular-nums"
                title="Jetonlarım"
              >
                <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{(profile?.jetonBalance ?? 0).toLocaleString("tr-TR")}</span>
              </Link>

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
                  aria-label={t("Bildirimler")}
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
                      <span className="font-semibold text-sm">{t("Bildirimler")}</span>
                      <button onClick={() => { setNotifOpen(false); setLocation("/notifications"); }} className="text-xs text-primary hover:underline">{t("Tümünü gör")}</button>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                      {notifs.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground text-sm">{t("Henüz bildirim yok.")}</div>
                      ) : notifs.slice(0, 10).map(n => (
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
                              {n.type === "like" && <> "<span className="text-pink-400">{n.storyTitle}</span>" adlı hikayeni beğendi.</>}
                              {n.type === "comment" && <> "<span className="text-primary">{n.storyTitle}</span>" adlı hikayene yorum yaptı.</>}
                              {n.type === "qa_answer" && " anonim sorunuzu yanıtladı."}
                              {n.type === "chapter_approved" && <> "<span className="text-emerald-400">{n.storyTitle}</span>" bölümün onaylandı.</>}
                              {n.type === "chapter_rejected" && <> "<span className="text-destructive">{n.storyTitle}</span>" bölümün reddedildi.</>}
                              {n.type === "moderator_directive" && <span className="text-amber-400"> Moderatör direktifi: {n.directiveMessage}</span>}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />}
                              <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt as { seconds: number } | undefined)}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {notifs.length > 0 && (
                      <div className="border-t border-border">
                        <button onClick={() => { setNotifOpen(false); setLocation("/notifications"); }} className="w-full py-2.5 text-xs text-center text-primary hover:bg-muted/50 transition-colors">
                          Tüm bildirimleri gör ({notifs.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Profil dropdown — masaüstü */}
              <div className="relative hidden md:block" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center border-2 border-border transition-colors"
                >
                  {profile?.avatarUrl
                    ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                    : <span className="text-xs font-medium">{profile?.displayName?.charAt(0) || user.email?.charAt(0) || "U"}</span>
                  }
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                    <Link href={`/profile/${user.uid}`} onClick={() => setDropdownOpen(false)}>
                      <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer">
                        <User className="w-4 h-4 text-primary" />
                          <span>{t("Profilim")}</span>
                      </div>
                    </Link>
                    <Link href="/jetonlar" onClick={() => setDropdownOpen(false)}>
                      <div className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <span className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-amber-500" />
                          {t("Jetonlarım")}
                        </span>
                        <span className="font-bold text-amber-600 tabular-nums">{(profile?.jetonBalance ?? 0).toLocaleString("tr-TR")}</span>
                      </div>
                    </Link>
                    <Link href="/durumlar" onClick={() => setDropdownOpen(false)}>
                      <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <CirclePlus className="w-4 h-4 text-primary" />
                        <span>{t("Durumlar")}</span>
                      </div>
                    </Link>
                    <Link href="/hesap-ayarlari" onClick={() => setDropdownOpen(false)}>
                      <div className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <Settings className="w-4 h-4 text-primary" />
                        <span>{t("Hesap Ayarları")}</span>
                      </div>
                    </Link>
                    {(profile?.role === "moderator" || profile?.role === "admin") && (
                      <Link href="/moderator" onClick={() => setDropdownOpen(false)}>
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
                      <span>{t("Çıkış Yap")}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href="/auth" className="hidden md:inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
              {t("Giriş Yap")}
            </Link>
          )}

          {/* Site Menüsü — TEK hamburger (masaüstü + mobil) */}
          <div className="relative" ref={siteMenuRef}>
            <button
              onClick={() => setSiteMenuOpen(v => !v)}
              className="p-2 rounded-lg text-foreground/60 hover:text-primary hover:bg-muted transition-colors"
              aria-label={t("Menü")}
              title={t("Menü")}
            >
              <Menu className="w-5 h-5" />
            </button>
            {siteMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("Menü")}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                  <span className="text-sm text-foreground/80">{t("Dil")}</span>
                  <select
                    aria-label={t("Dil")}
                    value={locale}
                    onChange={event => setLocale(event.target.value as "tr" | "en")}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value="tr">{t("Türkçe")}</option>
                    <option value="en">English</option>
                  </select>
                </div>
                {user && (
                  <>
                    <Link href="/durumlar" onClick={() => setSiteMenuOpen(false)}>
                      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer">
                        <span className="flex items-center gap-2 text-foreground/80">
                          <CirclePlus className="w-4 h-4 text-primary" />
                          {t("Durumlar")}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                    <Link href="/hesap-ayarlari" onClick={() => setSiteMenuOpen(false)}>
                      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border">
                        <span className="flex items-center gap-2 text-foreground/80">
                          <Settings className="w-4 h-4 text-primary" />
                          {t("Hesap Ayarları")}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                    <div className="border-t border-border" />
                  </>
                )}
                {SITE_MENU_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setSiteMenuOpen(false)}>
                      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer">
                        <span className="flex items-center gap-2 text-foreground/80">
                          <Icon className="w-4 h-4 text-primary" />
                          {t(item.label)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
                {user && (profile?.role === "moderator" || profile?.role === "admin") && (
                  <Link href="/moderator" onClick={() => setSiteMenuOpen(false)}>
                    <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border text-primary">
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        {t("Moderatör Paneli")}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                )}
                {user && (
                  <>
                    <div className="border-t border-border" />
                    <button
                      onClick={() => { setSiteMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition-colors text-destructive"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t("Çıkış Yap")}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Mobil Alt Navigasyon ─────────────────────────────────────────────────── */

function MobileBottomNav() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [location, setLocation] = useLocation();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadTotal(0); return; }
    const unsub = getConversations(user.uid, convs => {
      const total = convs.reduce((sum, c) => sum + (c.unreadCount?.[user.uid] ?? 0), 0);
      setUnreadTotal(total);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) { setNotifCount(0); return; }
    const unsub = getNotifications(user.uid, list => {
      setNotifCount(list.filter(n => !n.read).length);
    });
    return () => unsub();
  }, [user?.uid]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const navItems = [
    { href: "/",            label: "Ana Sayfa",  Icon: Home },
    { href: "/discover",    label: "Keşfet",     Icon: Compass },
    { href: "/write",       label: "Yaz",        Icon: PenLine },
    { href: "/messages",    label: "Mesajlar",   Icon: MessageSquare, badge: unreadTotal },
    { href: "/notifications", label: "Bildirimler", Icon: Bell, badge: notifCount },
    {
      href: user ? `/profile/${user.uid}` : "/auth",
      label: "Profil",
      Icon: User,
      avatarUrl: profile?.avatarUrl,
      initial: profile?.displayName?.charAt(0) || user?.email?.charAt(0) || "?",
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border/40 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex">
      {navItems.map(item => {
        const active = isActive(item.href);
        const badge = (item as { badge?: number }).badge;
        return (
          <button
            key={item.href}
            onClick={() => setLocation(item.href)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-w-0 transition-colors ${active ? "text-primary" : "text-foreground/50 hover:text-foreground/80"}`}
          >
            <span className="relative">
              {item.label === "Profil" && profile?.avatarUrl ? (
                <span className={`w-6 h-6 rounded-full overflow-hidden block border-2 ${active ? "border-primary" : "border-transparent"}`}>
              <img src={profile.avatarUrl} alt={t("Profil")} className="w-full h-full object-cover" />
                </span>
              ) : (
                <item.Icon className={`w-5 h-5 ${active ? "fill-primary/20" : ""}`} />
              )}
              {badge != null && badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className={`text-[10px] font-medium leading-none truncate w-full text-center ${active ? "text-primary" : ""}`}>
              {t(item.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ── AppLayout ────────────────────────────────────────────────────────────── */

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <MobileBottomNav />
    </div>
  );
}
