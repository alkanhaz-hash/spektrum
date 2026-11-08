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
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { hasStoryLike, setStoryLike } from "@workspace/story-reactions";

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
  contentLanguage?: "tr" | "en";
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
  isPaid?: boolean;
  price?: number;
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
  "Korku", "Gizem", "Macera", "Tarihî", "Dram", "Komedi", "Polisiye", "Spor",
];

// ─── Hikayeler ────────────────────────────────────────────────────────────────

export async function getPublishedStories(pageSize = 20, genre?: string, contentLanguage?: "tr" | "en" | "all"): Promise<Story[]> {
  const constraints: Parameters<typeof query>[1][] = contentLanguage === "en"
    ? [where("contentLanguage", "==", "en"), limit(pageSize * 10)]
    : [where("status", "==", "published"), limit(pageSize * 10)];
  if (genre && contentLanguage !== "en") constraints.splice(constraints.length - 1, 0, where("genre", "==", genre));
  const q = query(collection(db, "stories"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Story))
    .filter((s) => (s.status === "published" || s.status === "completed")
      && (s.chapterCount ?? 0) > 0
      && (contentLanguage === "en" || contentLanguage === "all" || (s.contentLanguage ?? "tr") === "tr")
      && (!genre || s.genre === genre))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
    .slice(0, pageSize);
}

/**
 * Zaman ağırlıklı trend skoru.
 * rawScore = readCount + likeCount×2 + commentCount×3
 * decayFactor = 1 / ((günSayısı + 2) ^ 0.8)  → yeni hikayeler avantajlı
 * finalScore = (rawScore + 1) × decayFactor
 */
export async function getTrendingStories(pageSize = 20): Promise<Story[]> {
  const q = query(
    collection(db, "stories"),
    where("status", "==", "published"),
    limit(200),
  );
  const snap = await getDocs(q);
  const nowSec = Date.now() / 1000;
  const score = (s: Story): number => {
    const raw = (s.readCount ?? 0) + (s.likeCount ?? 0) * 2 + (s.commentCount ?? 0) * 3;
    const ageDays = Math.max(0, (nowSec - (s.updatedAt?.seconds ?? nowSec)) / 86400);
    const decay = 1 / Math.pow(ageDays + 2, 0.8);
    return (raw + 1) * decay;
  };
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
  const snap = await getDocs(query(collection(db, "stories"), where("status", "in", ["published", "completed"]), limit(300)));
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
  contentLanguage?: "tr" | "en";
  tags: string[];
  authorId: string;
  authorName: string;
  authorAvatar: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "stories"), {
    ...data,
    contentLanguage: data.contentLanguage ?? "tr",
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

export async function updateStory(id: string, data: Partial<Pick<Story, "title" | "summary" | "genre" | "contentLanguage" | "tags" | "coverUrl" | "status">>): Promise<void> {
  await updateDoc(doc(db, "stories", id), { ...data, updatedAt: serverTimestamp() });
}

export async function incrementStoryRead(storyId: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), { readCount: increment(1) });
}

export async function likeStory(storyId: string, uid: string): Promise<boolean> {
  return setStoryLike(db, storyId, uid, true);
}

export async function unlikeStory(storyId: string, uid: string): Promise<boolean> {
  return setStoryLike(db, storyId, uid, false);
}

export async function hasUserLikedStory(storyId: string, userId: string): Promise<boolean> {
  return hasStoryLike(db, storyId, userId);
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
  isPaid?: boolean;
  price?: number;
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
  data: Partial<Pick<Chapter, "title" | "content" | "status" | "moderationCategories" | "rejectionReason" | "isPaid" | "price">>
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

export async function isMutuallyBlocked(uid1: string, uid2: string): Promise<boolean> {
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "blocks"), where("blockerId", "==", uid1), where("blockedId", "==", uid2), limit(1))),
    getDocs(query(collection(db, "blocks"), where("blockerId", "==", uid2), where("blockedId", "==", uid1), limit(1))),
  ]);
  return !snap1.empty || !snap2.empty;
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

export async function getFollowers(uid: string): Promise<import("./auth-service").UserProfile[]> {
  const { getUserProfile } = await import("./auth-service");
  const q = query(collection(db, "follows"), where("followedId", "==", uid));
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.data().followerId as string);
  const profiles = await Promise.all(ids.map((id) => getUserProfile(id)));
  return profiles.filter((p): p is import("./auth-service").UserProfile => p !== null);
}

