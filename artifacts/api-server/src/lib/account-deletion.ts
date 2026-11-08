import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { adminAuth, adminBucket, adminDb } from "./firebase-admin";
import { removeWeeklyVotesForUser } from "./weekly-voting";

const JOB_COLLECTION = "accountDeletionJobs";
const QUERY_BATCH_SIZE = 400;
const LEASE_DURATION_MS = 10 * 60 * 1000;

export class AccountDeletionBusyError extends Error {
  constructor() {
    super("Hesap silme işlemi zaten devam ediyor.");
  }
}

type DeletionProgress = {
  stories: number;
  conversations: number;
  firestoreDocuments: number;
  storageFiles: number;
};

export type AccountDeletionResult = {
  ok: true;
  progress: DeletionProgress;
};

function chunks<T>(values: T[], size = 30): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function collectQueryRefs(query: Query): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let page = query.orderBy(FieldPath.documentId()).limit(QUERY_BATCH_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    refs.push(...snapshot.docs.map((document) => document.ref));
    if (snapshot.size < QUERY_BATCH_SIZE) break;
    cursor = snapshot.docs.at(-1);
  }

  return refs;
}

async function collectMatchingRefs(
  db: Firestore,
  collectionName: string,
  field: string,
  operator: FirebaseFirestore.WhereFilterOp,
  value: unknown,
): Promise<DocumentReference[]> {
  return collectQueryRefs(db.collection(collectionName).where(field, operator, value));
}

async function deleteRefs(
  db: Firestore,
  refs: Iterable<DocumentReference>,
): Promise<number> {
  const unique = new Map<string, DocumentReference>();
  for (const ref of refs) unique.set(ref.path, ref);
  if (unique.size === 0) return 0;

  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (const ref of unique.values()) writer.delete(ref);
  await writer.close();
  return unique.size;
}

async function deleteByFields(
  db: Firestore,
  collectionName: string,
  filters: Array<{ field: string; value: unknown; operator?: FirebaseFirestore.WhereFilterOp }>,
): Promise<number> {
  const refs = await Promise.all(
    filters.map(({ field, value, operator = "==" }) =>
      collectMatchingRefs(db, collectionName, field, operator, value),
    ),
  );
  return deleteRefs(db, refs.flat());
}

