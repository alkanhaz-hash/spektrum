/** Disposable Auth + Firestore fixtures. Explicit localhost/demo-only guard. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const projectId = "demo-spektrum-qa";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18081");
const authOrigin = "http://127.0.0.1:19099";
const env = await initializeTestEnvironment({ projectId, firestore: {
  host: "127.0.0.1", port: 18081,
  rules: await readFile(new URL("../../../artifacts/spektrum/firestore.rules", import.meta.url), "utf8"),
} });
try {
  await env.clearFirestore();
  const clearAuth = await fetch(`${authOrigin}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  assert.equal(clearAuth.ok, true);
  const users = {};
  for (const role of ["sender", "recipient"]) {
    const email = `qa-${role}@example.invalid`, password = `Disposable-qa-${role}-only-4719`;
    const result = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-spektrum-qa-key`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    assert.equal(result.ok, true);
    const { localId } = await result.json();
    assert.ok(localId);
    // Fixture setup only, not an application verification bypass. "owner" is
    // the Auth emulator's local admin marker, never a production credential.
    const verification = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-spektrum-qa-key`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId, emailVerified: true }),
    });
    assert.equal(verification.ok, true, "Disposable fixture email verification failed");
    users[role] = { uid: localId, email, password };
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "users", localId), {
        uid: localId, displayName: role === "recipient" ? "QA Alıcı" : "PRIVATE_SENDER_NAME",
        username: `fixture-${role}`, avatarUrl: "", bio: "Disposable emulator fixture",
        role: "user", banned: false, accountDeletionPending: false,
        createdAt: Timestamp.now(), storyCount: 0, followerCount: 0, followingCount: 0,
        followers: [], following: [],
      });
    });
  }
  const question = "Yazarken sana ne ilham verir? " + "q".repeat(220) + " QUESTION_END";
  const answer = ("Bir fikri farklı açılardan incelemek ve düzenli yazmak bana ilham verir. ").repeat(13) + " ANSWER_END";
  assert.ok(question.length <= 280 && answer.length <= 1000);
  await writeFile("/tmp/spektrum-qa-browser-fixture.json", JSON.stringify({ projectId, users, question, answer }, null, 2));
  console.log("Two disposable accounts seeded in demo-spektrum-qa; fixture saved in /tmp (no customer data).");
} finally { await env.cleanup(); }