export async function getFollowing(uid: string): Promise<import("./auth-service").UserProfile[]> {
  const { getUserProfile } = await import("./auth-service");
  const q = query(collection(db, "follows"), where("followerId", "==", uid));
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.data().followedId as string);
  const profiles = await Promise.all(ids.map((id) => getUserProfile(id)));
  return profiles.filter((p): p is import("./auth-service").UserProfile => p !== null);
}

// ─── Kullanıcı arama ──────────────────────────────────────────────────────────

export interface UserSearchResult {
  uid: string;
  displayName: string;
  avatarUrl: string;
  bio?: string;
  storyCount?: number;
  followerCount?: number;
}

export async function searchUsers(term: string): Promise<UserSearchResult[]> {
  const t = term.trim().toLocaleLowerCase("tr");
  if (!t) return [];
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: data.displayName ?? "",
        avatarUrl: data.avatarUrl ?? "",
        bio: data.bio ?? "",
        storyCount: data.storyCount ?? 0,
        followerCount: data.followerCount ?? 0,
      } as UserSearchResult;
    })
    .filter(
      (u) =>
        u.displayName.toLocaleLowerCase("tr").includes(t) ||
        (u.bio ?? "").toLocaleLowerCase("tr").includes(t)
    );
}

// ─── Bildirimler ──────────────────────────────────────────────────────────────

export interface SpektrumNotification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  type: "follow" | "like" | "comment" | "qa_answer" | "chapter_approved" | "chapter_rejected" | "moderator_directive";
  storyId?: string;
  storyTitle?: string;
  directiveMessage?: string;
  read: boolean;
  createdAt: Timestamp;
}

export function getNotifications(
  userId: string,
  callback: (notifs: SpektrumNotification[]) => void
): () => void {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SpektrumNotification)));
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
}

export async function markNotificationRead(notifId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notifId), { read: true });
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  return snap.size;
}

export function listenUnreadNotificationCount(
  userId: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    where("read", "==", false)
  );
  return onSnapshot(q, (snap) => callback(snap.size));
}

// ─── USER STATUS (24h) ────────────────────────────────────────────────────────

