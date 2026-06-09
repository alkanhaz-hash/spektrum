import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthChange, UserProfile, ensureUserProfile } from "@/lib/auth-service";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotUid, setSnapshotUid] = useState<string | null>(null);

  const refreshProfile = () => {
    // onSnapshot zaten canlı güncelliyor; manuel bir şey yapmaya gerek yok.
    // Geriye dönük uyumluluk için bırakıldı.
  };

  useEffect(() => {
    const unsubAuth = onAuthChange(async (u) => {
      setUser(u);
      if (u) {
        try {
          // Backfill: eksik alanlar ilk girişte tamamlanır
          const initial = await ensureUserProfile(u);
          setProfile(initial);
          setSnapshotUid(u.uid);
        } catch (err) {
          console.error("ensureUserProfile failed:", err);
          setProfile(null);
          setSnapshotUid(null);
        }
      } else {
        setProfile(null);
        setSnapshotUid(null);
      }
      setLoading(false);
    });
    return unsubAuth;
  }, []);

  // Kullanıcı oturum açıkken Firestore belgesini canlı dinle.
  // Konsoldan yapılan rol değişiklikleri çıkış-giriş gerektirmeden anında yansır.
  useEffect(() => {
    if (!snapshotUid) return;
    const unsub = onSnapshot(
      doc(db, "users", snapshotUid),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          // Oturum açıkken ban yapılırsa anında çıkış yap
          if (data.banned) {
            setProfile(null);
            await signOut(auth);
            return;
          }
          setProfile(data);
        }
      },
      (err) => {
        console.error("profile onSnapshot error:", err);
      }
    );
    return unsub;
  }, [snapshotUid]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
