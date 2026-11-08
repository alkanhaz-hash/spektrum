import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, serverTimestamp, where, type Firestore } from "firebase/firestore";

async function legacyLikes(db: Firestore, storyId: string, uid: string) {
  const rows = await getDocsFromServer(query(collection(db, "storyLikes"), where("storyId", "==", storyId), where("userId", "==", uid), limit(50)));
  if (rows.size === 50) throw new Error("Eski beğeni kayıtları incelenmeli. Lütfen destek iste.");
  return rows.docs.filter(row => row.data().legacyRemoval !== true && row.id !== `${storyId}_${uid}`);
}
export async function hasStoryLike(db: Firestore, storyId: string, uid: string): Promise<boolean> {
  const [story, like, removal, legacy] = await Promise.all([
    getDocFromServer(doc(db, "stories", storyId)), getDocFromServer(doc(db, "storyLikes", `${storyId}_${uid}`)),
    getDocFromServer(doc(db, "storyLikes", `_legacy_unliked_${storyId}_${uid}`)), legacyLikes(db, storyId, uid),
  ]);
  return like.exists() || legacy.length > 0 || ((story.data()?.likedBy ?? []).includes(uid) && !removal.exists());
}
/** Both the membership and aggregate change in one transaction. Old array membership stays read-only. */
export async function setStoryLike(db: Firestore, storyId: string, uid: string, desired: boolean): Promise<boolean> {
  const legacy = await legacyLikes(db, storyId, uid);
  const storyRef = doc(db, "stories", storyId), likeRef = doc(db, "storyLikes", `${storyId}_${uid}`);
  const removalRef = doc(db, "storyLikes", `_legacy_unliked_${storyId}_${uid}`);
  try { return await runTransaction(db, async transaction => {
    const [story, like, removal, ...old] = await Promise.all([
      transaction.get(storyRef), transaction.get(likeRef), transaction.get(removalRef),
      ...legacy.map(row => transaction.get(row.ref)),
    ]);
    if (!story.exists()) throw new Error("Hikâye bulunamadı.");
    for (const record of [like, removal, ...old]) {
      if (record.exists() && (record.data().userId !== uid || record.data().storyId !== storyId)) throw new Error("Beğeni kaydı uyuşmuyor.");
    }
    const data = story.data(), arrayMember = (data.likedBy ?? []).includes(uid);
    const active = like.exists() || old.some(row => row.exists()) || (arrayMember && !removal.exists());
    if (active === desired) return false;
    if (desired) {
      if (!["published", "completed"].includes(data.status)) throw new Error("Yalnızca yayımlanmış hikâyeler beğenilebilir.");
      if (arrayMember) {
        if (removal.exists()) transaction.delete(removalRef);
      } else transaction.set(likeRef, { storyId, userId: uid, createdAt: serverTimestamp() });
    } else {
      if (like.exists()) transaction.delete(likeRef);
      old.forEach(row => { if (row.exists()) transaction.delete(row.ref); });
      // Rules intentionally do not permit readers to edit another author's likedBy array.
      if (arrayMember && !removal.exists()) transaction.set(removalRef, {
        storyId, userId: uid, legacyRemoval: true, createdAt: serverTimestamp(),
      });
    }
    transaction.update(storyRef, { likeCount: Math.max(0, (data.likeCount ?? 0) + (desired ? 1 : -1)) });
    return true;
  }); } catch (error) {
    // Rules may evaluate a concurrent create/delete against the already changed
    // document before Firestore reports a transaction conflict. Recover only when
    // fresh server reads prove another request has reached the requested state.
    if (["permission-denied", "failed-precondition", "aborted"].includes((error as { code?: string }).code ?? "")) {
      try { if (await hasStoryLike(db, storyId, uid) === desired) return false; } catch { /* Preserve original failure. */ }
    }
    throw error;
  }
}
