/**
 * Operator-only, narrowly scoped Firebase repair. Run with tsx.
 * plan -> test -> apply --confirm-spektrum-qa
 * Credentials/tokens are never printed or included in release evidence.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { getApp } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "../src/lib/firebase-admin.ts";
import { buildQaPatch, withoutQa, digest } from "./qa-rules-patch.mjs";

const PROJECT = "spektrum-5c7cc";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUTPUT = join(ROOT, "generated-artifacts/qa-production-release");
const LOCAL = join(ROOT, "artifacts/spektrum/firestore.rules");
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`;
let stage = "initialization";
class SafeError extends Error {}
const requireCondition = (value, message) => { if (!value) throw new SafeError(message); };
const canonical = value => JSON.stringify(value, (_, x) => x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const otherSignInHash = config => digest(canonical(Object.fromEntries(
  Object.entries(config.signIn ?? {}).filter(([key]) => key !== "anonymous"))));
const save = (dir, name, value) => writeFile(join(dir, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });

async function api(host, path, method = "GET", body) {
  const credential = getApp().options.credential;
  requireCondition(credential, "Firebase credential unavailable.");
  const token = await credential.getAccessToken();
  const response = await fetch(`https://${host}/${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const status = /^[A-Z_]+$/.test(data.error?.status ?? "") ? data.error.status : "API_ERROR";
    throw new SafeError(`${stage}: HTTP ${response.status} ${status}`);
  }
  return data;
}
const getRelease = () => api("firebaserules.googleapis.com", `v1/${RELEASE}`);
const getConfig = () => api("identitytoolkit.googleapis.com", `admin/v2/projects/${PROJECT}/config`);
async function getSource(release) {
  requireCondition(release.rulesetName?.startsWith(`projects/${PROJECT}/rulesets/`), "Unexpected ruleset.");
  const data = await api("firebaserules.googleapis.com", `v1/${release.rulesetName}`);
  requireCondition(data.source?.files?.length === 1, "Multi-file rules need manual review.");
  return data.source.files[0];
}
const switchRelease = rulesetName => api("firebaserules.googleapis.com", `v1/${RELEASE}`, "PATCH", {
  release: { name: RELEASE, rulesetName }, updateMask: "rulesetName",
});
const setAnonymous = enabled => api("identitytoolkit.googleapis.com",
  `admin/v2/projects/${PROJECT}/config?updateMask=signIn.anonymous.enabled`, "PATCH",
  { name: `projects/${PROJECT}/config`, signIn: { anonymous: { enabled } } });

async function plan(dir) {
  stage = "read-only-backup";
  const [release, config] = await Promise.all([getRelease(), getConfig()]);
  const source = await getSource(release);
  const candidate = buildQaPatch(source.content, await readFile(LOCAL, "utf8"));
  const legacy = (await adminDb().collection("anonymousQuestions").count().get()).data().count;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "before.rules"), source.content);
  await writeFile(join(dir, "candidate.rules"), candidate);
  const record = {
    project: PROJECT, createdAt: new Date().toISOString(), originalRelease: release,
    sourceName: source.name, beforeHash: digest(source.content), candidateHash: digest(candidate),
    unrelatedRulesHash: digest(withoutQa(source.content)), legacyCount: legacy,
    anonymousBefore: config.signIn?.anonymous?.enabled === true,
    otherSignInHash: otherSignInHash(config), status: "prepared",
  };
  await save(dir, "receipt.json", record);
  console.log(JSON.stringify({ directory: dir, status: record.status, legacyCount: legacy,
    unrelatedRulesPreserved: withoutQa(source.content) === withoutQa(candidate) }));
  // Existing records are migrated with the transaction-safe, idempotent tool
  // during apply, before access to the legacy collection is closed.
}

async function migrateExisting(dir, record) {
  stage = "legacy-migration";
  for (const apply of [false, true]) {
    const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx",
      "src/scripts/migrate-anonymous-questions.ts", ...(apply ? ["--apply"] : [])], {
      cwd: ROOT, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024,
    });
    const line = (result.stdout ?? "").split("\n").find(value => value.startsWith('{"mode":'));
    requireCondition(result.status === 0 && line, "Existing questions need manual migration review; release not activated.");
    const summary = JSON.parse(line);
    requireCondition(summary.skippedInvalid === 0 && summary.conflicts === 0,
      "Legacy migration has conflicts; refusing to overwrite existing answers.");
    record[apply ? "migration" : "migrationDryRun"] = summary;
    await save(dir, "receipt.json", record);
  }
  const legacy = await adminDb().collection("anonymousQuestions").select("qaMigrationComplete").get();
  requireCondition(legacy.docs.every(doc => doc.get("qaMigrationComplete") === true),
    "Some legacy records are not safely migrated; release stopped.");
}

async function test(dir, record) {
  stage = "isolated-emulator-test";
  const candidate = await readFile(join(dir, "candidate.rules"), "utf8");
  requireCondition(digest(candidate) === record.candidateHash, "Candidate changed since preparation.");
  const safeEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LD_LIBRARY_PATH", "PNPM_HOME", "JAVA_HOME"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const result = spawnSync("pnpm", ["--filter", "@workspace/anonymous-qa", "exec", "firebase",
    "emulators:exec", "--project", "demo-spektrum-qa", "--config", "../../firebase.qa-emulator.json",
    "--only", "auth,firestore", "node --test --test-reporter=tap src/firestore.emulator.test.mjs"], {
    cwd: ROOT, env: { ...safeEnv, CI: "true", SPEKTRUM_QA_RULES_FILE: join(dir, "candidate.rules") },
    encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  await writeFile(join(dir, "emulator-results.log"), output);
  requireCondition(result.status === 0 && /# pass 57\b/.test(output) && /# fail 0\b/.test(output),
    "Candidate emulator test failed; no production changes made. See emulator-results.log.");
  record.emulatorVerification = { hash: record.candidateHash, passed: 57, at: new Date().toISOString() };
  record.status = "tested";
  await save(dir, "receipt.json", record);
  console.log(JSON.stringify({ status: record.status, actualRuleTestsPassed: 57 }));
}

async function verifyWithDisposableAccounts(dir, record) {
  stage = "disposable-live-verification";
  const run = randomBytes(8).toString("hex"), base = `qa_fixture_${run}`;
  const manifestDir = join("/tmp", `spektrum-live-qa-${run}`);
  await mkdir(manifestDir, { mode: 0o700 });
  const manifestPath = join(manifestDir, "fixture.json");
  const fixture = {
    run, projectId: PROJECT, users: {},
    ids: { signed: `${base}_signed`, rate: `${base}_rate`, guest: `${base}_guest` },
    appConfig: { projectId: PROJECT, apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN },
  };
  requireCondition(fixture.appConfig.apiKey, "Public Firebase web configuration is unavailable.");
  const created = [];
  try {
    for (const role of ["sender", "recipient"]) {
      const uid = `${base}_${role}`;
      const credentials = { uid, email: `${base}-${role}@example.invalid`, password: `Qa-fixture!${randomBytes(20).toString("hex")}` };
      fixture.users[role] = credentials;
      await adminAuth().createUser({ ...credentials, emailVerified: true, displayName: "SPEKTRUM geçici test" });
      created.push(uid);
      await adminDb().doc(`users/${uid}`).create({
        uid, displayName: "SPEKTRUM geçici test", username: `${base}-${role}`,
        role: "user", banned: false, accountDeletionPending: false,
        qaFixtureRun: run, createdAt: FieldValue.serverTimestamp(),
      });
    }
    await writeFile(manifestPath, JSON.stringify(fixture), { mode: 0o600 });
    const result = spawnSync("pnpm", ["--filter", "@workspace/anonymous-qa", "exec", "node",
      "--experimental-strip-types", "src/production-fixture-check.mjs", manifestPath], {
      cwd: ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 2 * 1024 * 1024,
    });
    // The child prints only named checks and sanitized error codes, never tokens/passwords.
    await writeFile(join(dir, "live-verification.log"), (result.stdout ?? "") + (result.stderr ?? ""));
    requireCondition(result.status === 0, "Disposable live verification failed. See live-verification.log.");
    record.liveVerification = JSON.parse(await readFile(join(manifestDir, "result.json"), "utf8"));
    for (const id of [fixture.ids.signed, fixture.ids.guest]) {
      for (const collection of ["anonymousQuestionsV2", "anonymousQuestionIdentities"]) {
        requireCondition(!(await adminDb().doc(`${collection}/${id}`).get()).exists,
          "Client deletion did not remove both fixture documents.");
      }
    }
    record.liveVerification.pairedDeletionConfirmed = true;
  } finally {
    let saved = fixture;
    try { saved = JSON.parse(await readFile(manifestPath, "utf8")); } catch {}
    const ownIds = [...created, ...(saved.guestUid ? [saved.guestUid] : [])];
    const batch = adminDb().batch();
    for (const id of Object.values(fixture.ids)) {
      for (const collection of ["anonymousQuestionsV2", "anonymousQuestionIdentities"]) {
        const ref = adminDb().doc(`${collection}/${id}`), snapshot = await ref.get();
        if (snapshot.exists) {
          requireCondition(snapshot.data().targetUid === fixture.users.recipient.uid, "Fixture ownership conflict; cleanup stopped.");
          batch.delete(ref);
        }
      }
    }
    for (const uid of ownIds) {
      const limit = adminDb().doc(`anonymousQuestionLimits/${uid}`), snapshot = await limit.get();
      if (snapshot.exists) {
        requireCondition(Object.values(fixture.ids).includes(snapshot.data().lastQuestionId), "Unexpected fixture rate ownership.");
        batch.delete(limit);
      }
      if (created.includes(uid)) {
        const profile = adminDb().doc(`users/${uid}`), snapshot = await profile.get();
        if (snapshot.exists) {
          requireCondition(snapshot.data().qaFixtureRun === run, "Fixture profile ownership conflict.");
          batch.delete(profile);
        }
      }
    }
    await batch.commit();
    for (const uid of ownIds) await adminAuth().deleteUser(uid);
    await rm(manifestDir, { recursive: true, force: true });
    record.disposableDataCleaned = true;
    await save(dir, "receipt.json", record);
  }
}

async function apply(dir, record) {
  stage = "production-preflight";
  requireCondition(process.argv.includes("--confirm-spektrum-qa"), "Explicit --confirm-spektrum-qa is required.");
  requireCondition(record.project === PROJECT && record.emulatorVerification?.hash === record.candidateHash,
    "The exact candidate must pass emulator verification first.");
  const before = await readFile(join(dir, "before.rules"), "utf8");
  const candidate = await readFile(join(dir, "candidate.rules"), "utf8");
  requireCondition(digest(before) === record.beforeHash && digest(candidate) === record.candidateHash, "Evidence changed.");
  requireCondition(withoutQa(before) === withoutQa(candidate), "Unrelated live rules would change.");
  let active = await getRelease(), config = await getConfig();
  requireCondition(active.rulesetName === record.originalRelease.rulesetName, "Live rules changed; prepare a fresh plan.");
  requireCondition(digest((await getSource(active)).content) === record.beforeHash, "Active source changed.");
  const otherBefore = otherSignInHash(config);
  let switched = false, anonymousChanged = false;
  try {
    await migrateExisting(dir, record);
    stage = "create-tested-ruleset";
    const ruleset = await api("firebaserules.googleapis.com", `v1/projects/${PROJECT}/rulesets`, "POST", {
      source: { files: [{ name: record.sourceName, content: candidate }] },
    });
    record.newRulesetName = ruleset.name;
    await save(dir, "receipt.json", record);
    active = await getRelease();
    requireCondition(active.rulesetName === record.originalRelease.rulesetName, "Concurrent live rules update; release stopped.");
    stage = "activate-qa-only-rules";
    await switchRelease(ruleset.name);
    switched = true;
    record.status = "rules-active";
    await save(dir, "receipt.json", record);
    stage = "enable-anonymous-only";
    if (!config.signIn?.anonymous?.enabled) { await setAnonymous(true); anonymousChanged = true; }
    config = await getConfig();
    requireCondition(config.signIn?.anonymous?.enabled === true && otherSignInHash(config) === otherBefore,
      "Auth settings verification failed.");
    record.status = "auth-active";
    await save(dir, "receipt.json", record);
    await verifyWithDisposableAccounts(dir, record);
    stage = "final-live-release-check";
    const final = await getSource(await getRelease());
    requireCondition(digest(final.content) === record.candidateHash, "Active rules no longer match the tested candidate.");
    requireCondition(digest(withoutQa(final.content)) === record.unrelatedRulesHash, "Unrelated permissions differ.");
    record.status = "verified";
    record.verifiedAt = new Date().toISOString();
    await save(dir, "receipt.json", record);
    console.log(JSON.stringify({ status: record.status, anonymousEnabled: true,
      unrelatedPermissionsPreserved: true, disposableDataCleaned: record.disposableDataCleaned,
      verification: record.liveVerification }));
  } catch (error) {
    stage = "guarded-recovery";
    if (switched && (await getRelease()).rulesetName === record.newRulesetName) {
      await switchRelease(record.originalRelease.rulesetName);
      if (anonymousChanged) await setAnonymous(record.anonymousBefore);
      record.status = "rolled-back";
      await save(dir, "receipt.json", record);
    }
    throw error;
  }
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  const dir = resolve(process.argv[3] ?? join(OUTPUT, new Date().toISOString().replace(/[:.]/g, "-")));
  requireCondition(dir.startsWith(OUTPUT + "/"), "Evidence directory must be inside the ignored release directory.");
  if (mode === "test") {
    await test(dir, JSON.parse(await readFile(join(dir, "receipt.json"), "utf8")));
    return;
  }
  requireCondition(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    "Production operator refuses emulator overrides.");
  requireCondition(adminDb().projectId === PROJECT, "Unexpected Firebase project.");
  if (mode === "plan") await plan(dir);
  else if (mode === "apply") await apply(dir, JSON.parse(await readFile(join(dir, "receipt.json"), "utf8")));
  else throw new SafeError("Unknown command.");
}
main().catch(error => {
  console.error(JSON.stringify({ stage, error: error instanceof SafeError ? error.message : "Operation failed; sensitive error details were not logged." }));
  process.exitCode = 1;
});
