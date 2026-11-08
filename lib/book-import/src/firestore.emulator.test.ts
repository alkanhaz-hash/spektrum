import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { initializeFirestore, doc, getDoc, terminate, type Firestore } from "firebase/firestore";
import { createBookImporter } from "./firestore";
import { importSourceId } from "./index";
import { hasStoryLike, setStoryLike } from "../../story-reactions/src/index";
// This fixture refuses all hosts except the fixed demo-project loopback emulators.
import { createFixture } from "../../../artifacts/api-server/scripts/weekly-voting-fixture.mjs";

let fixture: Awaited<ReturnType<typeof createFixture>>;
const clients: { app: FirebaseApp; db: Firestore; auth: ReturnType<typeof getAuth> }[] = [];
const digest = async (text: string) => createHash("sha256").update(text).digest("hex");
const input = (key: string) => ({
  sourceText: `Bölüm 1\nİlk bölüm ${key}.\nBölüm 2\nSon bölüm.`,
  preview: { title: `Kitap ${key}`, summary: "Bu kitabın açık ve yeterli açıklaması.", genre: "Macera",
    chapters: [{ title: "Bölüm 1", content: `İlk bölüm ${key}.` }, { title: "Bölüm 2", content: "Son bölüm." }] },
  ownershipConfirmed: true,
});
const importer = (client = clients[0]) => createBookImporter({ ...client, genres: ["Macera"], digest, emulatorBase: "http://127.0.0.1:18081" });
before(async () => {
  fixture = await createFixture();
  for (const role of ["reader", "other"] as const) {
    const app = initializeApp({ projectId: "demo-spektrum-qa", apiKey: "demo-spektrum-qa-key", appId: "demo-spektrum-qa" }, `import-${role}`);
    const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });
    const db = initializeFirestore(app, { host: "127.0.0.1:18081", ssl: false, experimentalForceLongPolling: true });
    await signInWithEmailAndPassword(auth, fixture.accounts[role].email, fixture.accounts[role].password);
    clients.push({ app, auth, db });
  }
});
after(async () => {
  for (const client of clients) { await terminate(client.db); await deleteApp(client.app); }
  if (fixture) await fixture.close();
});
const count = async () => (await fixture.db.doc(`users/${fixture.accounts.reader.uid}`).get()).data()!.storyCount;
test("mobile importer requires ownership, real session, valid preview and active profile", async () => {
  await assert.rejects(importer()({ ...input("consent"), ownershipConfirmed: false }), /onay/);
  await assert.rejects(importer()({ ...input("bad"), preview: { ...input("bad").preview, genre: "bad" } }), /türü/);
  await assert.rejects(createBookImporter({ db: clients[0].db, auth: { currentUser: null }, genres: ["Macera"], digest })(input("guest")), /giriş/);
  for (const field of ["banned", "accountFrozen", "accountDeletionPending"]) {
    await fixture.db.doc(`users/${fixture.accounts.reader.uid}`).update({ [field]: true });
    await assert.rejects(importer()(input(field)), /uygun değil/);
    await fixture.db.doc(`users/${fixture.accounts.reader.uid}`).update({ [field]: false });
  }
});
test("draft import is atomic, private and idempotent even when retry metadata changes", async () => {
  const before = await count(), request = input("draft");
  const result = await importer()(request);
  const story = (await fixture.db.doc(`stories/${result.storyId}`).get()).data()!;
  assert.equal(story.status, "draft"); assert.equal(story.importState, "complete"); assert.equal(story.chapterCount, 2);
  assert.equal(await count(), before + 1);
  const chapter = doc(clients[0].db, "chapters", `${result.storyId}_1`);
  assert.equal((await getDoc(chapter)).data()!.content, request.preview.chapters[0].content);
  await assert.rejects(getDoc(doc(clients[1].db, "chapters", `${result.storyId}_1`)), /permission/i);
  const retry = await importer()({ ...request, preview: { ...request.preview, title: "Başka başlık" } });
  assert.equal(retry.storyId, result.storyId); assert.equal(retry.alreadyImported, true);
  assert.equal((await fixture.db.doc(`stories/${result.storyId}`).get()).data()!.title, request.preview.title);
  assert.equal(await count(), before + 1);
});
test("simultaneous imports produce one story, one set of chapters and one author increment", async () => {
  const before = await count(), request = input("concurrent");
  const results = await Promise.all([importer()(request), importer()(request)]);
  assert.equal(results[0].storyId, results[1].storyId);
  assert.equal(await count(), before + 1);
  assert.equal((await fixture.db.collection("chapters").where("storyId", "==", results[0].storyId).get()).size, 2);
});
test("lost commit acknowledgement recovers the completed book without duplicates", async () => {
  const before = await count(), original = globalThis.fetch;
  let lost = false;
  globalThis.fetch = async (...args) => {
    const response = await original(...args);
    if (String(args[0]).endsWith(":commit") && response.ok && !lost) { lost = true; throw new TypeError("ack lost"); }
    return response;
  };
  try { await assert.rejects(importer()(input("ack")), /Bağlantı/); }
  finally { globalThis.fetch = original; }
  assert.equal(lost, true);
  assert.equal((await importer()(input("ack"))).alreadyImported, true);
  assert.equal(await count(), before + 1);
});
test("failure before commit leaves a resumable shell and locks its reviewed metadata", async () => {
  const before = await count(), original = globalThis.fetch, request = input("offline");
  globalThis.fetch = async (...args) => {
    if (String(args[0]).endsWith(":commit")) throw new TypeError("offline");
    return original(...args);
  };
  try { await assert.rejects(importer()(request), /Bağlantı/); }
  finally { globalThis.fetch = original; }
  assert.equal(await count(), before);
  await assert.rejects(importer()({ ...request, preview: { ...request.preview, title: "Değişti" } }), /önizlemesi değişmiş/);
  await importer()(request); assert.equal(await count(), before + 1);
});
test("creation preconditions never overwrite orphan/edited chapters or partially count a failed import", async () => {
  const before = await count(), original = globalThis.fetch, request = input("orphan");
  globalThis.fetch = async (...args) => {
    if (String(args[0]).endsWith(":commit")) throw new TypeError("offline");
    return original(...args);
  };
  try { await assert.rejects(importer()(request)); }
  finally { globalThis.fetch = original; }
  const id = await importSourceId(fixture.accounts.reader.uid, request.sourceText, digest);
  await fixture.db.doc(`chapters/${id}_1`).set({ storyId: id, content: "Korunacak mevcut metin", status: "draft", order: 1 });
  await assert.rejects(importer()(request), /üzerine yazılmadı/);
  assert.equal((await fixture.db.doc(`chapters/${id}_1`).get()).data()!.content, "Korunacak mevcut metin");
  assert.equal((await fixture.db.doc(`chapters/${id}_2`).get()).exists, false);
  assert.equal((await fixture.db.doc(`stories/${id}`).get()).data()!.importState, "prepared");
  assert.equal(await count(), before);
});
test("shared likes atomically deduplicate concurrent likes and unlikes across clients", async () => {
  const { db } = clients[0], uid = fixture.accounts.reader.uid, id = fixture.storyId;
  const added = await Promise.all([setStoryLike(db, id, uid, true), setStoryLike(db, id, uid, true)]);
  assert.equal(added.filter(Boolean).length, 1); assert.equal(await hasStoryLike(db, id, uid), true);
  assert.equal((await fixture.db.doc(`stories/${id}`).get()).data()!.likeCount, 1);
  const removed = await Promise.all([setStoryLike(db, id, uid, false), setStoryLike(db, id, uid, false)]);
  assert.equal(removed.filter(Boolean).length, 1); assert.equal(await hasStoryLike(db, id, uid), false);
  assert.equal((await fixture.db.doc(`stories/${id}`).get()).data()!.likeCount, 0);
});
test("old mobile arrays and random-ID web likes remain reversible without editing another author's story", async () => {
  const { db } = clients[0], uid = fixture.accounts.reader.uid, id = fixture.storyId;
  await fixture.db.doc(`stories/${id}`).update({ likedBy: [uid], likeCount: 1 });
  assert.equal(await hasStoryLike(db, id, uid), true);
  await setStoryLike(db, id, uid, false); assert.equal(await hasStoryLike(db, id, uid), false);
  await setStoryLike(db, id, uid, true); assert.equal(await hasStoryLike(db, id, uid), true);
  assert.equal((await fixture.db.doc(`stories/${id}`).get()).data()!.likeCount, 1);
  await setStoryLike(db, id, uid, false);
  await fixture.db.doc(`stories/${id}`).update({ likedBy: [], likeCount: 1 });
  await fixture.db.doc("storyLikes/old-random").set({ storyId: id, userId: uid });
  await setStoryLike(db, id, uid, false);
  assert.equal((await fixture.db.doc("storyLikes/old-random").get()).exists, false);
  assert.equal((await fixture.db.doc(`stories/${id}`).get()).data()!.likeCount, 0);
});
test("spoofed like identity is denied atomically and unpublished stories cannot gain likes", async () => {
  const { db } = clients[0], uid = fixture.accounts.reader.uid;
  await assert.rejects(setStoryLike(db, fixture.storyId, fixture.accounts.other.uid, true), /permission/i);
  assert.equal((await fixture.db.doc(`storyLikes/${fixture.storyId}_${fixture.accounts.other.uid}`).get()).exists, false);
  await assert.rejects(setStoryLike(db, `${fixture.storyId}_draft`, uid, true), /yayımlanmış/);
});
