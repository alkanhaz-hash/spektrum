import { FieldValue, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

const DAY = 86_400_000;
const ISTANBUL_OFFSET = 3 * 60 * 60 * 1000;
export class VotingError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Turkey has used UTC+03 year-round since 2016. Week ends are exclusive. */
export function getVotingWeek(at = new Date()) {
  const local = new Date(at.getTime() + ISTANBUL_OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const monday = midnight - ((local.getUTCDay() + 6) % 7) * DAY;
  return {
    weekId: new Date(monday).toISOString().slice(0, 10),
    startsAt: new Date(monday - ISTANBUL_OFFSET).toISOString(),
    endsAt: new Date(monday - ISTANBUL_OFFSET + 7 * DAY).toISOString(),
  };
}

function active(profile: FirebaseFirestore.DocumentData | undefined) {
  if (!profile || profile.banned || profile.accountFrozen || profile.accountDeletionPending) {
    throw new VotingError(403, "INACTIVE_ACCOUNT", "Bu hesapla oy kullanılamaz.");
  }
}
function eligibleStory(story: FirebaseFirestore.DocumentData | undefined) {
  return !!story && ["published", "completed"].includes(story.status)
    && !story.deleted && !story.isDeleted
    && (!story.importState || story.importState === "complete");
}
const ballotRef = (db: Firestore, weekId: string, uid: string) =>
  db.collection("weeklyStoryBallots").doc(`${weekId}_${uid}`);
const tallyRef = (db: Firestore, weekId: string, storyId: string) =>
  db.collection("weeklyStoryVotes").doc(weekId).collection("tallies").doc(storyId);

export async function readWeeklyChoice(db: Firestore, uid: string, at = new Date()) {
  const week = getVotingWeek(at);
  const [profile, ballot] = await Promise.all([
    db.doc(`users/${uid}`).get(), ballotRef(db, week.weekId, uid).get(),
  ]);
  active(profile.data());
  return { ...week, storyId: (ballot.data()?.storyId as string | undefined) ?? null };
}

export async function recordWeeklyVote(db: Firestore, uid: string, storyId: string, at = new Date()) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(storyId)) {
    throw new VotingError(400, "INVALID_STORY", "Geçersiz hikâye.");
  }
  const week = getVotingWeek(at);
  const ballot = ballotRef(db, week.weekId, uid);
  const tally = tallyRef(db, week.weekId, storyId);
  await db.runTransaction(async transaction => {
    const [profile, story, previous, count] = await transaction.getAll(
      db.doc(`users/${uid}`), db.doc(`stories/${storyId}`), ballot, tally,
    );
    active(profile.data());
    if (!eligibleStory(story.data())) {
      throw new VotingError(403, "STORY_UNAVAILABLE", "Yalnızca yayındaki hikâyelere oy verebilirsin.");
    }
    if (story.data()?.authorId === uid) {
      throw new VotingError(403, "SELF_VOTE", "Kendi hikâyene oy veremezsin.");
    }
    if (previous.exists) {
      if (previous.data()?.storyId === storyId) return; // Lost acknowledgement / double tap.
      throw new VotingError(409, "ALREADY_VOTED", "Bu haftaki oyunu kullandın. Yeni hafta pazartesi 00.00'da başlar.");
    }
    const votes = count.data()?.votes ?? 0;
    if (!Number.isSafeInteger(votes) || votes < 0) throw new Error("Invalid weekly tally");
    transaction.create(ballot, {
      voterUid: uid, storyId, weekId: week.weekId, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(tally, { votes: votes + 1 });
  });
  return { ...week, storyId };
}

export async function getWeeklyStandings(db: Firestore, at = new Date()) {
  const week = getVotingWeek(at);
  const entries: { storyId: string; title: string; authorName: string; coverUrl: string; votes: number; rank: number }[] = [];
  const base = db.collection("weeklyStoryVotes").doc(week.weekId).collection("tallies").orderBy("votes", "desc");
  let cursor: QueryDocumentSnapshot | undefined;
  // Single-field Firestore order; equal counts use the deterministic document ID order.
  for (let page = 0; page < 20; page++) {
    const snapshot = await (cursor ? base.startAfter(cursor) : base).limit(25).get();
    if (snapshot.empty) return { ...week, entries };
    const stories = await db.getAll(...snapshot.docs.map(item => db.doc(`stories/${item.id}`)));
    for (const [index, item] of snapshot.docs.entries()) {
      const story = stories[index]?.data();
      const votes: unknown = item.data().votes;
      if (!eligibleStory(story) || !Number.isSafeInteger(votes) || (votes as number) <= 0) continue;
      entries.push({
        storyId: item.id,
        title: typeof story?.title === "string" ? story.title : "",
        authorName: typeof story?.authorName === "string" ? story.authorName : "",
        coverUrl: typeof story?.coverUrl === "string" ? story.coverUrl : "",
        votes: votes as number, rank: entries.length + 1,
      });
      if (entries.length === 3) return { ...week, entries };
    }
    if (snapshot.size < 25) return { ...week, entries };
    cursor = snapshot.docs.at(-1);
  }
  throw new VotingError(503, "STANDINGS_BUSY", "Sıralama şu an hazırlanamadı. Lütfen tekrar dene.");
}

/** Account-deletion hook: remove private ballots and their contribution atomically. */
export async function removeWeeklyVotesForUser(db: Firestore, uid: string) {
  let removed = 0;
  while (true) {
    const ballots = await db.collection("weeklyStoryBallots").where("voterUid", "==", uid).limit(50).get();
    if (ballots.empty) return removed;
    for (const ballot of ballots.docs) {
      await db.runTransaction(async transaction => {
        const current = await transaction.get(ballot.ref);
        if (!current.exists) return;
        const data = current.data()!;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.weekId) || !/^[A-Za-z0-9_-]{1,128}$/.test(data.storyId)) {
          throw new Error("Invalid stored weekly ballot");
        }
        const tally = tallyRef(db, data.weekId, data.storyId);
        const count = await transaction.get(tally);
        const votes = count.data()?.votes ?? 0;
        if (!Number.isSafeInteger(votes) || votes < 0) throw new Error("Invalid weekly tally");
        if (count.exists) {
          if (votes <= 1) transaction.delete(tally);
          else transaction.update(tally, { votes: votes - 1 });
        }
        transaction.delete(ballot.ref);
      });
      removed++;
    }
  }
}
