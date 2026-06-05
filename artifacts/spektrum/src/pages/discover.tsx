import { AppLayout } from "@/components/layout/AppLayout";
import { useGetTrendingStories } from "@workspace/api-client-react";
import { getDiscoverFeed, Story, GENRES } from "@/lib/firestore-service";
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { motion } from "framer-motion";
import { TrendingUp, MessageSquare, BookOpen, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StoryCard({ story, rank, delay = 0 }: { story: { storyId: string; title: string; authorName: string; commentCount: number; readCount: number; engagementScore: number; genre: string; coverUrl: string | null }; rank: number; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Link href={`/story/${story.storyId}`}>
        <div className="group flex gap-4 p-4 rounded-xl border border-border hover:border-primary/50 bg-card hover:bg-card/80 transition-all cursor-pointer" data-testid={`card-story-${story.storyId}`}>
          <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg">
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{story.title}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{story.authorName}</p>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">{story.genre}</Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="w-3 h-3" /> {story.commentCount}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="w-3 h-3" /> {story.readCount.toLocaleString("tr-TR")}
              </span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end justify-center">
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <TrendingUp className="w-3 h-3" /> {story.engagementScore.toFixed(1)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function FirestoreStoryCard({ story, delay = 0 }: { story: Story; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Link href={`/story/${story.id}`}>
        <div className="group p-4 rounded-xl border border-border hover:border-primary/50 bg-card transition-all cursor-pointer" data-testid={`card-discover-${story.id}`}>
          <div className="flex items-start gap-3">
            <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 shrink-0 overflow-hidden">
              {story.coverUrl && <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{story.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{story.authorName}</p>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary mt-2">{story.genre}</Badge>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{story.summary}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="w-3 h-3" /> {story.commentCount}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><BookOpen className="w-3 h-3" /> {story.readCount.toLocaleString("tr-TR")}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="w-3 h-3" /> {story.likeCount}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function DiscoverPage() {
  const { data: trending, isLoading: trendingLoading, isError: trendingError } = useGetTrendingStories();
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const searchString = useSearch();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // URL'deki ?genre= parametresi değiştiğinde (home → discover gibi navigasyonlarda) güncelle
  useEffect(() => {
    const genre = new URLSearchParams(searchString).get("genre");
    setSelectedGenre(genre);
  }, [searchString]);

  useEffect(() => {
    getDiscoverFeed().then(res => {
      setStories(res);
      setStoriesLoading(false);
    }).catch(() => setStoriesLoading(false));
  }, []);

  const filtered = selectedGenre ? stories.filter(s => s.genre === selectedGenre) : stories;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-10">
          <h1 className="text-4xl font-bold font-serif mb-2">Keşfet</h1>
          <p className="text-muted-foreground">Son 24 saatin en hızlı yükselen hikayeleri ve yeni yetenekler</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Trending column */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold font-serif">Son 24 Saatin Yıldızları</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Tüm türler · son 24 saat · tür filtresi uygulanmaz</p>
              <div className="space-y-3">
                {trendingLoading
                  ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                  : trendingError
                  ? (
                    <div className="flex flex-col items-center py-10 text-center text-muted-foreground gap-2">
                      <TrendingUp className="w-8 h-8 opacity-20" />
                      <p className="text-sm">Trend verisi yüklenemedi. Lütfen sayfayı yenile.</p>
                    </div>
                  )
                  : !(trending?.length)
                  ? (
                    <div className="flex flex-col items-center py-10 text-center text-muted-foreground gap-2">
                      <TrendingUp className="w-8 h-8 opacity-20" />
                      <p className="text-sm">Son 24 saatte henüz trend hikaye yok.</p>
                    </div>
                  )
                  : trending.slice(0, 10).map((s, i) => (
                    <StoryCard key={s.storyId} story={s} rank={i + 1} delay={i * 0.05} />
                  ))}
              </div>
            </div>
          </div>

          {/* Genre + new stories column */}
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold font-serif mb-3">Türlere Göz At</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedGenre(null)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${!selectedGenre ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  data-testid="filter-all"
                >
                  Tümü
                </button>
                {GENRES.map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedGenre(g === selectedGenre ? null : g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${selectedGenre === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                    data-testid={`filter-${g}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold font-serif mb-3">Yeni Hikayeler</h2>
              <div className="space-y-3">
                {storiesLoading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
                  : filtered.slice(0, 6).map((s, i) => (
                    <FirestoreStoryCard key={s.id} story={s} delay={i * 0.05} />
                  ))}
                {!storiesLoading && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Bu türde henüz hikaye yok.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
