import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Write = { kind: string; collection: string; id: string; data?: Record<string, unknown> };
let writes: Write[] = [], commits = 0, updates: Write[] = [];
let guestSignIns = 0, moderationCalls = 0;
let commitError: Error | null = null;
let serverReadError: Error | null = null;
let stored: Record<string, unknown> | null = null;
let snapshotData: Record<string, unknown>[] = [];
let observedQuery: unknown[] = [];
let guestUser: { uid: string } | null = null;
const mainAuth = { currentUser: { uid: "internal-sender" } as { uid: string } | null };
const guestAuth = { get currentUser() { return guestUser; }, authStateReady: async () => {} };
const mainDb = { name: "main-db" }, guestDb = { name: "isolated-guest-db" };
const fakeApp = { options: { projectId: "test-project" } };
const ref = (db: unknown, name: string, id: string) => ({ db, collection: name, id });

mock.module("firebase/app", { namedExports: {
  getApp: () => fakeApp, initializeApp: () => fakeApp,
} });
mock.module("firebase/auth", { namedExports: {
  getAuth: () => guestAuth,
  signInAnonymously: async () => { guestSignIns++; guestUser = { uid: "isolated-guest" }; return { user: guestUser }; },
} });
mock.module("firebase/firestore", { namedExports: {
  collection: (db: unknown, name: string) => ({ db, name }),
  doc: (dbOrCollection: any, name?: string, id?: string) => name
    ? ref(dbOrCollection, name, id!) : ref(dbOrCollection.db, dbOrCollection.name, "random-question"),
  getFirestore: () => guestDb,
  serverTimestamp: () => "SERVER_TIMESTAMP",
  query: (...parts: unknown[]) => { observedQuery = parts; return parts; },
  where: (...parts: unknown[]) => parts,
  getDocFromServer: async () => {
    if (serverReadError) throw serverReadError;
    return { exists: () => !!stored, data: () => stored };
  },
  getDocs: async () => ({ docs: snapshotData.map((data, i) => ({ id: `q${i}`, data: () => data })) }),
  onSnapshot: (_q: unknown, success: any) => {
    success({ docs: snapshotData.map((data, i) => ({ id: `q${i}`, data: () => data })) });
    return () => {};
  },
  updateDoc: async (r: any, data: Record<string, unknown>) => { updates.push({ ...r, kind: "update", data }); },
  writeBatch: () => ({
    set: (r: any, data: Record<string, unknown>) => writes.push({ ...r, kind: "set", data }),
    delete: (r: any) => writes.push({ ...r, kind: "delete" }),
    commit: async () => { commits++; if (commitError) throw commitError; },
  }),
} });

const { createAnonymousQaService, publicQuestion, qaErrorMessage, isShareableQuestion } = await import("./index.ts");
const service = createAnonymousQaService(fakeApp as never, mainDb as never, mainAuth as never, async () => { moderationCalls++; });
beforeEach(() => {
  writes = []; updates = []; commits = 0; commitError = null; moderationCalls = 0;
  guestSignIns = 0; guestUser = null; mainAuth.currentUser = { uid: "internal-sender" };
  stored = null; snapshotData = []; observedQuery = [];
});

test("public payload strips identity and unknown metadata", () => {
  const safe = publicQuestion("q", { targetUid: "writer", question: "Soru", answer: "Cevap", isAnswered: true, senderUid: "hidden", email: "hidden", sender: { uid: "hidden" } });
  assert.deepEqual(Object.keys(safe).sort(), ["answer", "id", "isAnswered", "privacyVersion", "question", "targetUid"].sort());
  assert.ok(!JSON.stringify(safe).includes("hidden"));
});

test("send atomically stores public question, private identity and rate record", async () => {
  const id = await service.sendAnonymousQuestion("writer", "  Kitabın ne zaman?  ");
  assert.equal(id, "random-question"); assert.equal(commits, 1); assert.equal(moderationCalls, 1);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].data, { targetUid: "writer", question: "Kitabın ne zaman?", isAnswered: false, privacyVersion: 2, createdAt: "SERVER_TIMESTAMP" });
  assert.equal(writes[1].collection, "anonymousQuestionIdentities");
  assert.equal(writes[1].id, id); assert.equal(writes[1].data!.senderUid, "internal-sender");
  assert.equal(writes[2].collection, "anonymousQuestionLimits");
  assert.equal(writes[2].data!.lastQuestionId, id);
});

test("guest auth is isolated and does not sign in the main application", async () => {
  mainAuth.currentUser = null;
  await service.sendAnonymousQuestion("writer", "Misafir sorusu");
  assert.equal(mainAuth.currentUser, null); assert.equal(guestSignIns, 1);
  assert.equal(writes[0].db, guestDb);
  assert.equal(writes[1].data!.senderUid, "isolated-guest");
});

test("empty / oversized questions fail without writes", async () => {
  for (const text of [" ", "x".repeat(281)]) await assert.rejects(service.sendAnonymousQuestion("writer", text));
  assert.equal(commits, 0); assert.equal(writes.length, 0);
});

