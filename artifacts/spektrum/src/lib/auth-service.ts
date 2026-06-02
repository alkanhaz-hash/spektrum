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
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
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
    email,
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
    emailVerified: false,
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
      email: credential.user.email,
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

export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  const userRef = doc(db, "users", credential.user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: credential.user.uid,
      displayName: credential.user.displayName || "Kullanıcı",
      email: credential.user.email,
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

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function ensureUserProfile(user: import("firebase/auth").User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    const data: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "Kullanıcı",
      email: user.email || "",
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
    };
    await setDoc(userRef, data);
    return data;
  }
  return snap.data() as UserProfile;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "displayName" | "bio" | "genre" | "status" | "instagram" | "tiktok" | "website" | "avatarUrl" | "coverUrl">>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { ...data });
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
