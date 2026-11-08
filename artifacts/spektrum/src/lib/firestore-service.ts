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
  getCountFromServer,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { getImportFingerprint, importSourceId, validateImportPreview, type BookImportPreview } from "./book-import";
import { saveImportedBook } from "./book-import-service";
import { hasStoryLike, setStoryLike } from "@workspace/story-reactions";
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
  contentLanguage?: "tr" | "en";
  tags: string[];
  chapterCount: number;
  readCount: number;
  likeCount: number;
  commentCount: number;
  status: "published" | "draft" | "completed";
  importState?: "prepared" | "pending" | "complete";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  importChapterCount?: number;
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
  isPaid?: boolean;
  price?: number;
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

// ─── USER STATUS (24h) ───────────────────────────────────────────────────────

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
    .map(d => ({ id: d.id, ...d.data() } as UserStatus))
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

// ─── STORIES ─────────────────────────────────────────────────────────────────

export async function createStory(data: Omit<Story, "id" | "createdAt" | "updatedAt" | "readCount" | "likeCount" | "commentCount" | "chapterCount">) {
  const ref = await addDoc(collection(db, "stories"), {
    ...data,
    contentLanguage: data.contentLanguage ?? "tr",
    readCount: 0,
    likeCount: 0,
    commentCount: 0,
    chapterCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Yazar belgesindeki hikaye sayacını artır
  await updateDoc(doc(db, "users", data.authorId), { storyCount: increment(1) });
  return ref.id;
}

/**
 * Two atomic phases avoid requiring a rules change: chapter-create rules read
 * the pre-existing parent story. A prepared shell has zero chapters; the second
 * transaction writes ALL chapters, both counters and completion together.
 * Source-derived IDs survive reloads, lost acknowledgements and concurrent tabs.
 * A completed import is never overwritten, including later edits/publication.
 */
export async function importBookDraft(input: {
  sourceText: string;
  preview: BookImportPreview;
  ownershipConfirmed: boolean;
}): Promise<{ storyId: string; alreadyImported: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Kitap aktarmak için giriş yap.");
  if (!input.ownershipConfirmed) throw new Error("Metnin telif hakkına sahip olduğunu açıkça onaylamalısın.");
  // Snapshot all inputs before the first await.
  const preview: BookImportPreview = {
    ...input.preview,
    title: input.preview.title.trim(),
    summary: input.preview.summary.trim(),
    chapters: input.preview.chapters.map(ch => ({ title: ch.title.trim(), content: ch.content.trim() })),
  };
  validateImportPreview(preview);
  if (!GENRES.includes(preview.genre)) throw new Error("Geçerli bir hikaye türü seç.");
  const storyId = await importSourceId(user.uid, input.sourceText);
  const legacyFingerprint = await getImportFingerprint(user.uid, preview);
  const legacyId = `import_${legacyFingerprint}`;
  const storyRef = doc(db, "stories", storyId);
  const userRef = doc(db, "users", user.uid);
  const checkSession = () => {
    if (auth.currentUser?.uid !== user.uid) throw new Error("Oturum değişti. Yeniden giriş yap ve aktarımı tekrar dene.");
  };
  const checkProfile = (data: Record<string, unknown> | undefined) => {
    if (!data || data.banned || data.accountDeletionPending || data.accountFrozen) {
      throw new Error("Hesabın kitap aktarımına uygun değil. Hesap durumunu kontrol et.");
    }
  };
  const prepared = await runTransaction(db, async transaction => {
    checkSession();
    const existing = await transaction.get(storyRef);
    const legacy = await transaction.get(doc(db, "stories", legacyId));
    const profile = await transaction.get(userRef);
    checkProfile(profile.data());
    if (existing.exists()) {
      if (existing.data().authorId !== user.uid || !existing.data().importState) {
        throw new Error("Aktarım kimliği mevcut bir kayıtla çakışıyor.");
      }
      return existing.data().importState === "complete";
    }
    if (legacy.exists() && legacy.data().authorId === user.uid && legacy.data().importFingerprint === legacyFingerprint) {
      return legacy.data().importState === "complete" ? "legacy-complete" : "legacy-pending";
    }
    const author = profile.data()!;
    transaction.set(storyRef, {
      authorId: user.uid,
      authorName: author.displayName ?? "",
      authorAvatar: author.avatarUrl ?? "",
      title: preview.title,
      summary: preview.summary,
      genre: preview.genre,
      contentLanguage: "tr",
      coverUrl: "",
      tags: [],
      status: "draft",
      chapterCount: 0,
      readCount: 0,
      likeCount: 0,
      commentCount: 0,
      importState: "prepared",
      ownershipConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return false;
  });
  if (prepared === "legacy-complete") return { storyId: legacyId, alreadyImported: true };
  if (prepared === "legacy-pending") {
    const id = await saveImportedBook({ preview, source: "paste", ownershipConfirmed: true });
    return { storyId: id, alreadyImported: false };
  }
  if (prepared) return { storyId, alreadyImported: true };
  const alreadyImported = await runTransaction(db, async transaction => {
    checkSession();
    const existing = await transaction.get(storyRef);
    const profile = await transaction.get(userRef);
    checkProfile(profile.data());
    if (!existing.exists() || existing.data().authorId !== user.uid) throw new Error("Aktarım taslağı bulunamadı. Aynı metinle yeniden dene.");
    if (existing.data().importState === "complete") return true;
    // Do not overwrite a prepared shell someone has started editing normally.
    if (existing.data().importState !== "prepared" || existing.data().chapterCount !== 0 || existing.data().status !== "draft") {
      throw new Error("Bu taslak değiştirilmiş. Mevcut hikayeyi editörde kontrol et.");
    }
    preview.chapters.forEach((chapter, index) => {
      transaction.set(doc(db, "chapters", `${storyId}_${index + 1}`), {
        storyId,
        title: chapter.title,
        content: chapter.content,
        order: index + 1,
        wordCount: chapter.content.split(/\s+/u).filter(Boolean).length,
        readCount: 0,
        status: "draft",
        isPaid: false,
        price: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    transaction.update(storyRef, {
      title: preview.title,
      summary: preview.summary,
      genre: preview.genre,
      chapterCount: preview.chapters.length,
      importState: "complete",
      updatedAt: serverTimestamp(),
    });
    transaction.update(userRef, { storyCount: increment(1) });
    return false;
  });
  return { storyId, alreadyImported };
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
  const q = query(collection(db, "stories"), where("status", "in", ["published", "completed"]), limit(500));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .filter(s =>
      (s.chapterCount ?? 0) > 0 &&
      (s.title.toLocaleLowerCase("tr").includes(t) ||
       s.authorName.toLocaleLowerCase("tr").includes(t) ||
       (s.summary ?? "").toLocaleLowerCase("tr").includes(t) ||
       (s.tags ?? []).some(tag => tag.toLocaleLowerCase("tr").includes(t)))
    )
    .sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0));
}

// Kullanıcı adı / görünen ad araması
export async function searchUsers(term: string): Promise<UserProfile[]> {
  const t = term.trim().toLocaleLowerCase("tr");
  if (!t) return [];
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  const filtered = snap.docs
    .map(d => d.data() as UserProfile)
    .filter(u =>
      u.displayName?.toLocaleLowerCase("tr").includes(t) ||
      (u.bio ?? "").toLocaleLowerCase("tr").includes(t)
    );
  // Gerçek yayınlanmış hikaye ve takipçi sayılarını al
  const enriched = await Promise.all(
    filtered.map(async u => {
      const [storySnap, followerSnap] = await Promise.all([
        getCountFromServer(query(collection(db, "stories"), where("authorId", "==", u.uid), where("status", "==", "published"))),
        getCountFromServer(query(collection(db, "follows"), where("followedId", "==", u.uid))),
      ]);
      return { ...u, storyCount: storySnap.data().count, followerCount: followerSnap.data().count };
    })
  );
  return enriched;
}

export async function updateStory(id: string, data: Partial<Story>) {
  await updateDoc(doc(db, "stories", id), { ...data, updatedAt: serverTimestamp() });
}

// Shared atomic reaction service supports both historic web records and mobile arrays.
export async function hasUserLikedStory(storyId: string, userId: string): Promise<boolean> {
  return hasStoryLike(db, storyId, userId);
}

export async function likeStory(storyId: string, userId: string): Promise<boolean> {
  return setStoryLike(db, storyId, userId, true);
}

export async function unlikeStory(storyId: string, userId: string): Promise<boolean> {
  return setStoryLike(db, storyId, userId, false);
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
  // publishedOnly=true → Firestore sorgusuna status filtresi ekliyoruz.
  // Bu olmadan Firestore güvenlik kuralı tüm sorguyu reddeder çünkü
  // kural "status=='published'" olan belgeler için okumaya izin veriyor;
  // status filtresi olmayan sorgu taslakları da döndürebileceğinden reddedilir.
  const constraints = publishedOnly
    ? [where("storyId", "==", storyId), where("status", "==", "published")]
    : [where("storyId", "==", storyId)];
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

export async function updateChapter(id: string, data: { title: string; content: string; status: Chapter["status"]; wordCount?: number; moderationCategories?: string[]; isPaid?: boolean; price?: number }) {
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

export interface Report {
  id: string;
  reportedId: string;
  reportedType: "comment" | "story" | "chapter" | "user";
  reporterId: string;
  /** chapter/comment raporlarında üst hikayenin ID'si */
  contextId?: string;
  reason?: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: Timestamp | null;
}

export async function reportContent(data: {
  reportedId: string;
  reportedType: "comment" | "story" | "chapter" | "user";
  reporterId: string;
  /** chapter/comment için storyId, story/user için undefined */
  contextId?: string;
  reason?: string;
}): Promise<void> {
  await addDoc(collection(db, "reports"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function getReports(status: "pending" | "resolved" | "dismissed" = "pending"): Promise<Report[]> {
  const q = query(
    collection(db, "reports"),
    where("status", "==", status),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }));
}

export async function resolveReport(reportId: string, resolution: "resolved" | "dismissed"): Promise<void> {
  await updateDoc(doc(db, "reports", reportId), { status: resolution });
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

export async function getDiscoverFeed(contentLanguage?: "tr" | "en" | "all"): Promise<Story[]> {
  const q = contentLanguage === "en"
    ? query(collection(db, "stories"), where("contentLanguage", "==", "en"), limit(300))
    : query(collection(db, "stories"), limit(300));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Story))
    .filter(s => (s.status === "published" || s.status === "completed")
      && (s.chapterCount ?? 0) > 0
      && (contentLanguage === "en" || contentLanguage === "all" || (s.contentLanguage ?? "tr") === "tr"))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export interface TrendingStory {
  storyId: string;
  title: string;
  authorName: string;
  genre: string;
  contentLanguage?: "tr" | "en";
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
      return { storyId: s.id, title: s.title, authorName: s.authorName, genre: s.genre, contentLanguage: s.contentLanguage ?? "tr", coverUrl: s.coverUrl ?? null, readCount: s.readCount ?? 0, commentCount: s.commentCount ?? 0, likeCount: s.likeCount ?? 0, engagementScore: Math.round(score * 10) / 10 };
    });
  }

  return stories
    .map(s => {
      const score = (s.likeCount ?? 0) * 3 + (s.commentCount ?? 0) * 2 + (s.readCount ?? 0) * 0.1;
      return { storyId: s.id, title: s.title, authorName: s.authorName, genre: s.genre, contentLanguage: s.contentLanguage ?? "tr", coverUrl: s.coverUrl ?? null, readCount: s.readCount ?? 0, commentCount: s.commentCount ?? 0, likeCount: s.likeCount ?? 0, engagementScore: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limitCount);
}

// ─── ANONYMOUS QUESTIONS ──────────────────────────────────────────────────────

export {
  sendAnonymousQuestion, getAnsweredQuestions, getUnansweredQuestions,
  listenAnsweredQuestions, listenUnansweredQuestions, answerQuestion, deleteQuestion,
} from "./anonymous-qa";
export type { AnonymousQuestion } from "@workspace/anonymous-qa";

// ─── USER PROFILE UPDATE ──────────────────────────────────────────────────────

export async function incrementUserReadCount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { readCount: increment(1) });
}

export async function incrementChapterReadCount(chapterId: string): Promise<void> {
  await updateDoc(doc(db, "chapters", chapterId), { readCount: increment(1) });
}

export async function incrementStoryReadCount(storyId: string): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), { readCount: increment(1) });
}

export const GENRES = [
  "Fantastik", "Romantik", "Gizem", "Korku", "Bilim Kurgu",
  "Macera", "Dram", "Psikolojik", "Tarihi", "Gençlik",
  "Gerilim", "Komedi", "Şiir", "Deneme", "Spor"
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
  type: "follow" | "like" | "comment" | "qa_answer" | "chapter_approved" | "chapter_rejected" | "narration_approved" | "narration_rejected" | "moderator_directive";
  storyId?: string;
  storyTitle?: string;
  questionId?: string;
  /** Moderatörün yazara gönderdiği düzeltme direktifi */
  directiveMessage?: string;
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

export async function markNotificationRead(notifId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notifId), { read: true });
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

// ─── BLOCK ────────────────────────────────────────────────────────────────────

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

/** Kullanıcının engellediği UID listesini döndürür */
export async function getBlockedUserIds(blockerId: string): Promise<string[]> {
  const q = query(collection(db, "blocks"), where("blockerId", "==", blockerId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().blockedId as string);
}

/** Karşılıklı engel var mı? (biri diğerini engellemiş mi) */
export async function isMutuallyBlocked(uid1: string, uid2: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    getDoc(doc(db, "blocks", `${uid1}_${uid2}`)),
    getDoc(doc(db, "blocks", `${uid2}_${uid1}`)),
  ]);
  return a.exists() || b.exists();
}

// ─── JETONLAR ─────────────────────────────────────────────────────────────────

export interface JetonTransaction {
  id: string;
  uid: string;
  type: "earn" | "spend" | "refund";
  amount: number;
  /** İşlem sonrası bakiye */
  balanceAfter: number;
  reason: string;
  /** İlgili hikaye / bölüm ID'si (varsa) */
  refId?: string;
  createdAt: Timestamp;
}

/** Kullanıcının mevcut jeton bakiyesini döndürür (0 döner, hata fırlatmaz). */
export async function getJetonBalance(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return 0;
  return (snap.data().jetonBalance as number) ?? 0;
}

/** Kullanıcının son 50 jeton işlemini dinler (onSnapshot). */
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

/**
 * Kullanıcının jetonunu düşer.
 * Bakiye yetersizse hata fırlatır.
 */
export async function spendJetons(
  uid: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("Kullanıcı bulunamadı.");
  const current = (snap.data().jetonBalance as number) ?? 0;
  if (current < amount) throw new Error("Yetersiz jeton bakiyesi.");
  const balanceAfter = current - amount;
  await updateDoc(userRef, { jetonBalance: increment(-amount) });
  await addDoc(collection(db, "jetonTransactions"), {
    uid,
    type: "spend",
    amount,
    balanceAfter,
    reason,
    ...(refId ? { refId } : {}),
    createdAt: serverTimestamp(),
  });
}

/**
 * Kullanıcıya jeton ekler (yönetici / ödeme tamamlandığında çağrılır).
 * Güvenlik notu: üretimde bu fonksiyon Firebase Admin SDK ile
 * sunucu tarafında çalıştırılmalıdır.
 */
export async function earnJetons(
  uid: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("Kullanıcı bulunamadı.");
  const current = (snap.data().jetonBalance as number) ?? 0;
  const balanceAfter = current + amount;
  await updateDoc(userRef, { jetonBalance: increment(amount) });
  await addDoc(collection(db, "jetonTransactions"), {
    uid,
    type: "earn",
    amount,
    balanceAfter,
    reason,
    ...(refId ? { refId } : {}),
    createdAt: serverTimestamp(),
  });
}

// ─── MODERATÖR YARDIMCILARI ───────────────────────────────────────────────────

export async function getUserById(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as UserProfile;
}

export async function getInlineCommentById(id: string): Promise<InlineComment | null> {
  const snap = await getDoc(doc(db, "inlineComments", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as InlineComment;
}

export async function deleteInlineComment(id: string): Promise<void> {
  await deleteDoc(doc(db, "inlineComments", id));
}

// ─── BAN ──────────────────────────────────────────────────────────────────────

export async function banUser(uid: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: true, banReason: reason });
}

export async function unbanUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { banned: false, banReason: "" });
}

