import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";

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

export async function getStoriesByAuthor(authorId: string): Promise<Story[]> {
  const q = query(collection(db, "stories"), where("authorId", "==", authorId));
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

export async function updateStory(id: string, data: Partial<Story>) {
  await updateDoc(doc(db, "stories", id), { ...data, updatedAt: serverTimestamp() });
}

export async function likeStory(storyId: string, userId: string) {
  await updateDoc(doc(db, "stories", storyId), { likeCount: increment(1) });
  await addDoc(collection(db, "storyLikes"), { storyId, userId, createdAt: serverTimestamp() });
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

export async function getChaptersByStory(storyId: string): Promise<Chapter[]> {
  const q = query(collection(db, "chapters"), where("storyId", "==", storyId));
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

// ─── CONVERSATIONS & MESSAGES ─────────────────────────────────────────────────

export async function getOrCreateConversation(uid1: string, uid2: string, names: Record<string, string>, avatars: Record<string, string>): Promise<string> {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid1));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => d.data().participants.includes(uid2));
  if (existing) return existing.id;
  const ref = await addDoc(collection(db, "conversations"), {
    participants: [uid1, uid2],
    participantNames: names,
    participantAvatars: avatars,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    unreadCount: { [uid1]: 0, [uid2]: 0 },
  });
  return ref.id;
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
  await updateDoc(doc(db, "conversations", data.conversationId), {
    lastMessage: data.text || (data.mediaType === "image" ? "📷 Fotoğraf" : "GIF"),
    lastMessageAt: serverTimestamp(),
  });
  return ref.id;
}

export function listenMessages(conversationId: string, callback: (msgs: Message[]) => void) {
  const q = query(collection(db, "messages"), where("conversationId", "==", conversationId), limit(100));
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
  const q = query(
    collection(db, "stories"),
    where("status", "==", "published"),
    limit(40)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0))
    .slice(0, 20);
}

// ─── ANONYMOUS QUESTIONS ──────────────────────────────────────────────────────

export interface AnonymousQuestion {
  id: string;
  targetUid: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  createdAt: Timestamp;
  answeredAt?: Timestamp;
}

export async function sendAnonymousQuestion(targetUid: string, question: string): Promise<string> {
  const ref = await addDoc(collection(db, "anonymousQuestions"), {
    targetUid,
    question,
    isAnswered: false,
    createdAt: serverTimestamp(),
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

export const GENRES = [
  "Fantastik", "Romantik", "Gizem", "Korku", "Bilim Kurgu",
  "Macera", "Dram", "Psikolojik", "Tarihi", "Gençlik",
  "Gerilim", "Komedi", "Şiir", "Deneme"
];
