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
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { UserProfile } from "./auth-service";

// ─── TYPES ───────────────────────────────────────────────────────────────────

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

export interface InlineComment {
  id: string;
  storyId: string;
  chapterId: string;
  paragraphIndex: number;
  /** Paragrafın ilk 60 karakteri — yazar içeriği düzenlese bile yorum doğru paragrafa bağlı kalır. */
  paragraphAnchor?: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  likeCount: number;
  likedBy: string[];
  createdAt: Timestamp;
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

export interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantAvatars: Record<string, string>;
  lastMessage: string;
  lastMessageAt: Timestamp;
  unreadCount: Record<string, number>;
}

export interface UserStatus {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  caption?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  viewedBy: string[];
}

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

// ─── STORIES ─────────────────────────────────────────────────────────────────

export async function createStory(data: Omit<Story, "id" | "createdAt" | "updatedAt" | "readCount" | "likeCount" | "commentCount" | "chapterCount">) {
  const ref = await addDoc(collection(db, "stories"), {
    ...data,
    readCount: 0,
    likeCount: 0,
    commentCount: 0,
    chapterCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getStory(id: string): Promise<Story | null> {
  const snap = await getDoc(doc(db, "stories", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Story;
}

export async function getStoriesByAuthor(authorId: string, publishedOnly = false): Promise<Story[]> {
  // BUG FIX: publishedOnly=true olunca yalnızca yayınlanmış hikayeler döndürülür.
  // Sahip kendi profilini görüntülerken tüm statüler, yabancı görüntülerken sadece published gelir.
  const constraints = [where("authorId", "==", authorId)];
  if (publishedOnly) constraints.push(where("status", "==", "published"));
  const q = query(collection(db, "stories"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function getPublishedStories(pageSize = 20): Promise<Story[]> {
  const q = query(collection(db, "stories"), where("status", "==", "published"), limit(pageSize * 2));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
    .slice(0, pageSize);
}

// Yayınlanmış hikayelerde başlık/yazar/özet/etiket araması (istemci taraflı filtre).
export async function searchStories(term: string): Promise<Story[]> {
  const t = term.trim().toLocaleLowerCase("tr");
  if (!t) return [];
  const q = query(collection(db, "stories"), where("status", "==", "published"), limit(300));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .filter(s =>
      s.title.toLocaleLowerCase("tr").includes(t) ||
      s.authorName.toLocaleLowerCase("tr").includes(t) ||
      (s.summary ?? "").toLocaleLowerCase("tr").includes(t) ||
      (s.tags ?? []).some(tag => tag.toLocaleLowerCase("tr").includes(t))
    )
    .sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0));
}

// Kullanıcı adı / görünen ad araması
export async function searchUsers(term: string): Promise<UserProfile[]> {
  const t = term.trim().toLocaleLowerCase("tr");
  if (!t) return [];
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  return snap.docs
    .map(d => d.data() as UserProfile)
    .filter(u =>
      u.displayName?.toLocaleLowerCase("tr").includes(t) ||
      (u.bio ?? "").toLocaleLowerCase("tr").includes(t)
    );
}

export async function updateStory(id: string, data: Partial<Story>) {
  await updateDoc(doc(db, "stories", id), { ...data, updatedAt: serverTimestamp() });
}

export async function likeStory(storyId: string, userId: string) {
  // BUG FIX: Dedup kontrolü — aynı kullanıcı birden fazla beğeni ekleyemesin
  const existingQ = query(
    collection(db, "storyLikes"),
    where("storyId", "==", storyId),
    where("userId", "==", userId)
  );
  const existing = await getDocs(existingQ);
  if (!existing.empty) return;
  await updateDoc(doc(db, "stories", storyId), { likeCount: increment(1) });
  await addDoc(collection(db, "storyLikes"), { storyId, userId, createdAt: serverTimestamp() });
}

export async function unlikeStory(storyId: string, userId: string) {
  const existingQ = query(
    collection(db, "storyLikes"),
    where("storyId", "==", storyId),
    where("userId", "==", userId)
  );
  const existing = await getDocs(existingQ);
  if (existing.empty) return;
  await deleteDoc(existing.docs[0].ref);
  await updateDoc(doc(db, "stories", storyId), { likeCount: increment(-1) });
}

export async function hasUserLikedStory(storyId: string, userId: string): Promise<boolean> {
  const q = query(
    collection(db, "storyLikes"),
    where("storyId", "==", storyId),
    where("userId", "==", userId)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ─── CHAPTERS ────────────────────────────────────────────────────────────────

export async function createChapter(data: Omit<Chapter, "id" | "createdAt" | "updatedAt" | "readCount">) {
  const ref = await addDoc(collection(db, "chapters"), {
    ...data,
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

export async function getChaptersByStory(storyId: string, publishedOnly = false): Promise<Chapter[]> {
  const constraints = [where("storyId", "==", storyId)];
  if (publishedOnly) constraints.push(where("status", "==", "published"));
  const q = query(collection(db, "chapters"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Chapter))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getChapter(id: string): Promise<Chapter | null> {
  const snap = await getDoc(doc(db, "chapters", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Chapter;
}

export async function updateChapterStatus(id: string, status: Chapter["status"], categories?: string[]) {
  await updateDoc(doc(db, "chapters", id), {
    status,
    ...(categories ? { moderationCategories: categories } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function updateChapter(id: string, data: { title: string; content: string; status: Chapter["status"]; wordCount?: number; moderationCategories?: string[] }) {
  await updateDoc(doc(db, "chapters", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getPendingChapters(): Promise<(Chapter & { storyTitle?: string })[]> {
  const q = query(collection(db, "chapters"), where("status", "==", "pending_review"));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Chapter))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

// ─── INLINE COMMENTS ─────────────────────────────────────────────────────────

export async function addInlineComment(data: Omit<InlineComment, "id" | "createdAt" | "likeCount" | "likedBy">) {
  const ref = await addDoc(collection(db, "inlineComments"), {
    ...data,
    likeCount: 0,
    likedBy: [],
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "stories", data.storyId), { commentCount: increment(1) });
  return ref.id;
}

export async function getInlineComments(chapterId: string): Promise<InlineComment[]> {
  const q = query(collection(db, "inlineComments"), where("chapterId", "==", chapterId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as InlineComment))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

export async function likeInlineComment(commentId: string, userId: string, liked: boolean) {
  await updateDoc(doc(db, "inlineComments", commentId), {
    likeCount: increment(liked ? 1 : -1),
    likedBy: liked ? arrayUnion(userId) : arrayRemove(userId),
  });
}

export async function reportContent(data: {
  reportedId: string;
  reportedType: "comment" | "story" | "chapter" | "user";
  reporterId: string;
  reason?: string;
}): Promise<void> {
  await addDoc(collection(db, "reports"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

// ─── CONVERSATIONS & MESSAGES ─────────────────────────────────────────────────

export async function getOrCreateConversation(uid1: string, uid2: string, names: Record<string, string>, avatars: Record<string, string>): Promise<string> {
  const conversationId = [uid1, uid2].sort().join("_");
  const convRef = doc(db, "conversations", conversationId);
  // BUG FIX: getDoc → resource==null olduğunda Firestore kuralı reddediyordu.
  // Önce setDoc ile oluşturmayı dene:
  //   - Belge yoksa: create kuralı geçer, yeni konuşma açılır.
  //   - Belge varsa: update kuralı participants değişikliğini reddeder (hata fırlatır),
  //     catch bloğuna düşeriz — ID zaten doğru, konuşma mevcuttur.
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
    // Konuşma zaten var — ID doğru, devam et.
  }
  return conversationId;
}

export function getConversations(uid: string, callback: (convs: Conversation[]) => void) {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  return onSnapshot(q, snap => {
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Conversation))
      .sort((a, b) => ((b.lastMessageAt as any)?.seconds ?? 0) - ((a.lastMessageAt as any)?.seconds ?? 0));
    callback(sorted);
  });
}

export async function sendMessage(data: Omit<Message, "id" | "createdAt">) {
  const ref = await addDoc(collection(db, "messages"), { ...data, createdAt: serverTimestamp() });
  // BUG FIX: Karşı tarafın okunmamış sayacını artır
  const convSnap = await getDoc(doc(db, "conversations", data.conversationId));
  const participants = (convSnap.data()?.participants ?? []) as string[];
  const otherId = participants.find(p => p !== data.senderId);
  const lastMessagePreview = data.text
    ? data.text
    : data.mediaType === "image"
    ? "📷 Fotoğraf"
    : data.mediaType === "gif"
    ? "GIF"
    : "";
  const convUpdate: Record<string, unknown> = {
    lastMessage: lastMessagePreview,
    lastMessageAt: serverTimestamp(),
  };
  if (otherId) convUpdate[`unreadCount.${otherId}`] = increment(1);
  await updateDoc(doc(db, "conversations", data.conversationId), convUpdate);
  return ref.id;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, "conversations", conversationId), {
    [`unreadCount.${userId}`]: 0,
  });
}

export function listenMessages(conversationId: string, callback: (msgs: Message[]) => void) {
  const q = query(collection(db, "messages"), where("conversationId", "==", conversationId), limit(200));
  return onSnapshot(q, snap => {
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Message))
      .sort((a, b) => ((a.createdAt as any)?.seconds ?? 0) - ((b.createdAt as any)?.seconds ?? 0));
    callback(sorted);
  });
}

// ─── TALENT PORTFOLIOS ────────────────────────────────────────────────────────

export async function createTalentPortfolio(data: Omit<TalentPortfolio, "id" | "createdAt" | "likeCount">) {
  const ref = await addDoc(collection(db, "talentPortfolios"), { ...data, likeCount: 0, createdAt: serverTimestamp() });
  return ref.id;
}

export async function getTalentPortfoliosByStory(storyId: string): Promise<TalentPortfolio[]> {
  const q = query(collection(db, "talentPortfolios"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as TalentPortfolio))
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
}

// ─── DISCOVER FEED ────────────────────────────────────────────────────────────

export async function getDiscoverFeed(): Promise<Story[]> {
  const q = query(collection(db, "stories"), where("status", "==", "published"), limit(60));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export interface TrendingStory {
  storyId: string;
  title: string;
  authorName: string;
  genre: string;
  coverUrl: string | null;
  readCount: number;
  commentCount: number;
  likeCount: number;
  engagementScore: number;
}

export async function getTrendingStories(limitCount = 10): Promise<TrendingStory[]> {
  const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const q = query(
    collection(db, "stories"),
    where("status", "==", "published"),
    where("publishedAt", ">=", since),
    limit(50),
  );
  const snap = await getDocs(q);
  const stories = snap.docs.map(d => ({ id: d.id, ...d.data() } as Story));

  if (stories.length === 0) {
    const fallback = query(
      collection(db, "stories"),
      where("status", "==", "published"),
      orderBy("likeCount", "desc"),
      limit(limitCount),
    );
    const fSnap = await getDocs(fallback);
    return fSnap.docs.map(d => {
      const s = { id: d.id, ...d.data() } as Story;
      const score = (s.likeCount ?? 0) * 3 + (s.commentCount ?? 0) * 2 + (s.readCount ?? 0) * 0.1;
      return { storyId: s.id, title: s.title, authorName: s.authorName, genre: s.genre, coverUrl: s.coverUrl ?? null, readCount: s.readCount ?? 0, commentCount: s.commentCount ?? 0, likeCount: s.likeCount ?? 0, engagementScore: Math.round(score * 10) / 10 };
    });
  }

  return stories
    .map(s => {
      const score = (s.likeCount ?? 0) * 3 + (s.commentCount ?? 0) * 2 + (s.readCount ?? 0) * 0.1;
      return { storyId: s.id, title: s.title, authorName: s.authorName, genre: s.genre, coverUrl: s.coverUrl ?? null, readCount: s.readCount ?? 0, commentCount: s.commentCount ?? 0, likeCount: s.likeCount ?? 0, engagementScore: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limitCount);
}

// ─── NARRATIONS ───────────────────────────────────────────────────────────────

export interface NarrationRequest {
  id: string;
  storyId: string;
  storyTitle: string;
  narratorId: string;
  narratorName: string;
  narratorAvatar: string;
  authorId: string;
  status: "pending" | "approved" | "rejected";
  conversationId?: string;
  createdAt: Timestamp;
}

export interface Narration {
  id: string;
  storyId: string;
  storyTitle: string;
  storyCoverUrl: string;
  narratorId: string;
  narratorName: string;
  narratorAvatar: string;
  authorId: string;
  authorName: string;
  audioUrl: string;
  durationSeconds: number;
  createdAt: Timestamp;
}

export async function createNarrationRequest(data: Omit<NarrationRequest, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "narrationRequests"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getNarrationRequest(storyId: string, narratorId: string): Promise<NarrationRequest | null> {
  const q = query(
    collection(db, "narrationRequests"),
    where("storyId", "==", storyId),
    where("narratorId", "==", narratorId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as NarrationRequest;
}

export async function updateNarrationRequest(id: string, status: "approved" | "rejected"): Promise<void> {
  await updateDoc(doc(db, "narrationRequests", id), { status });
}

export async function getNarrationsByStory(storyId: string): Promise<Narration[]> {
  const q = query(collection(db, "narrations"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Narration))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getNarrationsByNarrator(narratorId: string): Promise<Narration[]> {
  const q = query(collection(db, "narrations"), where("narratorId", "==", narratorId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Narration))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function uploadNarration(data: Omit<Narration, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "narrations"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteNarration(id: string): Promise<void> {
  await deleteDoc(doc(db, "narrations", id));
}

// ─── ANONYMOUS QUESTIONS ──────────────────────────────────────────────────────

export interface AnonymousQuestion {
  id: string;
  targetUid: string;
  senderUid?: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  createdAt: Timestamp;
  answeredAt?: Timestamp;
}

export async function sendAnonymousQuestion(targetUid: string, question: string, senderUid?: string): Promise<string> {
  const ref = await addDoc(collection(db, "anonymousQuestions"), {
    targetUid,
    question,
    isAnswered: false,
    createdAt: serverTimestamp(),
    ...(senderUid ? { senderUid } : {}),
  });
  return ref.id;
}

export async function getAnsweredQuestions(targetUid: string): Promise<AnonymousQuestion[]> {
  const q = query(collection(db, "anonymousQuestions"), where("targetUid", "==", targetUid), where("isAnswered", "==", true));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AnonymousQuestion))
    .sort((a, b) => (b.answeredAt?.seconds ?? 0) - (a.answeredAt?.seconds ?? 0));
}

export async function getUnansweredQuestions(targetUid: string): Promise<AnonymousQuestion[]> {
  const q = query(collection(db, "anonymousQuestions"), where("targetUid", "==", targetUid), where("isAnswered", "==", false));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AnonymousQuestion))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

export function listenAnsweredQuestions(
  targetUid: string,
  cb: (questions: AnonymousQuestion[]) => void,
): () => void {
  const q = query(collection(db, "anonymousQuestions"), where("targetUid", "==", targetUid), where("isAnswered", "==", true));
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AnonymousQuestion))
      .sort((a, b) => (b.answeredAt?.seconds ?? 0) - (a.answeredAt?.seconds ?? 0));
    cb(list);
  });
}

export function listenUnansweredQuestions(
  targetUid: string,
  cb: (questions: AnonymousQuestion[]) => void,
): () => void {
  const q = query(collection(db, "anonymousQuestions"), where("targetUid", "==", targetUid), where("isAnswered", "==", false));
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AnonymousQuestion))
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    cb(list);
  });
}

export async function answerQuestion(questionId: string, answer: string): Promise<void> {
  await updateDoc(doc(db, "anonymousQuestions", questionId), {
    answer,
    isAnswered: true,
    answeredAt: serverTimestamp(),
  });
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await deleteDoc(doc(db, "anonymousQuestions", questionId));
}

// ─── USER PROFILE UPDATE ──────────────────────────────────────────────────────

export async function incrementUserReadCount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { readCount: increment(1) });
}

export async function incrementChapterReadCount(chapterId: string): Promise<void> {
  await updateDoc(doc(db, "chapters", chapterId), { readCount: increment(1) });
}

export const GENRES = [
  "Fantastik", "Romantik", "Gizem", "Korku", "Bilim Kurgu",
  "Macera", "Dram", "Psikolojik", "Tarihi", "Gençlik",
  "Gerilim", "Komedi", "Şiir", "Deneme"
];

// ─── ADMIN: KULLANICI YÖNETİMİ ────────────────────────────────────────────────

export interface UserSummary {
  uid: string;
  displayName: string;
  avatarUrl: string;
  role: "user" | "moderator" | "admin";
}

export async function searchUsersByName(term: string): Promise<UserSummary[]> {
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  const lower = term.trim().toLowerCase();
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: data.displayName ?? "",
        avatarUrl: data.avatarUrl ?? "",
        role: (data.role ?? "user") as UserSummary["role"],
      };
    })
    .filter(u => u.displayName.toLowerCase().includes(lower) || u.uid.toLowerCase().includes(lower));
}

export async function setUserRole(uid: string, role: "user" | "moderator" | "admin"): Promise<void> {
  await updateDoc(doc(db, "users", uid), { role });
}

// ─── TAKİP SİSTEMİ ────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followedId: string): Promise<void> {
  await setDoc(doc(db, "follows", `${followerId}_${followedId}`), {
    followerId,
    followedId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", followedId), { followerCount: increment(1) });
  await updateDoc(doc(db, "users", followerId), { followingCount: increment(1) });
}

export async function unfollowUser(followerId: string, followedId: string): Promise<void> {
  await deleteDoc(doc(db, "follows", `${followerId}_${followedId}`));
  await updateDoc(doc(db, "users", followedId), { followerCount: increment(-1) });
  await updateDoc(doc(db, "users", followerId), { followingCount: increment(-1) });
}

export async function isFollowingUser(followerId: string, followedId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "follows", `${followerId}_${followedId}`));
  return snap.exists();
}

export async function getFollowers(uid: string): Promise<UserProfile[]> {
  const q = query(collection(db, "follows"), where("followedId", "==", uid));
  const snap = await getDocs(q);
  const ids = snap.docs.map(d => d.data().followerId as string);
  if (ids.length === 0) return [];
  const profiles = await Promise.all(ids.map(id => getDoc(doc(db, "users", id))));
  return profiles.filter(s => s.exists()).map(s => s.data() as UserProfile);
}

export async function getFollowing(uid: string): Promise<UserProfile[]> {
  const q = query(collection(db, "follows"), where("followerId", "==", uid));
  const snap = await getDocs(q);
  const ids = snap.docs.map(d => d.data().followedId as string);
  if (ids.length === 0) return [];
  const profiles = await Promise.all(ids.map(id => getDoc(doc(db, "users", id))));
  return profiles.filter(s => s.exists()).map(s => s.data() as UserProfile);
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export interface SpektrumNotification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  type: "follow" | "like" | "comment" | "qa_answer" | "chapter_approved" | "chapter_rejected";
  storyId?: string;
  storyTitle?: string;
  questionId?: string;
  read: boolean;
  createdAt: Timestamp;
}

export async function createNotification(data: Omit<SpektrumNotification, "id" | "createdAt" | "read">): Promise<void> {
  if (data.recipientId === data.senderId) return;
  await addDoc(collection(db, "notifications"), { ...data, read: false, createdAt: serverTimestamp() });
}

export function getNotifications(userId: string, callback: (notifs: SpektrumNotification[]) => void): () => void {
  const q = query(collection(db, "notifications"), where("recipientId", "==", userId), limit(50));
  return onSnapshot(q, snap => {
    const notifs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as SpektrumNotification))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    callback(notifs);
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(collection(db, "notifications"), where("recipientId", "==", userId), where("read", "==", false));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
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
  if (storyIds.length === 0) return [];
  const storySnaps = await Promise.all(storyIds.map(id => getDoc(doc(db, "stories", id))));
  return storySnaps
    .filter(s => s.exists())
    .map(s => ({ id: s.id, ...s.data() } as Story))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

// ─── STATUS (24h) ─────────────────────────────────────────────────────────────

export async function createUserStatus(data: {
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  caption?: string;
}): Promise<string> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
  const ref = await addDoc(collection(db, "statuses"), {
    ...data,
    createdAt: serverTimestamp(),
    expiresAt,
    viewedBy: [],
  });
  return ref.id;
}

export async function getActiveStatuses(): Promise<UserStatus[]> {
  const q = query(
    collection(db, "statuses"),
    where("expiresAt", ">", Timestamp.now()),
    orderBy("expiresAt", "asc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserStatus));
}

export async function markStatusViewed(statusId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, "statuses", statusId), { viewedBy: arrayUnion(userId) });
}

export async function deleteUserStatus(statusId: string): Promise<void> {
  await deleteDoc(doc(db, "statuses", statusId));
}

// ─── BAN ──────────────────────────────────────────────────────────────────────

export async function banUser(uid: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: true, banReason: reason });
}

export async function unbanUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: false, banReason: "" });
}

export async function searchUsersForMod(term: string): Promise<UserProfile[]> {
  if (!term.trim()) return [];
  const lower = term.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
    .filter(u => (u.displayName ?? "").toLowerCase().includes(lower));
}