test("invalid target and self questions are rejected", async () => {
  await assert.rejects(service.sendAnonymousQuestion("bad/path", "Soru"));
  await assert.rejects(service.sendAnonymousQuestion("internal-sender", "Soru"));
  assert.equal(commits, 0);
});

test("moderation rejection prevents all records", async () => {
  const rejected = createAnonymousQaService(fakeApp as never, mainDb as never, mainAuth as never, async () => { throw new Error("Uygunsuz içerik"); });
  await assert.rejects(rejected.sendAnonymousQuestion("writer", "Soru"), /Uygunsuz/);
  assert.equal(writes.length, 0);
});

test("atomic commit failure is surfaced, not reported as success", async () => {
  commitError = new Error("permission-denied");
  await assert.rejects(service.sendAnonymousQuestion("writer", "Soru"), /permission-denied/);
  assert.equal(commits, 1);
});

test("answers are bounded and contain no sender metadata", async () => {
  await assert.rejects(service.answerQuestion("q", " "));
  await assert.rejects(service.answerQuestion("q", "x".repeat(1001)));
  await service.answerQuestion("q", " Cevap ");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].data, { answer: "Cevap", isAnswered: true, answeredAt: "SERVER_TIMESTAMP" });
});

test("delete removes public question and private identity in one batch", async () => {
  await service.deleteQuestion("q");
  assert.equal(commits, 1);
  assert.deepEqual(writes.map(w => [w.kind, w.collection, w.id]), [
    ["delete", "anonymousQuestionsV2", "q"], ["delete", "anonymousQuestionIdentities", "q"],
  ]);
});

test("public answer route refuses missing, unanswered and legacy documents", async () => {
  assert.equal(await service.getPublicAnsweredQuestion("q"), null);
  stored = { targetUid: "writer", question: "Özel", privacyVersion: 2, isAnswered: false };
  assert.equal(await service.getPublicAnsweredQuestion("q"), null);
  stored = { targetUid: "writer", question: "Eski", isAnswered: true, senderUid: "hidden" };
  assert.equal(await service.getPublicAnsweredQuestion("q"), null);
});

test("sharing requires a public answer with valid bounded content", async () => {
  const valid = { id: "q", targetUid: "writer", question: "Soru", answer: "Cevap", privacyVersion: 2 as const, isAnswered: true };
  assert.equal(isShareableQuestion(valid), true);
  for (const invalid of [
    { ...valid, isAnswered: false }, { ...valid, answer: undefined },
    { ...valid, answer: " " }, { ...valid, answer: "x".repeat(1001) },
    { ...valid, question: " " }, { ...valid, question: "x".repeat(281) },
    { ...valid, targetUid: "bad/path" },
  ]) {
    assert.equal(isShareableQuestion(invalid), false);
    stored = invalid;
    assert.equal(await service.getPublicAnsweredQuestion("q"), null);
  }
});

test("public answer never includes sender even if source has extra fields", async () => {
  stored = { targetUid: "writer", question: "Soru", answer: "Cevap", privacyVersion: 2, isAnswered: true, senderUid: "hidden" };
  const q = await service.getPublicAnsweredQuestion("q");
  assert.equal(q!.answer, "Cevap"); assert.ok(!JSON.stringify(q).includes("hidden"));
});

test("public answer validation refuses offline cache fallback", async () => {
  stored = { targetUid: "writer", question: "Soru", answer: "Cevap", isAnswered: true, privacyVersion: 2 };
  serverReadError = new Error("Server unavailable");
  try {
    await assert.rejects(service.getPublicAnsweredQuestion("q"), /Server unavailable/);
  } finally {
    serverReadError = null;
  }
});

test("queries enforce privacy version and answer state", async () => {
  await service.getAnsweredQuestions("writer");
  assert.deepEqual(observedQuery.slice(1), [
    ["targetUid", "==", "writer"], ["isAnswered", "==", true], ["privacyVersion", "==", 2],
  ]);
  await service.getUnansweredQuestions("writer");
  assert.deepEqual(observedQuery[2], ["isAnswered", "==", false]);
});

test("realtime results whitelist identity and support unsubscribe", () => {
  snapshotData = [{ targetUid: "writer", question: "Soru", isAnswered: true, senderUid: "hidden" }];
  let result: unknown;
  const stop = service.listenAnsweredQuestions("writer", items => { result = items; });
  assert.equal(typeof stop, "function"); assert.ok(!JSON.stringify(result).includes("hidden"));
  stop();
});

test("configuration, rate and network errors are explicit", () => {
  assert.match(qaErrorMessage({ code: "auth/operation-not-allowed" }), /Misafir/);
  assert.match(qaErrorMessage({ code: "permission-denied" }), /30 saniye/);
  assert.match(qaErrorMessage({ code: "unavailable" }), /Bağlantı/);
});
