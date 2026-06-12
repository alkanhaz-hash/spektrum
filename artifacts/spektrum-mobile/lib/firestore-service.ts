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
  onSnapshot,
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
  rejectionReason?: string;
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

/**
 * Engagement skoruna göre sıralanmış trend hikayeler.
 * Skor = readCount + likeCount×2 + commentCount×3
 */
export async function getTrendingStories(pageSize = 20): Promise<Story[]> {
  const q = query(
    collection(db, "stories"),
    where("status", "==", "published"),
    limit(200),
  );
  const snap = await getDocs(q);
  const score = (s: Story) =>
    (s.readCount ?? 0) + (s.likeCount ?? 0) * 2 + (s.commentCount ?? 0) * 3;
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Story))
    .filter((s) => (s.chapterCount ?? 0) > 0)
    .sort((a, b) => score(b) - score(a))
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

export async function updateStory(id: string, data: Partial<Pick<Story, "title" | "summary" | "genre" | "tags" | "coverUrl" | "status">>): Promise<void> {
  await updateDoc(doc(db, "stories", id), { ...data, updatedAt: serverTimestamp() });
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

export async function hasUserLikedStory(storyId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "stories", storyId));
  if (!snap.exists()) return false;
  const likedBy = (snap.data()?.likedBy ?? []) as string[];
  return likedBy.includes(userId);
}

// ─── Bölümler ─────────────────────────────────────────────────────────────────
// NOT: Bölümler, web uygulamasıyla aynı şekilde flat "chapters" koleksiyonunda tutulur.
// Eski subcollection path'i (stories/{id}/chapters) KULLANILMAZ.

export async function getChapters(storyId: string): Promise<Chapter[]> {
  const q = query(
    collection(db, "chapters"),
    where("storyId", "==", storyId),
    where("status", "==", "published"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Chapter))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getAllChapters(storyId: string): Promise<Chapter[]> {
  const q = query(collection(db, "chapters"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Chapter))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getChapter(chapterId: string): Promise<Chapter | null> {
  const snap = await getDoc(doc(db, "chapters", chapterId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Chapter;
}

export async function createChapter(data: {
  storyId: string;
  title: string;
  content: string;
  order: number;
  status: Chapter["status"];
}): Promise<string> {
  const wordCount = data.content.trim().split(/\s+/).filter(Boolean).length;
  const ref = await addDoc(collection(db, "chapters"), {
    ...data,
    wordCount,
    readCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "stories", data.storyId), {
    chapterCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateChapter(
  chapterId: string,
  data: Partial<Pick<Chapter, "title" | "content" | "status" | "moderationCategories" | "rejectionReason">>
): Promise<void> {
  const update: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  if (data.content) {
    update.wordCount = data.content.trim().split(/\s+/).filter(Boolean).length;
  }
  await updateDoc(doc(db, "chapters", chapterId), update);
}

// ─── Mesajlar ────────────────────────────────────────────────────────────────

export function listenConversations(uid: string, callback: (convs: Conversation[]) => void) {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const sorted = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Conversation))
      .sort((a, b) => ((b.lastMessageAt as any)?.seconds ?? 0) - ((a.lastMessageAt as any)?.seconds ?? 0));
    callback(sorted);
  });
}

export async function getConversations(uid: string): Promise<Conversation[]> {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Conversation))
    .sort((a, b) => (b.lastMessageAt?.seconds ?? 0) - (a.lastMessageAt?.seconds ?? 0));
}

export function listenMessages(conversationId: string, callback: (msgs: Message[]) => void) {
  const q = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    limit(200),
  );
  return onSnapshot(q, (snap) => {
    const sorted = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Message))
      .sort((a, b) => ((a.createdAt as any)?.seconds ?? 0) - ((b.createdAt as any)?.seconds ?? 0));
    callback(sorted);
  });
}

export async function sendMessage(
  conversationId: string,
  data: {
    senderId: string;
    senderName: string;
    senderAvatar: string;
    text: string;
    mediaUrl?: string;
    mediaType?: "image" | "gif";
    receiverId: string;
  }
): Promise<void> {
  await addDoc(collection(db, "messages"), {
    conversationId,
    senderId: data.senderId,
    senderName: data.senderName,
    senderAvatar: data.senderAvatar,
    text: data.text,
    ...(data.mediaUrl ? { mediaUrl: data.mediaUrl, mediaType: data.mediaType } : {}),
    createdAt: serverTimestamp(),
  });
  const lastMessagePreview = data.text
    ? data.text
    : data.mediaType === "image"
    ? "📷 Fotoğraf"
    : data.mediaType === "gif"
    ? "GIF"
    : "";
  await updateDoc(doc(db, "conversations", conversationId), {
    lastMessage: lastMessagePreview,
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
  const conversationId = [uid1, uid2].sort().join("_");
  const convRef = doc(db, "conversations", conversationId);
  try {
    await setDoc(convRef, {
      participants: [uid1, uid2],
      participantNames: names,
      participantAvatars: avatars,
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      unreadCount: { [uid1]: 0, [uid2]: 0 },
    });
  } catch {
    // Zaten var — ID doğru, devam et.
  }
  return conversationId;
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
  const ref = doc(db, "follows", id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    await updateDoc(doc(db, "users", followedId), { followerCount: increment(-1) });
    await updateDoc(doc(db, "users", followerId), { followingCount: increment(-1) });
  }
}
