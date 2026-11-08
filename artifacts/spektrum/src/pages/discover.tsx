import { AppLayout } from "@/components/layout/AppLayout";
import { getDiscoverFeed, getTrendingStories, TrendingStory, Story, GENRES } from "@/lib/firestore-service";
import { useEffect, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  TrendingUp, MessageSquare, BookOpen, Star,
  Wand2, Heart, Eye, Skull, Rocket, Swords,
  Drama, Brain, ScrollText, Sparkles, Zap,
  Smile, Feather, PenLine, LayoutGrid
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WeeklyLeaderboard } from "@/components/WeeklyLeaderboard";
import { useLocale } from "@/contexts/LocaleContext";
import { translateGenre } from "@workspace/spektrum-i18n";

const GENRE_META: Record<string, { icon: React.ReactNode; color: string }> = {
  "Fantastik":    { icon: <Wand2 className="w-6 h-6" />,       color: "from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-400" },
  "Romantik":     { icon: <Heart className="w-6 h-6" />,        color: "from-pink-500/20 to-rose-500/10 border-pink-500/30 text-pink-400" },
  "Gizem":        { icon: <Eye className="w-6 h-6" />,          color: "from-cyan-500/20 to-sky-500/10 border-cyan-500/30 text-cyan-400" },
  "Korku":        { icon: <Skull className="w-6 h-6" />,        color: "from-red-500/20 to-orange-500/10 border-red-500/30 text-red-400" },
  "Bilim Kurgu":  { icon: <Rocket className="w-6 h-6" />,       color: "from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400" },
  "Macera":       { icon: <Swords className="w-6 h-6" />,       color: "from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-400" },
  "Dram":         { icon: <Drama className="w-6 h-6" />,        color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400" },
  "Psikolojik":   { icon: <Brain className="w-6 h-6" />,        color: "from-fuchsia-500/20 to-purple-500/10 border-fuchsia-500/30 text-fuchsia-400" },
  "Tarihi":       { icon: <ScrollText className="w-6 h-6" />,   color: "from-orange-500/20 to-amber-500/10 border-orange-500/30 text-orange-400" },
  "Gençlik":      { icon: <Sparkles className="w-6 h-6" />,     color: "from-lime-500/20 to-green-500/10 border-lime-500/30 text-lime-400" },
  "Gerilim":      { icon: <Zap className="w-6 h-6" />,          color: "from-yellow-500/20 to-amber-500/10 border-yellow-500/30 text-yellow-400" },
  "Komedi":       { icon: <Smile className="w-6 h-6" />,        color: "from-green-500/20 to-emerald-500/10 border-green-500/30 text-green-400" },
  "Şiir":         { icon: <Feather className="w-6 h-6" />,      color: "from-sky-500/20 to-cyan-500/10 border-sky-500/30 text-sky-400" },
  "Deneme":       { icon: <PenLine className="w-6 h-6" />,      color: "from-slate-500/20 to-gray-500/10 border-slate-500/30 text-slate-400" },
};

function StoryCard({ story, rank, delay = 0 }: { story: TrendingStory; rank: number; delay?: number }) {
  const { locale } = useLocale();
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
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">{translateGenre(locale, story.genre)}</Badge>
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
  const { locale } = useLocale();
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
              <Badge variant="outline" className="text-xs border-primary/30 text-primary mt-2">{translateGenre(locale, story.genre)}</Badge>
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

function GenreGrid({ selectedGenre, onSelect }: { selectedGenre: string | null; onSelect: (g: string | null) => void }) {
  const { locale, t } = useLocale();
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold font-serif">{t("Türlere Göz At")}</h2>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          onClick={() => onSelect(null)}
          data-testid="filter-all"
          className={`aspect-square flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all text-sm font-medium
            ${!selectedGenre
              ? "border-primary bg-primary/15 text-primary shadow-[0_0_12px_rgba(139,92,246,0.3)]"
              : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
            }`}
        >
          <Star className="w-6 h-6" />
          <span className="text-xs leading-tight text-center px-1">{t("Tümü")}</span>
        </motion.button>

        {GENRES.map((g, i) => {
          const meta = GENRE_META[g];
          const isSelected = selectedGenre === g;
          return (
            <motion.button
              key={g}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              onClick={() => onSelect(isSelected ? null : g)}
              data-testid={`filter-${g}`}
              className={`aspect-square flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all
                ${isSelected
                  ? `bg-gradient-to-br ${meta?.color ?? "border-primary text-primary"} shadow-[0_0_12px_rgba(139,92,246,0.25)] scale-105`
                  : "border-border bg-card text-muted-foreground hover:scale-105"
                }`}
            >
              <span className={isSelected ? (meta?.color.split(" ").find(c => c.startsWith("text-")) ?? "text-primary") : "text-muted-foreground"}>
                {meta?.icon ?? <BookOpen className="w-6 h-6" />}
              </span>
              <span className="text-xs leading-tight text-center px-1 font-medium">{translateGenre(locale, g)}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { locale, t } = useLocale();
  const [trending, setTrending] = useState<TrendingStory[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [contentLanguage, setContentLanguage] = useState<"tr" | "en" | "all">(locale);

  useEffect(() => {
    const genre = new URLSearchParams(searchString).get("genre");
    setSelectedGenre(genre);
  }, [searchString]);

  useEffect(() => {
    getTrendingStories(10)
      .then(setTrending)
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  useEffect(() => {
    getDiscoverFeed(contentLanguage).then(res => {
      setStories(res);
      setStoriesLoading(false);
    }).catch(() => setStoriesLoading(false));
  }, [contentLanguage]);

  useEffect(() => { setContentLanguage(locale); }, [locale]);

  const filtered = selectedGenre ? stories.filter(s => s.genre === selectedGenre) : stories;
  const visibleTrending = trending.filter(s => contentLanguage === "all" || (s.contentLanguage ?? "tr") === contentLanguage);

  function handleGenreSelect(genre: string | null) {
    if (genre) {
      setLocation(`/discover?genre=${encodeURIComponent(genre)}`);
    } else {
      setLocation("/discover");
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 space-y-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-4xl font-bold font-serif mb-2">{t("Keşfet")}</h1>
          <p className="text-muted-foreground">{t("Son 24 saatin en hızlı yükselen hikayeleri ve yeni yetenekler")}</p>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2" aria-label={t("Yayın dili")}>
          <span className="text-sm text-muted-foreground">{t("Yayın dili")}:</span>
          {(["tr", "en", "all"] as const).map(language => (
            <button
              key={language}
              type="button"
              onClick={() => setContentLanguage(language)}
              aria-pressed={contentLanguage === language}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${contentLanguage === language ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
              data-testid={`filter-language-${language}`}
            >
              {t(language === "tr" ? "Türkçe içerik" : language === "en" ? "İngilizce içerik" : "Tüm diller")}
            </button>
          ))}
        </div>

        <WeeklyLeaderboard />

        {/* Trending stories — tür filtresi seçilmediğinde göster */}
        {!selectedGenre && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-serif">{t("Son 24 Saatin Yıldızları")}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t("Tüm türler · son 24 saat")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {trendingLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                : visibleTrending.length === 0
                ? (
                  <div className="col-span-2 flex flex-col items-center py-10 text-center text-muted-foreground gap-2">
                    <TrendingUp className="w-8 h-8 opacity-20" />
                    <p className="text-sm">{t("Son 24 saatte henüz trend hikaye yok.")}</p>
                  </div>
                )
                : visibleTrending.map((s, i) => (
                  <StoryCard key={s.storyId} story={s} rank={i + 1} delay={i * 0.05} />
                ))}
            </div>
          </div>
        )}

        {/* Tür grid'i — kareler */}
        <GenreGrid selectedGenre={selectedGenre} onSelect={handleGenreSelect} />

        {/* Filtrelenmiş hikayeler */}
        <div>
          <h2 className="text-xl font-bold font-serif mb-4">
            {selectedGenre ? `${translateGenre(locale, selectedGenre)} ${t("Hikayeleri")}` : t("Yeni Hikayeler")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {storiesLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
              : filtered.map((s, i) => (
                <FirestoreStoryCard key={s.id} story={s} delay={i * 0.04} />
              ))}
          </div>
          {!storiesLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center gap-3">
              <BookOpen className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
              {selectedGenre ? `"${translateGenre(locale, selectedGenre)}" ${t("türünde henüz hikaye yok.")}` : t("Henüz yayınlanmış hikaye yok.")}
              </p>
              {selectedGenre && (
                <button
                  onClick={() => handleGenreSelect(null)}
                  className="text-xs text-primary hover:text-primary/80 transition-colors underline underline-offset-2"
                >
                  Filtreyi temizle → Tüm hikayeleri gör
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
