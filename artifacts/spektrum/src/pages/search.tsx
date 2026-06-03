import { AppLayout } from "@/components/layout/AppLayout";
import { Link, useSearch } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search as SearchIcon, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { searchStories, Story } from "@/lib/firestore-service";

export default function SearchPage() {
  const searchString = useSearch();
  const initialQuery = new URLSearchParams(searchString).get("q") ?? "";
  const [term, setTerm] = useState(initialQuery);
  const [results, setResults] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setTerm(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const t = term.trim();
    if (!t) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchStories(t)
        .then(res => {
          setResults(res);
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [term]);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="text-3xl font-bold font-serif mb-6">Kitap Ara</h1>

        <div className="relative mb-8">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Başlık, yazar veya etiket ara..."
            className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-search"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : searched && results.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-2xl">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">"{term}" için sonuç bulunamadı.</p>
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {results.map((story, i) => (
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
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Aramak için yukarıya bir şeyler yaz.</p>
        )}
      </div>
    </AppLayout>
  );
}
