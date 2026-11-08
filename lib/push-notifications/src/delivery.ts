import { Timestamp, FieldPath, type Firestore, type DocumentData, type Query } from "firebase-admin/firestore";
import type { Message, Messaging } from "firebase-admin/messaging";
import { activeAccount, hash, type Preferences } from "./devices";

export type Kind = keyof Preferences;
export type Source = "messages" | "chapters" | "inlineComments" | "anonymousQuestionsV2";
export interface Job { source: Source; sourceId: string; recipientId: string; kind: Kind; createdAt: Timestamp; expiresAt: Timestamp }
const valid = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(v);
const publicStory = (s: DocumentData | undefined) => s && ["published", "completed"].includes(s.status) && !s.deleted && (!s.importState || s.importState === "complete");
export async function* pages(query: Query) {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const q = query.orderBy(FieldPath.documentId()).limit(200);
    const snap = await (cursor ? q.startAfter(cursor) : q).get();
    if (snap.empty) return;
    yield snap.docs;
    cursor = snap.docs.at(-1);
    if (snap.size < 200) return;
  }
}
async function blocked(db: Firestore, a: string, b: string) {
  if (a === b) return true;
  const docs = await db.getAll(db.doc(`blocks/${a}_${b}`), db.doc(`blocks/${b}_${a}`));
  return docs.some(d => d.exists);
}
// Resolve recipients from source records, NEVER from client-created notification documents.
export async function resolve(db: Firestore, job: Pick<Job, "source" | "sourceId" | "recipientId" | "kind">) {
  if (!valid(job.sourceId) || !valid(job.recipientId)) return null;
  const row = (await db.doc(`${job.source}/${job.sourceId}`).get()).data();
  if (!row) return null;
  let actor = "", targetId = "", body = "", mode = "";
  if (job.source === "messages" && job.kind === "messages") {
    if (!valid(row.conversationId) || !valid(row.senderId)) return null;
    const conversation = (await db.doc(`conversations/${row.conversationId}`).get()).data();
    if (!Array.isArray(conversation?.participants) || conversation.participants.length !== 2
      || !conversation.participants.includes(row.senderId) || !conversation.participants.includes(job.recipientId)) return null;
    actor = row.senderId; targetId = row.conversationId; body = "Yeni bir özel mesajın var."; mode = "message";
  } else if (job.source === "chapters" && job.kind === "newChapters") {
    if (!valid(row.storyId) || row.status !== "published") return null;
    const story = (await db.doc(`stories/${row.storyId}`).get()).data();
    const bookmark = await db.doc(`bookmarks/${job.recipientId}_${row.storyId}`).get();
    if (!publicStory(story) || !bookmark.exists) return null;
    actor = story!.authorId; targetId = row.storyId; body = "Kitaplığındaki bir kitaba yeni bölüm eklendi."; mode = "chapter";
  } else if (job.source === "inlineComments" && job.kind === "comments") {
    if (!valid(row.storyId) || !valid(row.chapterId) || !valid(row.authorId)) return null;
    const [story, chapter] = await db.getAll(db.doc(`stories/${row.storyId}`), db.doc(`chapters/${row.chapterId}`));
    if (!publicStory(story.data()) || chapter.data()?.status !== "published" || chapter.data()?.storyId !== row.storyId) return null;
    if (story.data()?.authorId !== job.recipientId) {
      const own = await db.collection("inlineComments").where("chapterId", "==", row.chapterId)
        .where("authorId", "==", job.recipientId).get();
      if (!own.docs.some(d => d.id !== job.sourceId && sameThread(d.data(), row)
        && d.data().createdAt?.toMillis() <= row.createdAt?.toMillis())) return null;
    }
    actor = row.authorId; targetId = row.storyId; body = "Kitabında veya katıldığın yorumda yeni bir yorum var."; mode = "comment";
  } else if (job.source === "anonymousQuestionsV2" && job.kind === "qa") {
    if (row.privacyVersion !== 2 || !valid(row.targetUid)) return null;
    const identity = (await db.doc(`anonymousQuestionIdentities/${job.sourceId}`).get()).data();
    if (!identity || identity.targetUid !== row.targetUid || !valid(identity.senderUid)) return null;
    if (job.recipientId === row.targetUid && row.isAnswered === false) {
      actor = identity.senderUid; targetId = row.targetUid; body = "Soru kutuna yeni bir anonim soru geldi."; mode = "question";
    } else if (job.recipientId === identity.senderUid && row.isAnswered === true) {
      actor = row.targetUid; targetId = job.sourceId; body = "Anonim soruna yanıt geldi."; mode = "answer";
    } else return null;
  } else return null;
  if (!valid(actor) || await blocked(db, actor, job.recipientId)) return null;
  // Guests have no profile; their anonymous question may still notify its recipient.
  const actorProfile = (await db.doc(`users/${actor}`).get()).data();
  if (!actorProfile && mode !== "question") return null;
  if (actorProfile && (actorProfile.banned || actorProfile.accountFrozen || actorProfile.accountDeletionPending)) return null;
  return { mode, targetId, body };
}
function sameThread(a: DocumentData, b: DocumentData) {
  return a.paragraphAnchor && b.paragraphAnchor ? a.paragraphAnchor === b.paragraphAnchor : a.paragraphIndex === b.paragraphIndex;
}
export async function enqueue(db: Firestore, job: Omit<Job, "createdAt" | "expiresAt">, eventTime: number) {
  if (!valid(job.recipientId)) return;
  const devices = await db.collection("pushDevices").where("uid", "==", job.recipientId).limit(21).get();
  if (!devices.docs.some(d => d.data().preferences?.[job.kind] && d.data().expiresAt?.toMillis() > Date.now())) return;
  const id = hash(`${job.source}:${job.sourceId}:${job.kind}:${job.recipientId}`);
  try {
    await db.doc(`pushQueue/${id}`).create({ ...job, createdAt: Timestamp.fromMillis(eventTime), expiresAt: Timestamp.fromMillis(eventTime + 86400_000) });
  } catch (e) { if ((e as { code?: number }).code !== 6) throw e; }
}
export async function fanout(db: Firestore, source: Source, id: string, eventTime: number, answered = false) {
  if (Date.now() - eventTime > 86400_000) return;
  const data = (await db.doc(`${source}/${id}`).get()).data();
  if (!data) return;
  const recipients = new Set<string>();
  let kind: Kind;
  if (source === "messages") {
    kind = "messages";
    if (!valid(data.conversationId)) return;
    const c = (await db.doc(`conversations/${data.conversationId}`).get()).data();
    for (const uid of c?.participants ?? []) if (uid !== data.senderId) recipients.add(uid);
  } else if (source === "anonymousQuestionsV2") {
    kind = "qa";
    const identity = (await db.doc(`anonymousQuestionIdentities/${id}`).get()).data();
    recipients.add(answered ? identity?.senderUid : data.targetUid);
  } else if (source === "chapters") {
    kind = "newChapters";
    if (data.status !== "published" || !valid(data.storyId)) return;
    const marker = db.doc(`pushChapterPublications/${id}`);
    if ((await marker.get()).data()?.complete) return;
    for await (const docs of pages(db.collection("bookmarks").where("storyId", "==", data.storyId))) {
      await Promise.all(docs.map(d => enqueue(db, { source, sourceId: id, kind, recipientId: d.data().userId }, eventTime)));
    }
    await marker.set({ complete: true, createdAt: Timestamp.fromMillis(eventTime) });
    return;
  } else {
    kind = "comments";
    if (!valid(data.storyId) || !valid(data.chapterId)) return;
    const story = (await db.doc(`stories/${data.storyId}`).get()).data();
    recipients.add(story?.authorId);
    const q = db.collection("inlineComments").where("chapterId", "==", data.chapterId);
    for await (const docs of pages(q)) {
      for (const doc of docs) if (doc.id !== id && sameThread(doc.data(), data)
        && doc.data().createdAt?.toMillis() <= data.createdAt?.toMillis()) recipients.add(doc.data().authorId);
    }
    recipients.delete(data.authorId);
  }
  for (const uid of recipients) await enqueue(db, { source, sourceId: id, kind, recipientId: uid }, eventTime);
}
export function messageFor(uid: string, token: string, tag: string, content: { mode: string; targetId: string; body: string }): Message {
  return {
    token, notification: { title: "SPEKTRUM", body: content.body },
    data: { version: "1", account: hash(uid), mode: content.mode, targetId: content.targetId },
    android: { priority: "high", ttl: 3600_000, collapseKey: content.mode === "answer" || content.mode === "test" ? "question" : content.mode,
      notification: { channelId: "spektrum-updates", tag, visibility: "private" } },
  };
}
export async function deliver(db: Firestore, messaging: Pick<Messaging, "send">, jobId: string, job: Job, now = Date.now()) {
  if (job.expiresAt.toMillis() < now) return;
  try { await activeAccount(db, job.recipientId); } catch (e) { if ((e as { status?: number }).status === 403) return; throw e; }
  const content = await resolve(db, job);
  if (!content) return;
  const devices = await db.collection("pushDevices").where("uid", "==", job.recipientId).get();
  await Promise.all(devices.docs.map(async device => {
    const d = device.data();
    if (!d.preferences?.[job.kind] || d.expiresAt?.toMillis() <= now || d.platform !== "android") return;
    const ledger = db.doc(`pushDeliveries/${hash(`${jobId}:${device.id}`)}`);
    const rateRef = db.doc(`pushRateLimits/${hash(`${device.id}:${job.kind}`)}`);
    const claimed = await db.runTransaction(async tx => {
      const [current, live, rate] = await Promise.all([tx.get(ledger), tx.get(device.ref), tx.get(rateRef)]);
      const row = live.data();
      if (!row || row.uid !== job.recipientId || row.token !== d.token || !row.preferences?.[job.kind]) return false;
      if (["sent", "invalid", "skipped"].includes(current.data()?.status)) return false;
      if ((current.data()?.leaseUntil?.toMillis() ?? 0) > now) throw new Error("PUSH_LEASE_BUSY");
      if ((rate.data()?.until?.toMillis() ?? 0) > now && rate.data()?.jobId !== jobId) {
        tx.set(ledger, { status: "skipped", expiresAt: Timestamp.fromMillis(now + 7 * 86400_000) });
        return false;
      }
      tx.set(rateRef, { jobId, until: Timestamp.fromMillis(now + 15_000), expiresAt: Timestamp.fromMillis(now + 86400_000) });
      tx.set(ledger, { status: "sending", leaseUntil: Timestamp.fromMillis(now + 60_000), expiresAt: Timestamp.fromMillis(now + 7 * 86400_000) });
      return true;
    });
    if (!claimed) return;
    try {
      await messaging.send(messageFor(job.recipientId, d.token, jobId, content));
      await ledger.set({ status: "sent", expiresAt: Timestamp.fromMillis(now + 7 * 86400_000) });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        await db.runTransaction(async tx => {
          const live = await tx.get(device.ref);
          if (live.data()?.token === d.token && live.data()?.uid === job.recipientId) tx.delete(device.ref);
          tx.set(ledger, { status: "invalid", expiresAt: Timestamp.fromMillis(now + 7 * 86400_000) });
        });
      } else {
        await ledger.set({ status: "retry", expiresAt: Timestamp.fromMillis(now + 7 * 86400_000) });
        throw new Error("PUSH_PROVIDER_TEMPORARY_FAILURE");
      }
    }
  }));
}