export interface UserStatus {
  id: string;
  uid: string;
  displayName: string;
  avatarUrl: string;
  type: "text" | "image";
  text?: string;
  backgroundColor?: string;
  mediaUrl?: string;
  viewedBy: string[];
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export async function createStatus(
  uid: string,
  data: {
    displayName: string;
    avatarUrl: string;
    type: "text" | "image";
    text?: string;
    backgroundColor?: string;
    mediaUrl?: string;
  }
): Promise<string> {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const ref = await addDoc(collection(db, "statuses"), {
    ...data,
    uid,
    viewedBy: [],
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return ref.id;
}

export async function getActiveStatuses(): Promise<UserStatus[]> {
  const now = Timestamp.now();
  const q = query(
    collection(db, "statuses"),
    where("expiresAt", ">", now),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as UserStatus))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function markStatusViewed(statusId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "statuses", statusId), { viewedBy: arrayUnion(uid) });
}

export async function deleteStatus(statusId: string): Promise<void> {
  await deleteDoc(doc(db, "statuses", statusId));
}

// ─── TALENT PORTFOLIOS ────────────────────────────────────────────────────────

export interface TalentPortfolio {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  storyId: string;
  title: string;
  coverDesigns: string[];
  style: string;
  bio: string;
  contactInfo: string;
  likeCount: number;
  createdAt: Timestamp;
}

export async function getTalentPortfoliosByStory(storyId: string): Promise<TalentPortfolio[]> {
  const q = query(collection(db, "talentPortfolios"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as TalentPortfolio))
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
}

// ─── REPORT ───────────────────────────────────────────────────────────────────

export async function reportContent(data: {
  reportedId: string;
  reportedType: "comment" | "story" | "chapter" | "user" | "inlineComment";
  reporterId: string;
  reason?: string;
}): Promise<void> {
  await addDoc(collection(db, "reports"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

// ─── INLINE COMMENTS ─────────────────────────────────────────────────────────

export interface InlineComment {
  id: string;
  storyId: string;
  chapterId: string;
  paragraphIndex: number;
  paragraphAnchor?: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  likeCount: number;
  likedBy: string[];
  createdAt: Timestamp;
}

export async function getInlineComments(chapterId: string): Promise<InlineComment[]> {
  const q = query(collection(db, "inlineComments"), where("chapterId", "==", chapterId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as InlineComment))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

export async function addInlineComment(data: Omit<InlineComment, "id" | "createdAt" | "likeCount" | "likedBy">): Promise<string> {
  const ref = await addDoc(collection(db, "inlineComments"), {
    ...data,
    likeCount: 0,
    likedBy: [],
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "stories", data.storyId), { commentCount: increment(1) });
  return ref.id;
}

export async function likeInlineComment(commentId: string, userId: string, liked: boolean): Promise<void> {
  await updateDoc(doc(db, "inlineComments", commentId), {
    likeCount: increment(liked ? 1 : -1),
    likedBy: liked ? arrayUnion(userId) : arrayRemove(userId),
  });
}

export async function createNotification(data: {
  recipientId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  type: SpektrumNotification["type"];
  storyId?: string;
  storyTitle?: string;
}): Promise<void> {
  if (data.recipientId === data.senderId) return;
  await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ─── KULLANICI ENGELLEME ──────────────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await setDoc(doc(db, "blocks", `${blockerId}_${blockedId}`), {
    blockerId,
    blockedId,
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await deleteDoc(doc(db, "blocks", `${blockerId}_${blockedId}`));
}

export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "blocks", `${blockerId}_${blockedId}`));
  return snap.exists();
}

export async function getBlockedUserIds(uid: string): Promise<string[]> {
  const q = query(collection(db, "blocks"), where("blockerId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().blockedId as string);
}

// ─── JETONLAR ─────────────────────────────────────────────────────────────────

export interface JetonTransaction {
  id: string;
  uid: string;
  type: "earn" | "spend" | "refund";
  amount: number;
  balanceAfter: number;
  reason: string;
  refId?: string;
  createdAt: Timestamp;
}

export async function getJetonBalance(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return 0;
  return (snap.data().jetonBalance as number) ?? 0;
}

export function subscribeJetonTransactions(
  uid: string,
  cb: (txs: JetonTransaction[]) => void
): () => void {
  const q = query(
    collection(db, "jetonTransactions"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as JetonTransaction)));
  });
}

// ─── MODERATİF İŞLEMLER ──────────────────────────────────────────────────────

export async function getPendingChapters(): Promise<(Chapter & { storyTitle?: string })[]> {
  const q = query(collection(db, "chapters"), where("status", "==", "pending_review"));
  const snap = await getDocs(q);
  const chapters = snap.docs.map(d => ({ id: d.id, ...d.data() } as Chapter));
  const enriched = await Promise.all(
    chapters.map(async ch => {
      try {
        const storySnap = await getDoc(doc(db, "stories", ch.storyId));
        const storyTitle = storySnap.exists() ? (storySnap.data().title as string) : undefined;
        return { ...ch, storyTitle };
      } catch {
        return ch;
      }
    })
  );
  return enriched.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return ta - tb;
  });
}

export async function updateChapterStatus(
  id: string,
  status: Chapter["status"],
  categories?: string[]
): Promise<void> {
  await updateDoc(doc(db, "chapters", id), {
    status,
    ...(categories ? { moderationCategories: categories } : {}),
    updatedAt: serverTimestamp(),
  });
}

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reportedType: "story" | "chapter" | "comment" | "user";
  reason?: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: Timestamp;
}

export async function getReports(
  status: "pending" | "resolved" | "dismissed" = "pending"
): Promise<Report[]> {
  const q = query(
    collection(db, "reports"),
    where("status", "==", status),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
}

export async function resolveReport(
  reportId: string,
  resolution: "resolved" | "dismissed"
): Promise<void> {
  await updateDoc(doc(db, "reports", reportId), { status: resolution });
}

export async function banUser(uid: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: true, banReason: reason });
}

export async function unbanUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: false, banReason: "" });
}

export interface UserSummary {
  uid: string;
  displayName: string;
  avatarUrl: string;
  role: "user" | "moderator" | "admin";
  banned?: boolean;
  banReason?: string;
}

export async function getAllUsersForMod(): Promise<UserSummary[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({
    uid: d.id,
    displayName: d.data().displayName || "İsimsiz kullanıcı",
    avatarUrl: d.data().avatarUrl ?? "",
    role: (d.data().role ?? "user") as UserSummary["role"],
  })).sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

