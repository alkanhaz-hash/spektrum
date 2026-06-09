import { AppLayout } from "@/components/layout/AppLayout";
import { useGetTrendingStories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { GENRES, getDiscoverFeed, Story } from "@/lib/firestore-service";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { BookOpen, Clock, MessageSquare, TrendingUp, Pen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBar } from "@/components/StatusBar";

export default function HomePage() {
  const { data: trending, isLoading: trendingLoading, isError: trendingError } = useGetTrendingStories();
  const { user } = useAuth();
  const [discoverStories, setDiscoverStories] = useState<Story[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState(false);

  useEffect(() => {
    getDiscoverFeed().then(res => {
      setDiscoverStories(res);
      setDiscoverLoading(false);
    }).catch(() => {
      setDiscoverLoading(false);
      setDiscoverError(true);
    });
  }, []);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">

        {/* Status Bar */}
        <section className="mb-8">
          <StatusBar />
        </section>

        {/* Hero Section */}
        <section className="py-20 flex flex-col items-center text-center space-y-8 relative overflow-hidden rounded-3xl bg-card border border-border/50 shadow-2xl shadow-primary/5 mb-16">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/5 pointer-events-none" />
          <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}noise.svg)` }} />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 space-y-6 max-w-3xl"
          >
            <Badge variant="outline" className="px-4 py-1.5 border-primary/30 text-primary bg-primary/5 uppercase tracking-widest text-xs font-semibold">
              Dijital Hikayeciliğin Yeni Boyutu
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-balance leading-tight font-serif">
              Karanlıkta <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Parlar</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              Spektrum; satır aralarında kaybolabileceğin, düşüncelerini her paragrafta paylaşabileceğin ve yeni yetenekleri keşfedebileceğin neon aydınlatmalı bir kütüphane.
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <Link href="/discover" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)] h-12 px-8">
                Keşfetmeye Başla
              </Link>
              <Link href="/write" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-input bg-background/50 backdrop-blur hover:bg-accent hover:text-accent-foreground h-12 px-8">
                Hikayeni Yaz
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Trending Section */}
        <section className="mb-16">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="text-primary w-5 h-5" />
            <h2 className="text-2xl font-bold font-serif">Trend Olanlar</h2>
          </div>
          
          {trendingLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : trendingError || !trending?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
              <TrendingUp className="w-10 h-10 opacity-20" />
              <p className="text-sm">
                {trendingError ? "Trend verisi yüklenemedi. Lütfen sayfayı yenile." : "Henüz trend hikaye yok."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trending.map((story, i) => (
                <motion.div
                  key={story.storyId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link href={`/story/${story.storyId}`}>
                    <Card className="h-full overflow-hidden hover:border-primary/50 transition-colors bg-card/50 backdrop-blur group cursor-pointer">
                      <CardContent className="p-6 h-full flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <Badge variant="secondary" className="bg-secondary/10 text-secondary border-secondary/20">{story.genre}</Badge>
                            <span className="text-2xl font-bold text-primary/20 group-hover:text-primary/40 transition-colors">#{i + 1}</span>
                          </div>
                          <h3 className="text-xl font-bold font-serif mb-2 line-clamp-2">{story.title}</h3>
                          <p className="text-sm text-muted-foreground mb-4">Yazar: <span className="text-foreground">{story.authorName}</span></p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {story.commentCount}</span>
                          <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4" /> {Math.round(story.engagementScore)} Puan</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Genres */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold font-serif mb-6">Kategoriler</h2>
          <div className="flex flex-wrap gap-2">
            {GENRES.map(genre => (
              <Link key={genre} href={`/discover?genre=${genre}`}>
                <Badge variant="outline" className="px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer text-sm">
                  {genre}
                </Badge>
              </Link>
            ))}
          </div>
        </section>

        {/* Discover Feed */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Clock className="text-secondary w-5 h-5" />
            <h2 className="text-2xl font-bold font-serif">Yeni Eklenenler</h2>
          </div>
          
          {discoverLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
            </div>
          ) : discoverError || !discoverStories.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
              <BookOpen className="w-10 h-10 opacity-20" />
              <p className="text-sm">
                {discoverError ? "Hikayeler yüklenemedi. Lütfen sayfayı yenile." : "Henüz yayınlanmış hikaye yok."}
              </p>
              {!discoverError && (
                <Link href="/write">
                  <button className="flex items-center gap-2 mt-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm transition-all hover:shadow-[0_0_14px_hsl(var(--primary)/0.3)]">
                    <Pen className="w-4 h-4" /> İlk Hikayeyi Sen Yaz
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {discoverStories.map((story, i) => (
                <motion.div
                  key={story.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/story/${story.id}`}>
                    <Card className="h-full overflow-hidden hover:border-secondary/50 transition-all hover:shadow-[0_0_15px_hsl(var(--secondary)/0.15)] group cursor-pointer border-border/50">
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
                          <h3 className="font-bold font-serif leading-tight text-lg shadow-sm">{story.title}</h3>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
