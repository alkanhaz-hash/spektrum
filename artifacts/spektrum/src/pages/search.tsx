import { AppLayout } from "@/components/layout/AppLayout";
import { Link, useSearch, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search as SearchIcon, BookOpen, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { searchStories, searchUsers, Story } from "@/lib/firestore-service";
import { UserProfile } from "@/lib/auth-service";

type Tab = "stories" | "users";

export default function SearchPage() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const initialQuery = new URLSearchParams(searchString).get("q") ?? "";
  const [term, setTerm] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>("stories");
  const [stories, setStories] = useState<Story[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { setTerm(initialQuery); }, [initialQuery]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setStories([]); setUsers([]); setSearched(false);
      if (t.length === 0) setLocation("/search", { replace: true });
      return;
    }
    setLoading(true);
    setSearched(false);
    const urlHandle = setTimeout(() => {
      setLocation(`/search?q=${encodeURIComponent(t)}`, { replace: true });
    }, 400);
    const handle = setTimeout(() => {
      Promise.all([searchStories(t), searchUsers(t)])
        .then(([s, u]) => { setStories(s); setUsers(u); setSearched(true); })
        .catch(() => { setStories([]); setUsers([]); })
        .finally(() => setLoading(false));
    }, 400);
    return () => { clearTimeout(handle); clearTimeout(urlHandle); };
  }, [term]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "stories", label: "Kitaplar", count: stories.length },
    { key: "users",   label: "Yazarlar", count: users.length  },
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="text-3xl font-bold font-serif mb-6">Ara</h1>

        {/* Search input */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Kitap adı, yazar veya etiket ara..."
            className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-search"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {searched && (
                <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : !searched ? (
          <p className="text-muted-foreground text-sm text-center py-10">Aramak için yukarıya bir şeyler yaz.</p>
        ) : tab === "stories" ? (
          stories.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-2xl">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">"{term}" için kitap bulunamadı.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {stories.map((story, i) => (
                <motion.div
                  key={story.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link href={`/story/${story.id}`}>
                    <Card className="h-full overflow-hidden hover:border-primary/50 transition-all group cursor-pointer border-border/50">
                      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                        {story.coverUrl ? (
                          <img src={story.coverUrl} alt={story.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-card">
                            <span className="font-serif text-3xl font-bold text-muted-foreground/30">{story.title.charAt(0)}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <Badge variant="secondary" className="mb-2 bg-background/50 backdrop-blur text-xs">{story.genre}</Badge>
                          <h3 className="font-bold font-serif leading-tight text-lg">{story.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{story.authorName}</p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )
        ) : (
          users.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-2xl">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">"{term}" için yazar bulunamadı.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {users.map((u, i) => (
                <motion.div
                  key={u.uid}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/profile/${u.uid}`}>
                    <Card className="p-4 flex items-center gap-4 hover:border-primary/50 transition-all cursor-pointer border-border/50">
                      <Avatar className="w-14 h-14 shrink-0">
                        <AvatarImage src={u.avatarUrl} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                          {u.displayName?.charAt(0) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{u.displayName}</p>
                        {u.bio && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{u.bio}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground">{u.storyCount ?? 0} hikaye</span>
                          <span className="text-xs text-muted-foreground">{u.followerCount ?? 0} takipçi</span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