export async function searchUsersForMod(term: string): Promise<UserSummary[]> {
  if (!term.trim()) return [];
  const lower = term.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: data.displayName ?? "",
        avatarUrl: data.avatarUrl ?? "",
        role: (data.role ?? "user") as UserSummary["role"],
        banned: data.banned ?? false,
        banReason: data.banReason ?? "",
      };
    })
    .filter(u => u.displayName.toLowerCase().includes(lower));
}

export async function setUserRole(
  uid: string,
  role: "user" | "moderator" | "admin"
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { role });
}

// ─── UYGULAMA İÇİ SATIN ALMA ─────────────────────────────────────────────────

export async function recordIapPurchase(params: {
  uid: string;
  packageId: string;
  productId: string;
  totalJeton: number;
  orderId: string;
}): Promise<void> {
  const { uid, packageId, productId, totalJeton, orderId } = params;
  const userRef = doc(db, "users", uid);
  const txRef = doc(collection(db, "jetonTransactions"));

  await runTransaction(db, async t => {
    const userSnap = await t.get(userRef);
    const current = (userSnap.data()?.jetonBalance as number) ?? 0;
    const newBalance = current + totalJeton;

    t.update(userRef, {
      jetonBalance: newBalance,
      updatedAt: serverTimestamp(),
    });

    t.set(txRef, {
      uid,
      type: "earn",
      amount: totalJeton,
      balanceAfter: newBalance,
      reason: `Jeton satın alındı: ${packageId} (${totalJeton} jeton)`,
      refId: orderId,
      productId,
      createdAt: serverTimestamp(),
    });
  });
}

// ─── BOOKMARKS ────────────────────────────────────────────────────────────────

export async function bookmarkStory(userId: string, storyId: string): Promise<void> {
  await setDoc(doc(db, "bookmarks", `${userId}_${storyId}`), { userId, storyId, createdAt: serverTimestamp() });
}

export async function unbookmarkStory(userId: string, storyId: string): Promise<void> {
  await deleteDoc(doc(db, "bookmarks", `${userId}_${storyId}`));
}

export async function isStoryBookmarked(userId: string, storyId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "bookmarks", `${userId}_${storyId}`));
  return snap.exists();
}

export async function getBookmarkedStories(userId: string): Promise<Story[]> {
  const q = query(collection(db, "bookmarks"), where("userId", "==", userId));
  const snap = await getDocs(q);
  const storyIds = snap.docs.map(d => d.data().storyId as string);
  if (!storyIds.length) return [];
  const stories = await Promise.all(
    storyIds.map(id =>
      getDoc(doc(db, "stories", id)).then(s => s.exists() ? { id: s.id, ...s.data() } as Story : null)
    )
  );
  return stories.filter((s): s is Story => s !== null);
}

// ─── MODERATÖr YARDIMCI FONKSİYONLARI ────────────────────────────────────────

export async function getUserById(uid: string): Promise<UserSummary | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid: snap.id,
    displayName: d.displayName ?? "",
    avatarUrl: d.avatarUrl ?? "",
    role: (d.role ?? "user") as UserSummary["role"],
    banned: d.banned ?? false,
    banReason: d.banReason ?? "",
    bio: d.bio ?? "",
  } as UserSummary & { bio: string };
}

export async function getInlineCommentById(id: string): Promise<InlineComment | null> {
  const snap = await getDoc(doc(db, "inlineComments", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as InlineComment;
}

export async function deleteInlineComment(id: string): Promise<void> {
  await deleteDoc(doc(db, "inlineComments", id));
}

export async function unpublishStory(storyId: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), { status: "draft" });
}

export async function unpublishChapter(chapterId: string): Promise<void> {
  await updateDoc(doc(db, "chapters", chapterId), { status: "rejected" });
}

export async function sendModeratorDirective(params: {
  modUid: string;
  modName: string;
  modAvatar: string;
  recipientId: string;
  storyId?: string;
  storyTitle?: string;
  message: string;
}): Promise<void> {
  await addDoc(collection(db, "notifications"), {
    recipientId: params.recipientId,
    senderId: params.modUid,
    senderName: params.modName,
    senderAvatar: params.modAvatar,
    type: "moderator_directive",
    storyId: params.storyId ?? null,
    storyTitle: params.storyTitle ?? null,
    directiveMessage: params.message,
    read: false,
    createdAt: serverTimestamp(),
  });
}
