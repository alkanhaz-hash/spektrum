/**
 * Real Firestore Rules evaluation. No Firebase SDK mocks and no live project.
 * Start the isolated emulators using the package's emulator script first.
 */
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc, collection, setDoc, getDocFromServer, getDocsFromServer,
  updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp, query, where,
} from "firebase/firestore";

const PROJECT = "demo-spektrum-qa-rules";
const HOST = "127.0.0.1:18081";
const root = fileURLToPath(new URL("../../../", import.meta.url));
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, HOST, "Refusing to test without the explicit loopback emulator.");
let env;
const ids = { sender: "fixture-sender", recipient: "fixture-recipient", third: "fixture-third",
  guest: "fixture-guest", moderator: "fixture-moderator", admin: "fixture-admin" };
const db = role => role === "signedOut" ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(ids[role], {
    firebase: { sign_in_provider: role === "guest" ? "anonymous" : "password" },
  }).firestore();
const admin = fn => env.withSecurityRulesDisabled(context => fn(context.firestore()));
const questionRef = (store, id = "q") => doc(store, "anonymousQuestionsV2", id);
const identityRef = (store, id = "q") => doc(store, "anonymousQuestionIdentities", id);

async function seedQuestion(id = "q", answered = false) {
  await admin(async store => {
    await setDoc(questionRef(store, id), { targetUid: ids.recipient, question: "Fixture-only question",
      privacyVersion: 2, isAnswered: answered, createdAt: Timestamp.now(),
      ...(answered ? { answer: "Public fixture answer", answeredAt: Timestamp.now() } : {}) });
    await setDoc(identityRef(store, id), { senderUid: ids.sender, targetUid: ids.recipient, createdAt: Timestamp.now() });
  });
}

function submission(role = "sender", options = {}) {
  const store = db(role), id = options.id ?? "submitted";
  const batch = writeBatch(store);
  const targetUid = options.targetUid ?? ids.recipient;
  if (!options.omit?.includes("question")) batch.set(questionRef(store, id), {
    targetUid, question: "Emulator question", privacyVersion: 2, isAnswered: false,
    createdAt: serverTimestamp(), ...options.question,
  });
  if (!options.omit?.includes("identity")) batch.set(identityRef(store, id), {
    senderUid: ids[role], targetUid, createdAt: serverTimestamp(), ...options.identity,
  });
  if (!options.omit?.includes("rate")) batch.set(doc(store, "anonymousQuestionLimits", options.rateUid ?? ids[role]), {
    lastQuestionId: id, lastSentAt: serverTimestamp(), ...options.rate,
  });
  return batch.commit();
}

async function removePair(role) {
  const store = db(role), batch = writeBatch(store);
  batch.delete(questionRef(store)); batch.delete(identityRef(store));
  return batch.commit();
}

