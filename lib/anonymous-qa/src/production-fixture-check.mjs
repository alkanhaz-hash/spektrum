/**
 * Real SDK smoke test against explicitly provisioned disposable live accounts.
 * Never discovers customers or sends questions to non-fixture profiles.
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { initializeApp, deleteApp, getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDocFromServer, deleteDoc, setLogLevel, terminate } from "firebase/firestore";
import { createAnonymousQaService } from "./index.ts";

assert.ok(process.argv[2]?.startsWith("/tmp/spektrum-live-qa-"));
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
const path = process.argv[2], fixture = JSON.parse(await readFile(path, "utf8"));
assert.equal(fixture.projectId, "spektrum-5c7cc");
assert.equal(fixture.appConfig.projectId, fixture.projectId);
for (const user of Object.values(fixture.users)) assert.ok(user.uid.startsWith(`qa_fixture_${fixture.run}_`));
const apps = [], checks = [];
const record = label => { checks.push(label); console.log(JSON.stringify({ passed: label })); };
setLogLevel("silent");

const app = name => {
  const value = initializeApp(fixture.appConfig, `qa-live-${fixture.run}-${name}`);
  apps.push(value);
  return value;
};
async function denied(operation) {
  await assert.rejects(operation, error => error?.code === "permission-denied");
}
async function moderate(text) {
  const response = await fetch("https://spektrumapp.com.tr/api/moderation/text", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "tr" }),
  });
  assert.equal(response.ok, true);
  assert.notEqual((await response.json()).action, "rejected");
}
const service = value => createAnonymousQaService(value, getFirestore(value), getAuth(value), moderate);

async function main() {
  const sender = app("sender"), recipient = app("recipient"), visitor = app("visitor");
  for (const [value, role] of [[sender, "sender"], [recipient, "recipient"]]) {
    const user = fixture.users[role];
    assert.equal((await signInWithEmailAndPassword(getAuth(value), user.email, user.password)).user.emailVerified, true);
  }
  record("disposable verified-email sign-in");
  const send = service(sender), receive = service(recipient), publicService = service(visitor);
  const target = fixture.users.recipient.uid, id = fixture.ids.signed;
  const question = "Bu yalnızca SPEKTRUM sistem doğrulaması için geçici bir test sorusudur.";
  // A newly activated Rules release can take time to propagate to new requests.
  for (let attempt = 0; ; attempt++) {
    try { await send.sendAnonymousQuestion(target, question, id); break; }
    catch (error) {
      if (error?.code !== "permission-denied" || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, [5000, 10000, 15000][attempt]));
    }
  }
  record("signed-in question submission using real shared service");
  await denied(send.sendAnonymousQuestion(target, "İkinci geçici hız sınırı denemesi.", fixture.ids.rate));
  record("immediate second question rejected");
  await denied(getDocFromServer(doc(getFirestore(visitor), "anonymousQuestionsV2", id)));
  await denied(getDocFromServer(doc(getFirestore(sender), "anonymousQuestionsV2", id)));
  const pending = (await getDocFromServer(doc(getFirestore(recipient), "anonymousQuestionsV2", id))).data();
  assert.equal(pending.question, question);
  assert.equal(pending.isAnswered, false);
  assert.ok(!("senderUid" in pending));
  record("pending question recipient-only with no sender field");
  for (const value of [sender, recipient, visitor]) {
    await denied(getDocFromServer(doc(getFirestore(value), "anonymousQuestionIdentities", id)));
  }
  record("identity denied to sender recipient and signed-out visitor");
  await denied(deleteDoc(doc(getFirestore(recipient), "anonymousQuestionsV2", id)));
  record("question-only deletion rejected");
  const answer = "Bu geçici cevap yalnızca güvenli soru-cevap akışının doğrulanması içindir.";
  await receive.answerQuestion(id, answer);
  const publicQuestion = await publicService.getPublicAnsweredQuestion(id);
  assert.equal(publicQuestion.question, question);
  assert.equal(publicQuestion.answer, answer);
  assert.equal(publicQuestion.isAnswered, true);
  for (const key of ["senderUid", "email", "senderEmail", "displayName"]) assert.ok(!(key in publicQuestion));
  record("answered question publicly readable without sender identity");
  assert.equal(getAuth(visitor).currentUser, null);
  try {
    await publicService.sendAnonymousQuestion(target, "Bu da yalnızca geçici misafir gönderim testidir.", fixture.ids.guest);
  } finally {
    // Persist only the disposable anonymous UID immediately for guaranteed cleanup.
    let guest;
    try {
      const guestApp = getApp("spektrum-qa-guest");
      if (!apps.includes(guestApp)) apps.push(guestApp);
      guest = getAuth(guestApp).currentUser;
    } catch {}
    if (guest) {
      fixture.guestUid = guest.uid;
      await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    }
  }
  assert.ok(fixture.guestUid);
  assert.equal(getAuth(visitor).currentUser, null);
  const guestApp = getApp("spektrum-qa-guest");
  assert.equal(getAuth(guestApp).currentUser.isAnonymous, true);
  const guestQuestion = (await getDocFromServer(doc(getFirestore(recipient), "anonymousQuestionsV2", fixture.ids.guest))).data();
  assert.equal(guestQuestion.isAnswered, false);
  assert.ok(!("senderUid" in guestQuestion));
  await denied(getDocFromServer(doc(getFirestore(guestApp), "anonymousQuestionIdentities", fixture.ids.guest)));
  await denied(getDocFromServer(doc(getFirestore(recipient), "anonymousQuestionIdentities", fixture.ids.guest)));
  record("guest submission works with separate anonymous session and private identity");
  await receive.deleteQuestion(id);
  await receive.deleteQuestion(fixture.ids.guest);
  // Admin-side verification below uses only our known disposable IDs.
  record("recipient batch deletion succeeds for both disposable questions");
  await writeFile(join(dirname(path), "result.json"), JSON.stringify({ checks, passed: checks.length }), { mode: 0o600 });
}

try { await main(); }
catch (error) {
  const code = typeof error?.code === "string" && /^[a-z0-9_/-]{1,80}$/.test(error.code) ? error.code : "verification-failed";
  console.error(JSON.stringify({ failedAfter: checks.length, code }));
  process.exitCode = 1;
} finally {
  for (const value of apps) {
    await signOut(getAuth(value)).catch(() => {});
    await terminate(getFirestore(value)).catch(() => {});
    await deleteApp(value).catch(() => {});
  }
}
