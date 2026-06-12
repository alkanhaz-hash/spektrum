import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  summary: string;
  coverUrl: string;
  genre: string;
  tags: string[];
  chapterCount: number;
  readCount: number;
  likeCount: number;
  commentCount: number;
  likedBy?: string[];
  status: "published" | "draft" | "completed";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Chapter {
  id: string;
  storyId: string;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  readCount: number;
  status: "published" | "pending_review" | "draft" | "rejected";
  moderationCategories?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantAvatars: Record<string, string>;
  lastMessage: string;
  lastMessageAt: Timestamp;
  unreadCount: Record<string, number>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "gif";
  createdAt: Timestamp;
}

export const GENRES = [
  "Roman", "Fantazi", "Bilim Kurgu", "Romantik", "Gerilim",
  "Korku", "Gizem", "Macera", "Tarihî", "Dram", "Komedi", "Polisiye",
];

// ─── Hikayeler ────────────────────────────────────────────────────────────────

export async function getPublishedStories(pageSize = 20, genre?: string): Promise<Story[]> {
  const constraints: Parameters<typeof query>[1][] = [
    where("status", "==", "published"),
    limit(pageSize * 2),
  ];
  if (genre) constraints.push(where("genre", "==", genre));
  const q = query(collection(db, "stories"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Story))
    .filter((s) => (s.chapterCount ?? 0) > 0)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
    .slice(0, pageSize);
}

export async function getStory(id: string): Promise<Story | null> {
  const snap = await getDoc(doc(db, "stories", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Story;
}

export async function getStoriesByAuthor(authorId: string, publishedOnly = false): Promise<Story[]> {
  const constraints: Parameters<typeof query>[1][] = [where("authorId", "==", authorId)];
  if (publishedOnly) constraints.push(where("status", "==", "published"));
  const q = query(collection(db, "stories"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Story))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function searchStories(term: string): Promise<Story[]> {
  const t = term.trim().toLocaleLowerCase("tr");
  if (!t) return [];
  const snap = await getDocs(query(collection(db, "stories"), limit(300)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Story))
    .filter(
      (s) =>
        (s.chapterCount ?? 0) > 0 &&
        (s.title.toLocaleLowerCase("tr").includes(t) ||
          s.authorName.toLocaleLowerCase("tr").includes(t) ||
          (s.summary ?? "").toLocaleLowerCase("tr").includes(t) ||
          (s.tags ?? []).some((tag) => tag.toLocaleLowerCase("tr").includes(t)))
    )
    .sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0));
}

export async function createStory(data: {
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  authorId: string;
  authorName: string;
  authorAvatar: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "stories"), {
    ...data,
    coverUrl: "",
    chapterCount: 0,
    readCount: 0,
    likeCount: 0,
    commentCount: 0,
    status: "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", data.authorId), { storyCount: increment(1) });
  return ref.id;
}

export async function incrementStoryRead(storyId: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), { readCount: increment(1) });
}

export async function likeStory(storyId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), {
    likeCount: increment(1),
    likedBy: arrayUnion(uid),
  });
}

export async function unlikeStory(storyId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), {
    likeCount: increment(-1),
    likedBy: arrayRemove(uid),
  });
}

// ─── Bölümler ─────────────────────────────────────────────────────────────────

export async function getChapters(storyId: string): Promise<Chapter[]> {
  const q = query(
    collection(db, "stories", storyId, "chapters"),
    where("status", "==", "published"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chapter));
}

export async function getAllChapters(storyId: string): Promise<Chapter[]> {
  const q = query(collection(db, "stories", storyId, "chapters"), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chapter));
}

export async function getChapter(storyId: string, chapterId: string): Promise<Chapter | null> {
  const snap = await getDoc(doc(db, "stories", storyId, "chapters", chapterId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Chapter;
}

export async function createChapter(
  storyId: string,
  authorId: string,
  data: { title: string; content: string; order: number }
): Promise<string> {
  const wordCount = data.content.trim().split(/\s+/).length;
  const ref = await addDoc(collection(db, "stories", storyId, "chapters"), {
    ...data,
    storyId,
    wordCount,
    readCount: 0,
    status: "pending_review",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── Mesajlar ────────────────────────────────────────────────────────────────

export async function getConversations(uid: string): Promise<Conversation[]> {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Conversation))
    .sort((a, b) => (b.lastMessageAt?.seconds ?? 0) - (a.lastMessageAt?.seconds ?? 0));
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const q = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    orderBy("createdAt", "asc"),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
}

export async function sendMessage(
  conversationId: string,
  data: {
    senderId: string;
    senderName: string;
    senderAvatar: string;
    text: string;
    receiverId: string;
  }
): Promise<void> {
  await addDoc(collection(db, "messages"), {
    conversationId,
    senderId: data.senderId,
    senderName: data.senderName,
    senderAvatar: data.senderAvatar,
    text: data.text,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "conversations", conversationId), {
    lastMessage: data.text,
    lastMessageAt: serverTimestamp(),
    [`unreadCount.${data.receiverId}`]: increment(1),
  });
}

export async function getOrCreateConversation(
  uid1: string,
  uid2: string,
  names: Record<string, string>,
  avatars: Record<string, string>
): Promise<string> {
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", uid1)
  );
  const snap = await getDocs(q);
  const existing = snap.docs.find((d) => {
    const p = d.data().participants as string[];
    return p.includes(uid2);
  });
  if (existing) return existing.id;
  const ref = doc(collection(db, "conversations"));
  await setDoc(ref, {
    participants: [uid1, uid2],
    participantNames: names,
    participantAvatars: avatars,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    unreadCount: { [uid1]: 0, [uid2]: 0 },
  });
  return ref.id;
}

export async function markConversationRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "conversations", conversationId), {
    [`unreadCount.${uid}`]: 0,
  });
}

// ─── Takip ────────────────────────────────────────────────────────────────────

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(db, "follows"),
      where("followerId", "==", followerId),
      where("followedId", "==", followedId),
      limit(1)
    )
  );
  return !snap.empty;
}

export async function followUser(followerId: string, followedId: string): Promise<void> {
  const id = `${followerId}_${followedId}`;
  await setDoc(doc(db, "follows", id), {
    followerId,
    followedId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", followedId), { followerCount: increment(1) });
  await updateDoc(doc(db, "users", followerId), { followingCount: increment(1) });
}

export async function unfollowUser(followerId: string, followedId: string): Promise<void> {
  const id = `${followerId}_${followedId}`;
  const followRef = doc(db, "follows", id);
  const snap = await getDoc(followRef);
  if (snap.exists()) {
    await deleteDoc(followRef);
    await updateDoc(doc(db, "users", followedId), { followerCount: increment(-1) });
    await updateDoc(doc(db, "users", followerId), { followingCount: increment(-1) });
  }
}