export async function getAllUsersForMod(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({
    ...d.data(), uid: d.id,
    displayName: d.data().displayName || "İsimsiz kullanıcı",
    avatarUrl: d.data().avatarUrl ?? "",
    role: d.data().role ?? "user",
  } as UserProfile)).sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

export async function searchUsersForMod(term: string): Promise<UserProfile[]> {
  if (!term.trim()) return [];
  const lower = term.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
    .filter(u => (u.displayName ?? "").toLowerCase().includes(lower));
}

export interface AdminUserSearchResult {
  uid: string;
  displayName: string;
  avatarUrl: string;
  role: "user" | "moderator" | "admin";
  email: string;
}

/** Email only leaves Firebase Auth for an exact-email lookup, over the admin-only API. */
export async function findAdminUserByEmail(term: string): Promise<AdminUserSearchResult[]> {
  const email = term.trim().toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error("E-posta araması için adresin tamamını yaz.");
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Bu arama için yönetici olarak giriş yapmalısın.");
  const idToken = await user.getIdToken();
  const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("E-posta ile kullanıcı araması yalnızca yetkili adminlere açıktır.");
    }
    throw new Error("E-posta araması şu anda tamamlanamadı. Yeniden dene.");
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Arama sunucusundan geçersiz yanıt alındı.");
  return payload.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Partial<AdminUserSearchResult>;
    if (typeof result.uid !== "string" || typeof result.displayName !== "string" ||
        typeof result.email !== "string" || result.email.toLocaleLowerCase("en-US") !== email) return [];
    return [{
      uid: result.uid,
      displayName: result.displayName,
      avatarUrl: typeof result.avatarUrl === "string" ? result.avatarUrl : "",
      role: result.role === "moderator" || result.role === "admin" ? result.role : "user",
      email: result.email,
    }];
  });
}

export interface PlatformStats {
  userCount: number;
  storyCount: number;
  chapterCount: number;
  pendingCount: number;
  reportCount: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const [users, stories, chapters, pending, reports] = await Promise.all([
    getCountFromServer(collection(db, "users")),
    getCountFromServer(collection(db, "stories")),
    getCountFromServer(query(collection(db, "chapters"), where("status", "==", "published"))),
    getCountFromServer(query(collection(db, "chapters"), where("status", "==", "pending_review"))),
    getCountFromServer(query(collection(db, "reports"), where("status", "==", "pending"))),
  ]);
  return {
    userCount: users.data().count,
    storyCount: stories.data().count,
    chapterCount: chapters.data().count,
    pendingCount: pending.data().count,
    reportCount: reports.data().count,
  };
}
