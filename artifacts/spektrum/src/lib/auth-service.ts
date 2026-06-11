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
import { doc, setDoc, getDoc, updateDoc, deleteField, serverTimestamp, collection, query, where, limit, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

// Mobil cihaz tespiti (User-Agent tabanlı)
const isMobileDevice = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/** Verilen takma adın başka bir kullanıcı tarafından kullanılıp kullanılmadığını kontrol eder. */
export async function isNicknameTaken(displayName: string, excludeUid?: string): Promise<boolean> {
  const q = query(
    collection(db, "users"),
    where("displayName", "==", displayName.trim()),
    limit(2)
  );
  const snap = await getDocs(q);
  if (snap.empty) return false;
  // Kendi UID'si hariç başka biri kullanıyorsa alınmış sayılır
  if (excludeUid) {
    return snap.docs.some(d => d.id !== excludeUid);
  }
  return !snap.empty;
}

/** Yaş doğrulama — 13 yaşından küçükse hata fırlatır. */
function validateAge(birthDate: string): void {
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 13);
  if (new Date(birthDate) > minDate) {
    const err = new Error("13 yaşından küçük kullanıcılar kayıt olamaz.");
    (err as any).code = "auth/underage";
    throw err;
  }
}

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
  statusColor?: string;
  statusExpiresAt?: unknown;
  instagram?: string;
  tiktok?: string;
  website?: string;
  pinterest?: string;
  snapchat?: string;
  banned?: boolean;
  banReason?: string;
  birthDate?: string;
  gender?: string;
  /** false → yeni Google kullanıcısı, takma ad henüz seçilmedi. undefined/true → tamam. */
  nicknameSet?: boolean;
}

// Üretim URL'si — e-posta linklerinin gideceği yer
function appUrl() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  birthDate: string,
  gender: string
): Promise<User> {
  // Sunucu tarafı yaş doğrulaması
  validateAge(birthDate);
  // Sunucu tarafı nickname benzersizlik kontrolü
  const taken = await isNicknameTaken(displayName);
  if (taken) {
    const err = new Error("Bu takma ad zaten kullanılıyor. Farklı bir isim dene.");
    (err as any).code = "auth/nickname-taken";
    throw err;
  }
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
    nicknameSet: true,
    birthDate,
    gender,
  });
  // E-posta doğrulama zorunlu — hata olursa kayıt başarısız sayılır
  await sendEmailVerification(credential.user, {
    url: appUrl() + "/auth",
    handleCodeInApp: false,
  });
  return credential.user;
}

export async function resendVerificationEmail(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Oturum bulunamadı.");
  await sendEmailVerification(currentUser, {
    url: appUrl() + "/auth",
    handleCodeInApp: false,
  });
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email, {
    url: appUrl() + "/auth",
    handleCodeInApp: false,
  });
}

export async function loginUser(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    // signOut YAPMIYORUZ — kullanıcı oturumda kalıyor ki "Tekrar Gönder" çalışsın.
    const err = new Error("E-posta adresin henüz doğrulanmamış. Lütfen gelen kutunu kontrol et.");
    (err as any).code = "auth/email-not-verified";
    throw err;
  }
  const userRef = doc(db, "users", credential.user.uid);
  const snap = await getDoc(userRef);
  // Ban kontrolü — askıya alınmış kullanıcıyı giriş yaptırmıyoruz
  if (snap.exists() && snap.data()?.banned === true) {
    await signOut(auth);
    const reason: string = snap.data()?.banReason || "Hesabın askıya alındı.";
    const err = new Error(`Hesabın askıya alındı: ${reason}`);
    (err as any).code = "auth/user-banned";
    throw err;
  }
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
      nicknameSet: false,
    });
  } else {
    // PII temizliği: eski Google profillerinde e-posta kalmış olabilir
    const data = snap.data();
    const patch: Record<string, unknown> = {};
    if ("email" in data) patch.email = deleteField();
    if ("emailVerified" in data) patch.emailVerified = deleteField();
    if (Object.keys(patch).length > 0) {
      await updateDoc(userRef, patch);
    }
  }
}

export async function loginWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  // Ban kontrolü — Google ile giriş yapan askıya alınmış kullanıcıyı da engelle
  const snap = await getDoc(doc(db, "users", credential.user.uid));
  if (snap.exists() && snap.data()?.banned === true) {
    await signOut(auth);
    const reason: string = snap.data()?.banReason || "Hesabın askıya alındı.";
    const err = new Error(`Hesabın askıya alındı: ${reason}`);
    (err as any).code = "auth/user-banned";
    throw err;
  }
  await ensureGoogleProfile(credential.user);
  return credential.user;
}

// Artık redirect kullanmıyoruz — geriye dönük uyumluluk için boş bırakıldı
export async function getGoogleRedirectResult(): Promise<User | null> {
  return null;
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
  data: Partial<Pick<UserProfile, "displayName" | "bio" | "genre" | "status" | "statusColor" | "statusExpiresAt" | "instagram" | "tiktok" | "website" | "pinterest" | "snapchat" | "avatarUrl" | "coverUrl">>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { ...data });
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