async function deleteByReferencedIds(
  db: Firestore,
  collectionName: string,
  field: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const refs = await Promise.all(
    chunks(ids).map((idChunk) =>
      collectMatchingRefs(db, collectionName, field, "in", idChunk),
    ),
  );
  return deleteRefs(db, refs.flat());
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const bucket = adminBucket();
  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return 0;
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

async function storagePrefixExists(prefix: string): Promise<boolean> {
  const [files] = await adminBucket().getFiles({ prefix, maxResults: 1 });
  return files.length > 0;
}

function storagePathFromDownloadUrl(url: string): string | null {
  const match = url.match(/\/o\/(.+?)(?:\?|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function deleteOwnedMessageStorageUrls(
  db: Firestore,
  urls: string[],
  conversationIds: Set<string>,
  uid: string,
): Promise<number> {
  const paths: string[] = [];
  for (const url of [...new Set(urls)]) {
    const path = storagePathFromDownloadUrl(url);
    if (!path) continue;
    const parts = path.split("/");
    const isOwnedPath =
      parts.length >= 4 &&
      parts[0] === "messages" &&
      conversationIds.has(parts[1] ?? "") &&
      parts[2] === uid;
    if (isOwnedPath) {
      paths.push(path);
    }
  }
  if (paths.length === 0) return 0;
  const bucket = adminBucket();
  await Promise.all(paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
  return paths.length;
}

async function scrubArrayReference(
  db: Firestore,
  collectionName: string,
  field: string,
  uid: string,
): Promise<number> {
  const refs = await collectMatchingRefs(db, collectionName, field, "array-contains", uid);
  if (refs.length === 0) return 0;
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (const ref of refs) writer.update(ref, { [field]: FieldValue.arrayRemove(uid) });
  await writer.close();
  return refs.length;
}

export async function deleteAccountData(uid: string): Promise<AccountDeletionResult> {
  const db = adminDb();
  const jobRef = db.collection(JOB_COLLECTION).doc(uid);
  const progress: DeletionProgress = {
    stories: 0,
    conversations: 0,
    firestoreDocuments: 0,
    storageFiles: 0,
  };

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const data = snapshot.data();
    const startedAt = data?.["startedAt"] as FirebaseFirestore.Timestamp | undefined;
    const leaseIsActive =
      data?.["status"] === "running" &&
      startedAt != null &&
      Date.now() - startedAt.toMillis() < LEASE_DURATION_MS;

    if (leaseIsActive) throw new AccountDeletionBusyError();

    transaction.set(jobRef, {
      uid,
      status: "running",
      attemptCount: FieldValue.increment(1),
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    }, { merge: true });
    transaction.set(db.doc(`users/${uid}`), {
      accountDeletionPending: true,
      accountDeletionRequestedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  try {
    const authUser = await adminAuth().getUser(uid);
    await adminAuth().setCustomUserClaims(uid, {
      ...(authUser.customClaims ?? {}),
      accountDeletionPending: true,
    });
    await adminAuth().revokeRefreshTokens(uid);
    progress.firestoreDocuments += await removeWeeklyVotesForUser(db, uid);

    const [storyRefs, conversationRefs] = await Promise.all([
      collectMatchingRefs(db, "stories", "authorId", "==", uid),
      collectMatchingRefs(db, "conversations", "participants", "array-contains", uid),
    ]);
    const storyIds = storyRefs.map((ref) => ref.id);
    const conversationIds = conversationRefs.map((ref) => ref.id);
    progress.stories = storyIds.length;
    progress.conversations = conversationIds.length;

    const chapterRefs = (
      await Promise.all(
        chunks(storyIds).map((storyIdChunk) =>
          collectMatchingRefs(db, "chapters", "storyId", "in", storyIdChunk),
        ),
      )
    ).flat();
    const chapterIds = chapterRefs.map((ref) => ref.id);

    const commentRefs = [
      ...(await collectMatchingRefs(db, "inlineComments", "authorId", "==", uid)),
      ...(await Promise.all(
        chunks(storyIds).map((storyIdChunk) =>
          collectMatchingRefs(db, "inlineComments", "storyId", "in", storyIdChunk),
        ),
      )).flat(),
      ...(await Promise.all(
        chunks(chapterIds).map((chapterIdChunk) =>
          collectMatchingRefs(db, "inlineComments", "chapterId", "in", chapterIdChunk),
        ),
      )).flat(),
    ];
    const commentIds = commentRefs.map((ref) => ref.id);

    progress.firestoreDocuments += await deleteRefs(db, [
      ...chapterRefs,
      ...commentRefs,
    ]);
    progress.firestoreDocuments += await deleteByFields(db, "storyLikes", [
      { field: "userId", value: uid },
      ...storyIds.map((storyId) => ({ field: "storyId", value: storyId })),
    ]);
    progress.firestoreDocuments += await deleteByFields(db, "talentPortfolios", [
      { field: "userId", value: uid },
      ...storyIds.map((storyId) => ({ field: "storyId", value: storyId })),
    ]);
    progress.firestoreDocuments += await deleteByFields(db, "narrationRequests", [
      { field: "narratorId", value: uid },
      { field: "authorId", value: uid },
      ...storyIds.map((storyId) => ({ field: "storyId", value: storyId })),
    ]);
    progress.firestoreDocuments += await deleteByFields(db, "narrations", [
      { field: "narratorId", value: uid },
      ...storyIds.map((storyId) => ({ field: "storyId", value: storyId })),
    ]);
    progress.firestoreDocuments += await deleteByFields(db, "chapterAudio", [
      { field: "ownerUid", value: uid },
    ]);

    const reportedIds = [...storyIds, ...chapterIds, ...commentIds];
    progress.firestoreDocuments += await deleteByFields(db, "reports", [
      { field: "reporterId", value: uid },
      { field: "reportedId", value: uid },
      ...storyIds.map((storyId) => ({ field: "contextId", value: storyId })),
    ]);
    progress.firestoreDocuments += await deleteByReferencedIds(
      db,
      "reports",
      "reportedId",
      reportedIds,
    );

    progress.firestoreDocuments += await deleteRefs(db, storyRefs);

    const sentMessageRefs = await collectMatchingRefs(db, "messages", "senderId", "==", uid);
    const sentMessageSnapshots = await Promise.all(sentMessageRefs.map((ref) => ref.get()));
    const sentMediaUrls = sentMessageSnapshots
      .map((snapshot) => snapshot.data()?.["mediaUrl"])
      .filter((url): url is string => typeof url === "string");
    progress.storageFiles += await deleteOwnedMessageStorageUrls(
      db,
      sentMediaUrls,
      new Set(conversationIds),
      uid,
    );
    progress.firestoreDocuments += await deleteRefs(db, sentMessageRefs);

    const conversationWriter = db.bulkWriter();
    conversationWriter.onWriteError((error) => error.failedAttempts < 3);
    for (const ref of conversationRefs) {
      const snapshot = await ref.get();
      if (!snapshot.exists) continue;
      const data = snapshot.data() ?? {};
      const participants = ((data["participants"] as string[] | undefined) ?? []).filter(
        (participantId) => participantId !== uid,
      );
      const participantNames = { ...((data["participantNames"] as Record<string, string> | undefined) ?? {}) };
      const participantAvatars = { ...((data["participantAvatars"] as Record<string, string> | undefined) ?? {}) };
      const unreadCount = { ...((data["unreadCount"] as Record<string, number> | undefined) ?? {}) };
      delete participantNames[uid];
      delete participantAvatars[uid];
      delete unreadCount[uid];
      const remainingMessages = await db
        .collection("messages")
        .where("conversationId", "==", ref.id)
        .get();
      const latestMessage = remainingMessages.docs
        .map((document) => document.data())
        .sort((left, right) => {
          const leftTime = (left["createdAt"] as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
          const rightTime = (right["createdAt"] as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
          return rightTime - leftTime;
        })[0];
      const lastMessage = latestMessage
        ? (latestMessage["text"] as string | undefined)
          || (latestMessage["mediaType"] === "gif" ? "GIF" : "📷 Fotoğraf")
        : "";
      conversationWriter.set(ref, {
        participants,
        participantNames,
        participantAvatars,
        unreadCount,
        lastMessage,
        ...(latestMessage?.["createdAt"]
          ? { lastMessageAt: latestMessage["createdAt"] }
          : { lastMessageAt: FieldValue.delete() }),
      }, { merge: true });
    }
    await conversationWriter.close();

    // Private identity records connect sender deletion to the corresponding
    // public question, without ever exposing that mapping to clients.
    const qaIdentities = await Promise.all([
      collectMatchingRefs(db, "anonymousQuestionIdentities", "senderUid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestionIdentities", "targetUid", "==", uid),
    ]);
    const qaIdentityRefs = qaIdentities.flat();
    const qaPublicRefs = qaIdentityRefs.flatMap(ref => [
      db.collection("anonymousQuestionsV2").doc(ref.id),
      db.collection("anonymousQuestions").doc(ref.id),
    ]);
    progress.firestoreDocuments += await deleteRefs(db, [
      ...qaPublicRefs, ...qaIdentityRefs, db.collection("anonymousQuestionLimits").doc(uid),
    ]);
    const independentCollections = [
      ["pushDevices", "uid"],
      ["pushQueue", "recipientId"],
      ["follows", "followerId"],
      ["follows", "followedId"],
      ["notifications", "recipientId"],
      ["notifications", "senderId"],
      ["bookmarks", "userId"],
      ["blocks", "blockerId"],
      ["blocks", "blockedId"],
      ["statuses", "uid"],
      ["anonymousQuestions", "targetUid"],
      ["anonymousQuestions", "senderUid"],
      ["anonymousQuestionsV2", "targetUid"],
      ["jetonTransactions", "uid"],
    ] as const;
    const independentRefs = await Promise.all(
      independentCollections.map(([collectionName, field]) =>
        collectMatchingRefs(db, collectionName, field, "==", uid),
      ),
    );
    progress.firestoreDocuments += await deleteRefs(db, independentRefs.flat());
    await Promise.all([
      scrubArrayReference(db, "statuses", "viewedBy", uid),
      scrubArrayReference(db, "inlineComments", "likedBy", uid),
      scrubArrayReference(db, "stories", "likedBy", uid),
    ]);

    const directPrefixes = [
      `avatars/${uid}/`,
      `covers/users/${uid}/`,
      `story-covers/${uid}/`,
      `chapter-audio/${uid}/`,
      `statuses/${uid}/`,
      `talent/${uid}/`,
    ];
    const relatedPrefixes = storyIds.map((id) => `narrations/${id}/`);
    const storageCounts = await Promise.all(
      [...directPrefixes, ...relatedPrefixes].map(deleteStoragePrefix),
    );
    progress.storageFiles += storageCounts.reduce((sum, count) => sum + count, 0);

    const residueChecks = await Promise.all([
      collectMatchingRefs(db, "stories", "authorId", "==", uid),
      collectMatchingRefs(db, "inlineComments", "authorId", "==", uid),
      collectMatchingRefs(db, "messages", "senderId", "==", uid),
      collectMatchingRefs(db, "statuses", "uid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestions", "senderUid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestions", "targetUid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestionsV2", "targetUid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestionIdentities", "senderUid", "==", uid),
      collectMatchingRefs(db, "anonymousQuestionIdentities", "targetUid", "==", uid),
      collectMatchingRefs(db, "storyLikes", "userId", "==", uid),
      collectMatchingRefs(db, "follows", "followerId", "==", uid),
      collectMatchingRefs(db, "follows", "followedId", "==", uid),
      collectMatchingRefs(db, "notifications", "recipientId", "==", uid),
      collectMatchingRefs(db, "notifications", "senderId", "==", uid),
      collectMatchingRefs(db, "pushDevices", "uid", "==", uid),
      collectMatchingRefs(db, "pushQueue", "recipientId", "==", uid),
      collectMatchingRefs(db, "bookmarks", "userId", "==", uid),
      collectMatchingRefs(db, "blocks", "blockerId", "==", uid),
      collectMatchingRefs(db, "blocks", "blockedId", "==", uid),
      collectMatchingRefs(db, "talentPortfolios", "userId", "==", uid),
      collectMatchingRefs(db, "narrationRequests", "narratorId", "==", uid),
      collectMatchingRefs(db, "narrationRequests", "authorId", "==", uid),
      collectMatchingRefs(db, "narrations", "narratorId", "==", uid),
      collectMatchingRefs(db, "chapterAudio", "ownerUid", "==", uid),
      collectMatchingRefs(db, "reports", "reporterId", "==", uid),
      collectMatchingRefs(db, "reports", "reportedId", "==", uid),
      collectMatchingRefs(db, "jetonTransactions", "uid", "==", uid),
      collectMatchingRefs(db, "statuses", "viewedBy", "array-contains", uid),
      collectMatchingRefs(db, "inlineComments", "likedBy", "array-contains", uid),
      collectMatchingRefs(db, "stories", "likedBy", "array-contains", uid),
    ]);
    const storageResidues = await Promise.all([
      ...directPrefixes.map(storagePrefixExists),
      ...conversationIds.map((conversationId) =>
        storagePrefixExists(`messages/${conversationId}/${uid}/`),
      ),
    ]);
    if (
      residueChecks.some((refs) => refs.length > 0) ||
      storageResidues.some(Boolean)
    ) {
      throw new Error("Silme sırasında yeni kullanıcı içeriği algılandı; işlem yeniden denenmeli.");
    }

    await db.doc(`users/${uid}`).delete();
    progress.firestoreDocuments += 1;

    await jobRef.set({
      status: "finalizing",
      progress,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    try {
      await adminAuth().deleteUser(uid);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "auth/user-not-found") throw error;
    }
    await jobRef.delete().catch(() => undefined);
    return { ok: true, progress };
  } catch (error) {
    if (error instanceof AccountDeletionBusyError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await jobRef.set({
      status: "failed",
      progress,
      lastError: message.slice(0, 1000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}