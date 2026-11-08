import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createFixture } from "../../../artifacts/api-server/scripts/weekly-voting-fixture.mjs";
import readingRouter from "../../../artifacts/api-server/src/routes/reading-analytics";
import { recordReading, readingReport } from "../../../artifacts/api-server/src/lib/reading-analytics";
const express = createRequire(new URL("../../../artifacts/api-server/package.json", import.meta.url))("express");

let f: any, server: any, base: string;
const c1 = "reading_test_c1", c2 = "reading_test_c2";
before(async () => {
  f = await createFixture();
  for (const [id, order, status] of [[c1, 1, "published"], [c2, 2, "published"], ["reading_test_draft", 3, "draft"]] as const) {
    await f.db.doc(`chapters/${id}`).set({ storyId: f.storyId, title: `Bölüm ${order}`, content: "Yalnız izole test metni.", order, status });
  }
  const app = express();
  app.use(express.json(), (req: any, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", readingRouter);
  server = await new Promise<any>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/reading-analytics`;
});
after(async () => {
  if (server) await new Promise<void>(r => server.close(() => r()));
  if (f) await f.close();
});
function input(visit = "a".repeat(24), chapterId = c1) {
  return { storyId: f.storyId, chapterId, visitId: visit, progress: 10, activeSeconds: 0 };
}
async function post(body: any, role?: string) {
  return fetch(`${base}/observations`, { method: "POST", headers: {
    "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {}),
  }, body: JSON.stringify(body) });
}
test("guest observations persist once without account, email or IP identifiers", async () => {
  assert.equal((await post(input())).status, 200);
  assert.equal((await post(input())).status, 200);
  const docs = await f.db.collection(`readingAnalytics/${f.storyId}/sessions`).get();
  assert.equal(docs.size, 1);
  assert.deepEqual(Object.keys(docs.docs[0].data()).sort(), ["activeSeconds", "chapterId", "expiresAt", "progress", "startedAt", "updatedAt", "visitId"]);
});
test("owner reading is excluded and malformed, spoofed or draft observations are rejected", async () => {
  assert.deepEqual(await (await post(input("b".repeat(24)), "writer")).json(), { accepted: false });
  assert.equal((await post({ ...input(), readerUid: f.accounts.writer.uid })).status, 400);
  assert.equal((await post({ ...input(), progress: 101 })).status, 400);
  assert.equal((await post({ ...input(), activeSeconds: -1 })).status, 400);
  assert.equal((await post(input("c".repeat(24), "reading_test_draft"))).status, 404);
  assert.equal((await post({ ...input(), storyId: `${f.storyId}_draft` })).status, 404);
});
test("server clock bounds active time; concurrency and stale retries never regress or duplicate", async () => {
  const now = Date.now(), data = { ...input("d".repeat(24)), progress: 80, activeSeconds: 1000 };
  await recordReading(f.db, null, data, now);
  const id = createHash("sha256").update(`${data.visitId}:${data.chapterId}`).digest("hex");
  const ref = f.db.doc(`readingAnalytics/${f.storyId}/sessions/${id}`);
  assert.equal((await ref.get()).data().activeSeconds, 0);
  await Promise.all([recordReading(f.db, null, { ...data, progress: 100 }, now + 15000), recordReading(f.db, null, { ...data, progress: 90 }, now + 15000)]);
  const result = (await ref.get()).data();
  assert.equal(result.progress, 100); assert.equal(result.activeSeconds, 15);
  await recordReading(f.db, null, { ...data, progress: 20, activeSeconds: 0 }, now + 20000);
  assert.equal((await ref.get()).data().activeSeconds, 15);
});
test("only an active author can fetch aggregate reports; authentication is not silently downgraded", async () => {
  assert.equal((await fetch(`${base}/report?storyId=${f.storyId}`)).status, 401);
  assert.equal((await fetch(`${base}/report?storyId=${f.storyId}`, { headers: { Authorization: `Bearer ${f.accounts.other.token}` } })).status, 404);
  assert.equal((await fetch(`${base}/report?storyId=${f.storyId}&days=8`, { headers: { Authorization: `Bearer ${f.accounts.writer.token}` } })).status, 400);
  const response = await fetch(`${base}/report?storyId=${f.storyId}&days=30`, { headers: { Authorization: `Bearer ${f.accounts.writer.token}` } });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.chapters.length, 2);
  assert.ok(!JSON.stringify(report).includes("visitId"));
  assert.equal((await fetch(`${base}/observations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer invalid" }, body: JSON.stringify(input()) })).status, 401);
});
test("raw telemetry is denied to owner, reader, third-party and guest Firestore clients", async () => {
  const docs = await f.db.collection(`readingAnalytics/${f.storyId}/sessions`).get();
  const url = `http://127.0.0.1:18081/v1/projects/demo-spektrum-qa/databases/(default)/documents/${docs.docs[0].ref.path}`;
  for (const role of ["writer", "reader", "other", null]) {
    const response = await fetch(url, { headers: role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {} });
    assert.equal(response.status, 403, String(role));
  }
});
test("a real report distinguishes 24-hour unfinished observations from recent and completed reading", async () => {
  const now = Date.now(), old = now - 2 * 86400_000;
  await recordReading(f.db, null, input("e".repeat(24)), old);
  await recordReading(f.db, null, { ...input("e".repeat(24)), progress: 40, activeSeconds: 20 }, old + 20000);
  await recordReading(f.db, null, input("f".repeat(24)), old);
  await recordReading(f.db, null, { ...input("f".repeat(24)), progress: 100, activeSeconds: 20 }, old + 20000);
  const report = await readingReport(f.db, f.accounts.writer.uid, f.storyId, 30, now);
  assert.ok(report.staleCount >= 1); assert.ok(report.completedCount >= 1);
  assert.ok(report.chapters[0].exit25to49 >= 1);
  await f.db.doc(`users/${f.accounts.writer.uid}`).update({ accountFrozen: true });
  await assert.rejects(readingReport(f.db, f.accounts.writer.uid, f.storyId, 30), (e: any) => e.status === 403);
  await f.db.doc(`users/${f.accounts.writer.uid}`).update({ accountFrozen: false });
});
