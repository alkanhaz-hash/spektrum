import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, deleteField, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// Mobil cihaz tespiti (User-Agent tabanlı)
const isMobileDevice = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

// GÜVENLİK NOTU: e-posta (ve emailVerified) artık Firestore `users` belgesinde
// TUTULMAZ. `users` belgeleri herkese açık okunabilir (profil ad/avatar/bio için);
// e-posta bir PII olduğundan oraya yazılmaz. Kullanıcının kendi e-postası her zaman
// Firebase Auth üzerinden (auth.currentUser.email) erişilebilir.
export interface UserProfile {
  uid: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  genre: string;
  followerCount: number;
  followingCount: number;
  storyCount: number;
  readCount: number;
  createdAt: unknown;
  role: "user" | "moderator" | "admin";
  status?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
  pinterest?: string;
  snapchat?: string;
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await setDoc(doc(db, "users", credential.user.uid), {
    uid: credential.user.uid,
    displayName,
    bio: "",
    avatarUrl: "",
    coverUrl: "",
    genre: "",
    followerCount: 0,
    followingCount: 0,
    storyCount: 0,
    readCount: 0,
    createdAt: serverTimestamp(),
    role: "user",
  });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function loginUser(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const userRef = doc(db, "users", credential.user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: credential.user.uid,
      displayName: credential.user.displayName || credential.user.email?.split("@")[0] || "Kullanıcı",
      bio: "",
      avatarUrl: credential.user.photoURL || "",
      coverUrl: "",
      genre: "",
      followerCount: 0,
      followingCount: 0,
      storyCount: 0,
      readCount: 0,
      createdAt: serverTimestamp(),
      role: "user",
    });
  }
  return credential.user;
}

async function ensureGoogleProfile(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || "Kullanıcı",
      bio: "",
      avatarUrl: user.photoURL || "",
      coverUrl: "",
      genre: "",
      followerCount: 0,
      followingCount: 0,
      storyCount: 0,
      readCount: 0,
      createdAt: serverTimestamp(),
      role: "user",
    });
  }
}

export async function loginWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  if (isMobileDevice()) {
    // Mobilde popup bloke edilebilir — redirect kullan, sayfa yeniden yüklenir
    await signInWithRedirect(auth, provider);
    return null; // Sayfa redirect olacak, buraya ulaşılmaz
  }
  const credential = await signInWithPopup(auth, provider);
  await ensureGoogleProfile(credential.user);
  return credential.user;
}

// Mobil Google redirect'ten döndükten sonra sonucu yakala
export async function getGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  if (!result) return null;
  await ensureGoogleProfile(result.user);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    const patch: Record<string, unknown> = {};
    // GÜVENLİK: eski belgelerde e-posta/emailVerified herkese açık okunabiliyordu.
    // Kullanıcı her oturum açtığında bu PII alanlarını Firestore'dan temizle.
    if ("email" in data) patch.email = deleteField();
    if ("emailVerified" in data) patch.emailVerified = deleteField();
    // BUG FIX: Eski (role alanı olmayan) belgelerde güvenlik kuralı tüm profil
    // güncellemelerini reddediyordu (fotoğraf/kapak/bio kaydedilemiyordu).
    // Eksik zorunlu alanları burada tamamla.
    if (!("role" in data)) patch.role = "user";
    if (!("followerCount" in data)) patch.followerCount = 0;
    if (!("followingCount" in data)) patch.followingCount = 0;
    if (!("storyCount" in data)) patch.storyCount = 0;
    if (!("readCount" in data)) patch.readCount = 0;
    if (!("bio" in data)) patch.bio = "";
    if (!("avatarUrl" in data)) patch.avatarUrl = "";
    if (!("coverUrl" in data)) patch.coverUrl = "";
    if (!("genre" in data)) patch.genre = "";
    if (Object.keys(patch).length > 0) {
      await updateDoc(userRef, patch);
      const fresh = await getDoc(userRef);
      return fresh.data() as UserProfile;
    }
    return data as UserProfile;
  }
  // BUG FIX: setDoc sonrası getDoc yapılıyor — serverTimestamp() sentinel değil,
  // Firestore'un çözülmüş gerçek değeri döndürülüyor.
  await setDoc(userRef, {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Kullanıcı",
    bio: "",
    avatarUrl: user.photoURL || "",
    coverUrl: "",
    genre: "",
    followerCount: 0,
    followingCount: 0,
    storyCount: 0,
    readCount: 0,
    createdAt: serverTimestamp(),
    role: "user",
  });
  const freshSnap = await getDoc(userRef);
  return freshSnap.data() as UserProfile;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "displayName" | "bio" | "genre" | "status" | "instagram" | "tiktok" | "website" | "pinterest" | "snapchat" | "avatarUrl" | "coverUrl">>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { ...data });
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
