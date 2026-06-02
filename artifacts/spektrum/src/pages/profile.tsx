import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Users, Edit3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, UserProfile } from "@/lib/auth-service";
import { getStoriesByAuthor, Story } from "@/lib/firestore-service";

export default function ProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.uid === uid;

  useEffect(() => {
    if (!uid) return;
    Promise.all([getUserProfile(uid), getStoriesByAuthor(uid)]).then(([p, s]) => {
      setProfile(p);
      setStories(s.filter(story => story.status === "published" || isOwner));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [uid]);

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Skeleton className="h-48 rounded-2xl mb-6" />
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-64 mb-6" />
          <div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return <AppLayout><div className="text-center py-20 text-muted-foreground">Kullanıcı bulunamadı.</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Cover */}
        <div className="relative h-40 rounded-2xl bg-gradient-to-br from-primary/20 via-secondary/10 to-background border border-border overflow-hidden mb-16">
          {profile.coverUrl && <img src={profile.coverUrl} alt="Kapak" className="w-full h-full object-cover" />}

          {/* Avatar */}
          <div className="absolute -bottom-10 left-6 w-20 h-20 rounded-2xl border-4 border-background bg-card overflow-hidden">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary bg-primary/10">{profile.displayName.charAt(0)}</div>
            }
          </div>

          {isOwner && (
            <Link href="/write">
              <button className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card/80 backdrop-blur border border-border text-sm hover:border-primary/50 transition-colors" data-testid="button-new-story">
                <Edit3 className="w-3 h-3" /> Yeni Hikaye
              </button>
            </Link>
          )}
        </div>

        {/* Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold font-serif">{profile.displayName}</h1>
              {profile.genre && <Badge variant="outline" className="border-primary/30 text-primary mt-1">{profile.genre}</Badge>}
              {profile.bio && <p className="text-muted-foreground mt-3 max-w-lg">{profile.bio}</p>}
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="text-center">
              <p className="font-bold text-lg">{profile.storyCount}</p>
              <p className="text-muted-foreground text-xs">Hikaye</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followerCount}</p>
              <p className="text-muted-foreground text-xs">Takipçi</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followingCount}</p>
              <p className="text-muted-foreground text-xs">Takip</p>
            </div>
          </div>
        </motion.div>

        {/* Stories grid */}
        <div>
          <h2 className="text-xl font-bold font-serif mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> Hikayeleri</h2>
          {stories.length === 0 && (
            <div className="py-12 text-center border border-dashed border-border rounded-2xl">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{isOwner ? "Henüz hikaye yazmamışsın." : "Yayınlanmış hikaye yok."}</p>
              {isOwner && <Link href="/write"><button className="mt-3 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors" data-testid="button-write-first">İlk Hikayeni Yaz</button></Link>}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {stories.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link href={`/story/${s.id}`}>
                  <div className="group cursor-pointer" data-testid={`card-profile-story-${s.id}`}>
                    <div className="aspect-[2/3] rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border overflow-hidden mb-2 group-hover:border-primary/50 transition-colors">
                      {s.coverUrl && <img src={s.coverUrl} alt={s.title} className="w-full h-full object-cover" />}
                    </div>
                    <h3 className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{s.title}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant="outline" className="text-xs border-primary/20 text-primary/70">{s.genre}</Badge>
                      {isOwner && s.status !== "published" && (
                        <Badge variant="secondary" className="text-xs">{s.status === "draft" ? "Taslak" : "Tamamlandı"}</Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
