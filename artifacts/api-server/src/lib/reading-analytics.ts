import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { ReadingObservation } from "@workspace/api-zod";
import { summarizeReading, type ReadingSession } from "./reading-summary";

export class ReadingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function active(profile: FirebaseFirestore.DocumentData | undefined) {
  return profile && !profile.banned && !profile.accountFrozen && !profile.accountDeletionPending;
}
function publicStory(story: FirebaseFirestore.DocumentData | undefined) {
  return story && ["published", "completed"].includes(story.status) && !story.deleted && !story.isDeleted
    && (!story.importState || story.importState === "complete");
}
export async function recordReading(db: Firestore, uid: string | null, input: ReadingObservation, now = Date.now()) {
  const id = createHash("sha256").update(`${input.visitId}:${input.chapterId}`).digest("hex");
  const ref = db.doc(`readingAnalytics/${input.storyId}/sessions/${id}`);
  return db.runTransaction(async tx => {
    const [storySnap, chapterSnap, sessionSnap] = await tx.getAll(
      db.doc(`stories/${input.storyId}`), db.doc(`chapters/${input.chapterId}`), ref,
    );
    const story = storySnap.data(), chapter = chapterSnap.data();
    if (!publicStory(story) || chapter?.storyId !== input.storyId || chapter?.status !== "published") {
      throw new ReadingError(404, "Yayımlanmış bölüm bulunamadı.");
    }
    if (uid === story!.authorId) return { accepted: false };
    if (uid) {
      const profile = await tx.get(db.doc(`users/${uid}`));
      if (!active(profile.data())) throw new ReadingError(403, "Bu hesapla ölçüm gönderilemiyor.");
    }
    const old = sessionSnap.data() as ReadingSession | undefined;
    const previousSeconds = old?.activeSeconds ?? 0;
    // Never trust a client claiming hours on its first request, or background elapsed time.
    const elapsed = old ? Math.max(0, Math.floor((now - old.updatedAt) / 1000)) : 0;
    const activeSeconds = Math.max(previousSeconds, Math.min(input.activeSeconds, previousSeconds + Math.min(45, elapsed)));
    const progress = Math.max(old?.progress ?? 0, Math.floor(input.progress));
    if (old && old.progress === progress && previousSeconds === activeSeconds) return { accepted: true };
    tx.set(ref, {
      chapterId: input.chapterId, visitId: input.visitId, progress, activeSeconds,
      startedAt: old?.startedAt ?? now, updatedAt: Math.max(old?.updatedAt ?? now, now),
      expiresAt: Timestamp.fromMillis(now + 90 * 86400_000),
    });
    return { accepted: true };
  });
}

export async function readingReport(db: Firestore, uid: string, storyId: string, days: number, now = Date.now()) {
  const [story, profile] = await Promise.all([db.doc(`stories/${storyId}`).get(), db.doc(`users/${uid}`).get()]);
  if (!active(profile.data())) throw new ReadingError(403, "Bu hesapla istatistik görüntülenemiyor.");
  if (!story.exists || story.data()?.authorId !== uid) throw new ReadingError(404, "Bu hikâyenin istatistiklerine erişimin yok.");
  const [chapters, sessions] = await Promise.all([
    db.collection("chapters").where("storyId", "==", storyId).limit(501).get(),
    db.collection(`readingAnalytics/${storyId}/sessions`)
      .where("startedAt", ">=", now - days * 86400_000).orderBy("startedAt", "desc").limit(5001).get(),
  ]);
  if (chapters.size > 500) throw new ReadingError(422, "Bu rapor en fazla 500 bölümlü hikâyeler için hazırlanabilir.");
  return summarizeReading({
    storyId, title: String(story.data()?.title ?? ""), days, now, truncated: sessions.size > 5000,
    chapters: chapters.docs.filter(c => c.data().status === "published").map(c => ({
      chapterId: c.id, title: String(c.data().title ?? ""), order: Number(c.data().order ?? 0),
    })),
    sessions: sessions.docs.slice(0, 5000).map(s => s.data() as ReadingSession),
  });
}
