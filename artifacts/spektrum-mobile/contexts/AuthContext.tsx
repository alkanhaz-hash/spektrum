import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthChange, getUserProfile, UserProfile } from "@/lib/auth-service";
import { firebaseReady } from "@/lib/firebase";
import { clearImportRecovery } from "@/lib/book-import-recovery";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const p = await getUserProfile(user.uid);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    try {
      let previousUid: string | null = null;
      const unsub = onAuthChange(async (u) => {
        const oldUid = previousUid;
        previousUid = u?.uid ?? null;
        if (oldUid && oldUid !== previousUid) {
          void clearImportRecovery(oldUid).catch(() => console.warn("Aktarımın cihaz kurtarma kaydı temizlenemedi."));
        }
        setUser(u);
        if (u) {
          try {
            const p = await getUserProfile(u.uid);
            setProfile(p);
          } catch {
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      });
      return unsub;
    } catch {
      setLoading(false);
      return;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
