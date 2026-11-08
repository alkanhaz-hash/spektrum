import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  limit,
  getDocs,
  deleteField,
} from "firebase/firestore";
import { auth, db } from "./firebase";

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
  banned?: boolean;
  banReason?: string;
  accountFrozen?: boolean;
  accountFrozenAt?: unknown;
  nicknameSet?: boolean;
  jetonBalance?: number;
}

export async function isNicknameTaken(displayName: string, excludeUid?: string): Promise<boolean> {
  const q = query(collection(db, "users"), where("displayName", "==", displayName.trim()), limit(2));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (excludeUid) return snap.docs.some((d) => d.id !== excludeUid);
  return !snap.empty;
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  birthDate: string,
  gender: string,
  consent: { termsAccepted: boolean; kvkkAcknowledged: boolean }
): Promise<User> {
  if (!consent.termsAccepted || !consent.kvkkAcknowledged) {
    throw new Error("Kullanıcı Sözleşmesi ve KVKK Aydınlatma Metni onayı gereklidir.");
  }
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 13);
  if (new Date(birthDate) > minDate) {
    const err = new Error("13 yaşından küçük kullanıcılar kayıt olamaz.");
    (err as any).code = "auth/underage";
    throw err;
  }
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
    termsAcceptedAt: serverTimestamp(),
    termsVersion: "2025-06",
    kvkkNoticeAcknowledgedAt: serverTimestamp(),
    kvkkNoticeVersion: "2025-06",
  });
  return credential.user;
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
  } else {
    const data = snap.data();
    const patch: Record<string, unknown> = {};
    if (!("role" in data)) patch.role = "user";
    if (!("followerCount" in data)) patch.followerCount = 0;
    if (!("followingCount" in data)) patch.followingCount = 0;
    if (!("storyCount" in data)) patch.storyCount = 0;
    if (!("readCount" in data)) patch.readCount = 0;
    if (!("bio" in data)) patch.bio = "";
    if (!("avatarUrl" in data)) patch.avatarUrl = "";
    if (!("coverUrl" in data)) patch.coverUrl = "";
    if (!("genre" in data)) patch.genre = "";
    if ("email" in data) patch.email = deleteField();
    if ("emailVerified" in data) patch.emailVerified = deleteField();
    if (data.accountFrozen === true) {
      patch.accountFrozen = false;
      patch.accountFrozenAt = deleteField();
    }
    if (Object.keys(patch).length > 0) await updateDoc(userRef, patch);
  }
  return credential.user;
}

export async function logoutUser(): Promise<void> {
  const { suspendPushForLogout } = await import("./push-notifications");
  await suspendPushForLogout();
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "displayName" | "bio" | "genre" | "status" | "avatarUrl" | "coverUrl">>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { ...data });
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogleCredential(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  const userRef = doc(db, "users", result.user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: result.user.uid,
      displayName: result.user.displayName || result.user.email?.split("@")[0] || "Kullanıcı",
      bio: "",
      avatarUrl: result.user.photoURL || "",
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
    const data = snap.data();
    const patch: Record<string, unknown> = {};
    if (!("role" in data)) patch.role = "user";
    if (!("followerCount" in data)) patch.followerCount = 0;
    if (!("followingCount" in data)) patch.followingCount = 0;
    if (!("storyCount" in data)) patch.storyCount = 0;
    if (!("readCount" in data)) patch.readCount = 0;
    if (!("bio" in data)) patch.bio = "";
    if (!("avatarUrl" in data)) patch.avatarUrl = result.user.photoURL || "";
    if (!("coverUrl" in data)) patch.coverUrl = "";
    if (Object.keys(patch).length > 0) await updateDoc(userRef, patch);
  }
  return result.user;
}

export async function deleteAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Oturum bulunamadı.");
  if (!user.providerData.some((provider: { providerId: string }) => provider.providerId === "password")) {
    throw new Error("Bu hesap e-posta ve şifreyle açılmamış. Hesap silme işlemini web sitesindeki Hesabı Sil sayfasından başlat.");
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  const idToken = await user.getIdToken(true);
  const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? "";
  const response = await fetch(`${apiBase}/api/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Hesap silme servisine ulaşılamadı. Lütfen tekrar dene.");
  }
  await signOut(auth);
}

export async function freezeAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Oturum bulunamadı.");
  if (!user.providerData.some((provider: { providerId: string }) => provider.providerId === "password")) {
    throw new Error("Hesap dondurma şu anda e-posta ve şifreyle açılan hesaplarda kullanılabilir.");
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await updateDoc(doc(db, "users", user.uid), {
    accountFrozen: true,
    accountFrozenAt: serverTimestamp(),
  });
  await signOut(auth);
}