function migrate(apply = false, expectedStatus = 0) {
  // Deliberately DO NOT inherit service-account secrets or live Firebase config.
  const safeEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LD_LIBRARY_PATH", "PNPM_HOME"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx",
    "src/scripts/migrate-anonymous-questions.ts", ...(apply ? ["--apply"] : [])], {
    cwd: root, encoding: "utf8", timeout: 60_000,
    env: { ...safeEnv, NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: HOST,
      VITE_FIREBASE_PROJECT_ID: PROJECT, GCLOUD_PROJECT: PROJECT },
  });
  assert.equal(result.status, expectedStatus, `Migration CLI failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

describe("anonymous Q&A real Firestore emulator", { concurrency: false }, () => {
  before(async () => {
    env = await initializeTestEnvironment({ projectId: PROJECT,
      firestore: { host: "127.0.0.1", port: 18081,
        rules: await readFile(process.env.SPEKTRUM_QA_RULES_FILE
          || new URL("../../../artifacts/spektrum/firestore.rules", import.meta.url), "utf8") } });
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await admin(async store => {
      for (const role of ["sender", "recipient", "third", "moderator", "admin"]) {
        await setDoc(doc(store, "users", ids[role]), {
          displayName: role, role: ["moderator", "admin"].includes(role) ? role : "user",
          banned: false, accountDeletionPending: false,
        });
      }
    });
  });
  after(async () => { if (env) { await env.clearFirestore(); await env.cleanup(); } });

  for (const role of ["sender", "recipient", "third", "guest", "signedOut", "moderator", "admin"]) {
    it(`${role} cannot get/list/update private identity documents`, async () => {
      await seedQuestion();
      const store = db(role);
      await assertFails(getDocFromServer(identityRef(store)));
      await assertFails(getDocsFromServer(collection(store, "anonymousQuestionIdentities")));
      await assertFails(updateDoc(identityRef(store), { senderUid: ids.third }));
    });
    it(`${role} cannot access legacy records even if they claim privacyVersion 2`, async () => {
      await admin(store => setDoc(doc(store, "anonymousQuestions", "legacy"), {
        targetUid: ids.recipient, senderUid: ids.sender, privacyVersion: 2, isAnswered: true, answer: "Legacy",
      }));
      const ref = doc(db(role), "anonymousQuestions", "legacy");
      await assertFails(getDocFromServer(ref));
      await assertFails(getDocsFromServer(collection(db(role), "anonymousQuestions")));
      await assertFails(setDoc(ref, { question: "Forged" }));
      await assertFails(deleteDoc(ref));
    });
  }

  it("pending question is readable/listable only by recipient, including denial to sender", async () => {
    await seedQuestion();
    await assertSucceeds(getDocFromServer(questionRef(db("recipient"))));
    const filtered = role => query(collection(db(role), "anonymousQuestionsV2"),
      where("targetUid", "==", ids.recipient), where("isAnswered", "==", false), where("privacyVersion", "==", 2));
    await assertSucceeds(getDocsFromServer(filtered("recipient")));
    for (const role of ["sender", "third", "guest", "signedOut", "moderator", "admin"]) {
      await assertFails(getDocFromServer(questionRef(db(role))));
      await assertFails(getDocsFromServer(filtered(role)));
    }
  });

  it("answered records are public, contain no sender, and public queries must filter pending out", async () => {
    await seedQuestion("q", true); await seedQuestion("pending", false);
    for (const role of ["sender", "recipient", "third", "guest", "signedOut"]) {
      const result = await assertSucceeds(getDocFromServer(questionRef(db(role))));
      assert.deepEqual(Object.keys(result.data()).sort(),
        ["targetUid", "question", "answer", "privacyVersion", "isAnswered", "createdAt", "answeredAt"].sort());
      await assertSucceeds(getDocsFromServer(query(collection(db(role), "anonymousQuestionsV2"),
        where("targetUid", "==", ids.recipient), where("isAnswered", "==", true), where("privacyVersion", "==", 2))));
    }
    await assertFails(getDocsFromServer(collection(db("signedOut"), "anonymousQuestionsV2")));
  });

  for (const role of ["sender", "guest"]) it(`${role} can create exactly one atomic question/identity/rate trio`, async () => {
    await assertSucceeds(submission(role));
    await admin(async store => {
      assert.equal((await getDocFromServer(questionRef(store, "submitted"))).data().senderUid, undefined);
      assert.equal((await getDocFromServer(identityRef(store, "submitted"))).data().senderUid, ids[role]);
      assert.equal((await getDocFromServer(doc(store, "anonymousQuestionLimits", ids[role]))).data().lastQuestionId, "submitted");
    });
  });

  const invalid = [
    ["forged sender UID", { identity: { senderUid: ids.third } }],
    ["sender identity in public question", { question: { senderUid: ids.sender } }],
    ["additional public field", { question: { email: "fixture@example.invalid" } }],
    ["additional identity field", { identity: { name: "leaked" } }],
    ["additional rate field", { rate: { extra: true } }],
    ["no identity", { omit: ["identity"] }],
    ["no rate", { omit: ["rate"] }],
    ["only question", { omit: ["identity", "rate"] }],
    ["orphan identity", { omit: ["question", "rate"] }],
    ["orphan rate", { omit: ["question", "identity"] }],
    ["identity target mismatch", { identity: { targetUid: ids.third } }],
    ["fake creation timestamp", { question: { createdAt: Timestamp.fromMillis(0) } }],
    ["fake rate timestamp", { rate: { lastSentAt: Timestamp.fromMillis(0) } }],
    ["another user's rate record", { rateUid: ids.third }],
    ["self targeting", { targetUid: ids.sender }],
    ["missing recipient", { targetUid: "nonexistent-fixture" }],
    ["empty question", { question: { question: "" } }],
    ["281-character question", { question: { question: "x".repeat(281) } }],
    ["pre-answered submission", { question: { isAnswered: true, answer: "Forged" } }],
  ];
  for (const [label, options] of invalid) it(`rejects ${label} without partial writes`, async () => {
    await assertFails(submission("sender", options));
    await admin(async store => {
      for (const name of ["anonymousQuestionsV2", "anonymousQuestionIdentities", "anonymousQuestionLimits"]) {
        assert.equal((await getDocsFromServer(collection(store, name))).size, 0);
      }
    });
  });

  it("signed-out callers cannot submit without Firebase authentication", async () => {
    await assertFails(setDoc(questionRef(db("signedOut")), {
      targetUid: ids.recipient, question: "No auth", isAnswered: false, privacyVersion: 2, createdAt: serverTimestamp(),
    }));
  });

  it("accepts 280-character question and rejects reusing its identity", async () => {
    await assertSucceeds(submission("sender", { question: { question: "q".repeat(280) } }));
    await assertFails(submission("sender"));
  });

  for (const [age, allowed] of [[29, false], [30, true], [31, true]]) {
    it(`30-second limit at stored age ${age}s: ${allowed ? "accept" : "reject"}`, async () => {
      await admin(store => setDoc(doc(store, "anonymousQuestionLimits", ids.sender), {
        lastSentAt: Timestamp.fromMillis(Date.now() - age * 1000), lastQuestionId: "previous-fixture",
      }));
      await (allowed ? assertSucceeds(submission()) : assertFails(submission()));
    });
  }
  it("immediate second send is denied and other users cannot read rate records", async () => {
    await assertSucceeds(submission());
    await assertFails(submission("sender", { id: "too-soon" }));
    await assertSucceeds(getDocFromServer(doc(db("sender"), "anonymousQuestionLimits", ids.sender)));
    for (const role of ["recipient", "third", "signedOut"]) {
      await assertFails(getDocFromServer(doc(db(role), "anonymousQuestionLimits", ids.sender)));
    }
  });

  it("only recipient can answer; 1..1000 characters and server timestamp are mandatory", async () => {
    await seedQuestion();
    const answer = (role, patch) => updateDoc(questionRef(db(role)), {
      answer: "a".repeat(1000), isAnswered: true, answeredAt: serverTimestamp(), ...patch,
    });
    for (const role of ["sender", "third", "guest", "signedOut", "moderator"]) await assertFails(answer(role));
    for (const patch of [{ answer: "" }, { answer: "a".repeat(1001) },
      { answeredAt: Timestamp.fromMillis(0) }, { targetUid: ids.third }, { senderUid: ids.sender },
      { question: "rewritten" }, { isAnswered: false }]) await assertFails(answer("recipient", patch));
    await assertSucceeds(answer("recipient"));
  });

  it("recipient cannot retarget a pending or answered question", async () => {
    await seedQuestion(); await seedQuestion("answered", true);
    await assertFails(updateDoc(questionRef(db("recipient")), { targetUid: ids.third }));
    await assertFails(updateDoc(questionRef(db("recipient"), "answered"), { targetUid: ids.third }));
  });

  it("question cannot be deleted alone leaving identity behind", async () => {
    await seedQuestion();
    await assertFails(deleteDoc(questionRef(db("recipient"))));
  });
  it("identity cannot be deleted alone leaving question behind", async () => {
    await seedQuestion();
    await assertFails(deleteDoc(identityRef(db("recipient"))));
  });
  for (const role of ["recipient", "moderator", "admin"]) it(`${role} can atomically delete both documents`, async () => {
    await seedQuestion();
    await assertSucceeds(removePair(role));
    await admin(async store => {
      assert.equal((await getDocFromServer(questionRef(store))).exists(), false);
      assert.equal((await getDocFromServer(identityRef(store))).exists(), false);
    });
  });
  for (const role of ["sender", "third", "guest", "signedOut"]) it(`${role} cannot delete either side`, async () => {
    await seedQuestion();
    await assertFails(removePair(role));
  });

  it("real migration CLI dry run does not mutate legacy or V2", async () => {
    await admin(store => setDoc(doc(store, "anonymousQuestions", "old"), {
      senderUid: ids.sender, targetUid: ids.recipient, question: "Old question", isAnswered: false,
    }));
    migrate(false);
    await admin(async store => {
      assert.equal((await getDocFromServer(doc(store, "anonymousQuestions", "old"))).data().senderUid, ids.sender);
      assert.equal((await getDocFromServer(questionRef(store, "old"))).exists(), false);
    });
  });
  it("real migration CLI preserves a newer V2 answer and its identity", async () => {
    await seedQuestion("old", true);
    await admin(async store => {
      await updateDoc(questionRef(store, "old"), { answer: "NEW ANSWER MUST SURVIVE" });
      await setDoc(doc(store, "anonymousQuestions", "old"), {
        targetUid: ids.recipient, senderUid: ids.third, question: "Stale question",
        answer: "Stale answer", isAnswered: true,
      });
    });
    assert.match(migrate(true, 1), /"conflicts":1/);
    await admin(async store => {
      assert.equal((await getDocFromServer(questionRef(store, "old"))).data().answer, "NEW ANSWER MUST SURVIVE");
      assert.equal((await getDocFromServer(identityRef(store, "old"))).data().senderUid, ids.sender);
    });
  });
  it("real migration is idempotent, strips legacy identity and never invents missing identity", async () => {
    await admin(async store => {
      await setDoc(doc(store, "anonymousQuestions", "old"), {
        senderUid: ids.sender, targetUid: ids.recipient, question: "Migrated question", answer: "Migrated answer", isAnswered: true,
      });
      await setDoc(doc(store, "anonymousQuestions", "unknown"), {
        targetUid: ids.recipient, question: "Unknown sender", isAnswered: false,
      });
    });
    migrate(true); migrate(true);
    await admin(async store => {
      assert.equal((await getDocFromServer(questionRef(store, "old"))).data().answer, "Migrated answer");
      assert.equal((await getDocFromServer(doc(store, "anonymousQuestions", "old"))).data().senderUid, undefined);
      assert.equal((await getDocFromServer(identityRef(store, "unknown"))).exists(), false);
      assert.equal((await getDocsFromServer(collection(store, "anonymousQuestionsV2"))).size, 2);
    });
  });
});
