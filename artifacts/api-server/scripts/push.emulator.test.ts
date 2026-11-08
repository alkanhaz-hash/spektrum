import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import express from "express";
import { createRequire } from "node:module";
import { Timestamp } from "firebase-admin/firestore";
import { createFixture } from "./weekly-voting-fixture.mjs";
import pushRouter from "../src/routes/push";
import { registerDevice, revokeDevice, defaults, hash } from "@workspace/push-notifications/server";
import { deliver, enqueue, fanout, resolve, messageFor } from "@workspace/push-notifications/delivery";
const { pushDestination } = createRequire(import.meta.url)("../../spektrum-mobile/lib/push-routing.ts");

let f: any, server: any, base: string;
const installationId = "a".repeat(32), revokeSecret = "b".repeat(64);
const token = "disposable-fake-device-token-never-sent";
let revision = 100;
function input(id = installationId, value = token) {
  return { installationId: id, revokeSecret, revision: ++revision, token: value, platform: "android" as const, preferences: defaults };
}
before(async () => {
  process.env.SPEKTRUM_PUSH_DELIVERY_ENABLED = "true";
  f = await createFixture();
  const app = express(); app.use(express.json(), pushRouter);
  server = await new Promise<any>(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise<void>(r => server.close(() => r()));
  if (f) await f.close();
});
async function http(path: string, method: string, body?: unknown, role?: string) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function enable(role: string, id: string) { return registerDevice(f.db, f.accounts[role].uid, input(id)); }
async function message(id: string) {
  const reader = f.accounts.reader.uid, writer = f.accounts.writer.uid;
  await f.db.doc("conversations/push_conv").set({ participants: [reader, writer] });
  await f.db.doc(`messages/${id}`).set({ conversationId: "push_conv", senderId: reader, text: "PRIVATE_MESSAGE_MUST_NOT_LEAK", createdAt: Timestamp.now() });
  return { source: "messages" as const, sourceId: id, recipientId: writer, kind: "messages" as const };
}
test("registry requires active auth, rejects spoofing and never returns tokens or secrets", async () => {
  assert.equal((await http("/push/device", "PUT", input())).status, 401);
  process.env.SPEKTRUM_PUSH_DELIVERY_ENABLED = "false";
  assert.equal((await http("/push/device", "PUT", input(), "writer")).status, 503);
  process.env.SPEKTRUM_PUSH_DELIVERY_ENABLED = "true";
  assert.equal((await http("/push/device", "PUT", { ...input(), uid: "forged" }, "writer")).status, 400);
  assert.equal((await http("/push/device", "PUT", input(), "writer")).status, 200);
  const own = await (await http(`/push/device?installationId=${installationId}`, "GET", undefined, "writer")).json();
  assert.equal(own.enabled, true); assert.equal(JSON.stringify(own).includes(token), false); assert.equal("revokeSecret" in own, false);
  const other = await (await http(`/push/device?installationId=${installationId}`, "GET", undefined, "other")).json();
  assert.equal(other.registered, false);
});
test("rotation is idempotent, install secret prevents hijacking, revocation fences delayed registration", async () => {
  const body = input(installationId, "rotated-disposable-fake-device-token");
  await registerDevice(f.db, f.accounts.writer.uid, body);
  await registerDevice(f.db, f.accounts.writer.uid, body);
  assert.equal((await f.db.collection("pushDevices").where("uid", "==", f.accounts.writer.uid).get()).size, 1);
  await assert.rejects(registerDevice(f.db, f.accounts.other.uid, { ...input(), revokeSecret: "c".repeat(64) }), /eşleşmiyor/);
  await revokeDevice(f.db, installationId, "c".repeat(64), ++revision);
  assert.equal((await f.db.doc(`pushDevices/${installationId}`).get()).data().token, body.token);
  const disabledRevision = ++revision;
  await revokeDevice(f.db, installationId, revokeSecret, disabledRevision);
  const disabled = (await f.db.doc(`pushDevices/${installationId}`).get()).data();
  assert.equal(disabled.uid, undefined); assert.equal(disabled.token, undefined);
  await assert.rejects(registerDevice(f.db, f.accounts.writer.uid, body), /yeni cihaz/);
  await registerDevice(f.db, f.accounts.other.uid, input());
  assert.equal((await f.db.doc(`pushDevices/${installationId}`).get()).data().uid, f.accounts.other.uid);
  await revokeDevice(f.db, installationId, revokeSecret, ++revision);
});
test("all client roles are denied raw device and delivery records", async () => {
  await enable("writer", installationId);
  for (const role of ["writer", "reader", "other", null]) {
    for (const collection of ["pushDevices", "pushQueue", "pushDeliveries", "pushRateLimits"]) {
      const url = `http://127.0.0.1:18081/v1/projects/demo-spektrum-qa/databases/(default)/documents/${collection}/${installationId}`;
      const response = await fetch(url, { headers: role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {} });
      assert.equal(response.status, 403, `${role}/${collection}`);
    }
  }
});
test("message recipient comes from conversation; blocked and outsider requests cannot send", async () => {
  const job = await message("push_message");
  const content = await resolve(f.db, job); assert.equal(content?.mode, "message");
  assert.equal(await resolve(f.db, { ...job, recipientId: f.accounts.other.uid }), null);
  const payload = messageFor(job.recipientId, token, "event-tag", content!);
  assert.equal(JSON.stringify(payload).includes("PRIVATE_MESSAGE"), false);
  assert.equal(JSON.stringify(payload).includes(f.accounts.reader.uid), false);
  await f.db.doc(`blocks/${job.recipientId}_${f.accounts.reader.uid}`).set({ blockerId: job.recipientId, blockedId: f.accounts.reader.uid });
  assert.equal(await resolve(f.db, job), null);
  await f.db.doc(`blocks/${job.recipientId}_${f.accounts.reader.uid}`).delete();
});
test("queue retries deduplicate, preferences and server throttling are enforced", async () => {
  const job = await message("push_deliver"), now = Date.now();
  await enqueue(f.db, job, now); await enqueue(f.db, job, now);
  const id = hash(`${job.source}:${job.sourceId}:${job.kind}:${job.recipientId}`);
  const queue = await f.db.doc(`pushQueue/${id}`).get(); assert.equal(queue.exists, true);
  const sent: any[] = [], provider = { send: async (m: any) => { sent.push(m); return "fake-provider-ack"; } };
  await deliver(f.db, provider, id, queue.data(), now);
  await deliver(f.db, provider, id, queue.data(), now);
  assert.equal(sent.length, 1);
  const second = await message("push_deliver_second"); await enqueue(f.db, second, now);
  const id2 = hash(`${second.source}:${second.sourceId}:${second.kind}:${second.recipientId}`);
  await deliver(f.db, provider, id2, (await f.db.doc(`pushQueue/${id2}`).get()).data(), now);
  assert.equal(sent.length, 1);
  await f.db.doc(`pushDevices/${installationId}`).update({ "preferences.messages": false });
  await deliver(f.db, provider, "new-event-after-pref-disabled", queue.data(), now + 20_000);
  assert.equal(sent.length, 1);
  await f.db.doc(`pushDevices/${installationId}`).update({ "preferences.messages": true });
});
test("temporary provider failure retries; invalid old token cannot delete rotated registration", async () => {
  const job = await message("push_retry"), now = Date.now() + 40_000;
  const row = { ...job, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(now + 100000) };
  await assert.rejects(deliver(f.db, { send: async () => { throw { code: "messaging/server-unavailable" }; } }, "retry-event", row, now), /TEMPORARY/);
  let sends = 0;
  await deliver(f.db, { send: async () => { sends++; return "ack"; } }, "retry-event", row, now);
  assert.equal(sends, 1);
  await deliver(f.db, { send: async () => {
    await f.db.doc(`pushDevices/${installationId}`).update({ token: "new-token-after-rotation" });
    throw { code: "messaging/registration-token-not-registered" };
  } }, "invalid-event", row, now + 20_000);
  assert.equal((await f.db.doc(`pushDevices/${installationId}`).get()).data().token, "new-token-after-rotation");
});
test("new chapter goes only to bookmarked books, suppresses repeat publication and drafts", async () => {
  await enable("reader", "c".repeat(32));
  await f.db.doc(`bookmarks/${f.accounts.reader.uid}_${f.storyId}`).set({ userId: f.accounts.reader.uid, storyId: f.storyId });
  await f.db.doc("chapters/push_chapter").set({ storyId: f.storyId, status: "published" });
  await fanout(f.db, "chapters", "push_chapter", Date.now());
  const jobs = await f.db.collection("pushQueue").where("sourceId", "==", "push_chapter").get();
  assert.equal(jobs.size, 1);
  await fanout(f.db, "chapters", "push_chapter", Date.now()); assert.equal((await f.db.collection("pushQueue").where("sourceId", "==", "push_chapter").get()).size, 1);
  await f.db.doc("chapters/push_chapter").update({ status: "draft" });
  assert.equal(await resolve(f.db, jobs.docs[0].data()), null);
});
test("comments notify author and earlier thread participants, not unrelated users", async () => {
  await enable("writer", installationId); await enable("other", "d".repeat(32));
  await f.db.doc("chapters/push_comments_chapter").set({ storyId: f.storyId, status: "published" });
  const common = { storyId: f.storyId, chapterId: "push_comments_chapter", paragraphIndex: 1, paragraphAnchor: "fixture-thread" };
  await f.db.doc("inlineComments/push_old_comment").set({ ...common, authorId: f.accounts.other.uid, createdAt: Timestamp.fromMillis(Date.now() - 2000) });
  await f.db.doc("inlineComments/push_new_comment").set({ ...common, authorId: f.accounts.reader.uid, createdAt: Timestamp.now() });
  await fanout(f.db, "inlineComments", "push_new_comment", Date.now());
  const rows = await f.db.collection("pushQueue").where("sourceId", "==", "push_new_comment").get();
  assert.deepEqual(rows.docs.map((d: any) => d.data().recipientId).sort(), [f.accounts.writer.uid, f.accounts.other.uid].sort());
  assert.equal(await resolve(f.db, { source: "inlineComments", sourceId: "push_new_comment", recipientId: f.accounts.unverified.uid, kind: "comments" }), null);
});
test("anonymous question and answer route correctly without exposing sender identity or content", async () => {
  const question = "push_question";
  await f.db.doc(`anonymousQuestionsV2/${question}`).set({ targetUid: f.accounts.writer.uid, privacyVersion: 2, isAnswered: false, question: "PRIVATE_QUESTION_TEXT" });
  await f.db.doc(`anonymousQuestionIdentities/${question}`).set({ targetUid: f.accounts.writer.uid, senderUid: f.accounts.reader.uid });
  const pending = { source: "anonymousQuestionsV2" as const, sourceId: question, kind: "qa" as const, recipientId: f.accounts.writer.uid };
  const content = await resolve(f.db, pending); assert.equal(content?.mode, "question");
  const payload = messageFor(pending.recipientId, token, "qa", content!);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(f.accounts.reader.uid), false); assert.equal(serialized.includes("PRIVATE_QUESTION"), false);
  await f.db.doc(`anonymousQuestionsV2/${question}`).update({ isAnswered: true, answer: "PRIVATE_ANSWER_TEXT" });
  const answer = await resolve(f.db, { ...pending, recipientId: f.accounts.reader.uid });
  assert.equal(answer?.mode, "answer"); assert.equal(answer?.targetId, question);
  assert.equal(await resolve(f.db, { ...pending, recipientId: f.accounts.other.uid }), null);
});
test("stale jobs and frozen/deleted accounts do not receive; deep links reject cross-account/arbitrary paths", async () => {
  const job = await message("push_frozen"), now = Date.now(); let count = 0;
  const provider = { send: async () => { count++; return "ack"; } };
  const row = { ...job, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(now + 100000) };
  await f.db.doc(`users/${job.recipientId}`).update({ accountFrozen: true });
  await deliver(f.db, provider, "frozen-event", row); assert.equal(count, 0);
  await f.db.doc(`users/${job.recipientId}`).update({ accountFrozen: false });
  await deliver(f.db, provider, "expired-event", { ...row, expiresAt: Timestamp.fromMillis(now - 1) }); assert.equal(count, 0);
  const account = hash(job.recipientId);
  assert.deepEqual(pushDestination({ version: "1", account, mode: "message", targetId: "conv_123" }, account), { screen: "chat", id: "conv_123" });
  assert.equal(pushDestination({ version: "1", account: "other", mode: "message", targetId: "conv" }, account), null);
  assert.equal(pushDestination({ version: "1", account, mode: "message", targetId: "https://evil.test" }, account), null);
  assert.equal(pushDestination({ version: "1", account, mode: "__proto__", targetId: "a" }, account), null);
});
