import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildQaPatch, withoutQa } from "./qa-rules-patch.mjs";

const local = await readFile(new URL("../../spektrum/firestore.rules", import.meta.url), "utf8");
const live = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isModerator() { return false; }
    match /users/{uid} { allow read: if true; allow write: if isOwner(uid); }
    match /stories/{id} { allow read: if true; }
    match /anonymousQuestions/{questionId} {
      // comment with } and a quoted "{"
      allow read: if resource.data.isAnswered == true;
      allow create: if isSignedIn();
    }
    match /messages/{id} { allow read: if isSignedIn(); }
    match /{document=**} { allow read, write: if false; }
  }
}`;

test("only replaces the Q&A scope, preserving all other bytes", () => {
  const candidate = buildQaPatch(live, local);
  assert.equal(withoutQa(candidate), withoutQa(live));
  assert.match(candidate, /match \/anonymousQuestionsV2/);
  assert.match(candidate, /function qaDeploymentAccountIsActive/);
  assert.match(candidate, /function qaDeploymentIsBanned/);
  assert.doesNotMatch(candidate, /\baccountIsActive\(/);
  assert.doesNotMatch(candidate, /\bisBanned\(/);
  assert.match(candidate, /!existsAfter\(.*anonymousQuestionIdentities/);
});
test("repeated preparation is idempotent", () => {
  const candidate = buildQaPatch(live, local);
  assert.equal(buildQaPatch(candidate, local), candidate);
});
test("refuses duplicate legacy matches", () => {
  assert.throws(() => buildQaPatch(live + "\n    match /anonymousQuestions/{id} { allow read: if true; }", local));
});
test("refuses unmanaged new rules and helpers", () => {
  assert.throws(() => buildQaPatch(live + "\n    match /anonymousQuestionsV2/{id} { allow read: if true; }", local));
  assert.throws(() => buildQaPatch(live + "\nfunction qaSenderAllowed() { return true; }", local));
});
test("refuses incomplete or unbalanced source", () => {
  assert.throws(() => buildQaPatch(live, local.replace("function qaRateAllowed(", "function missing(")));
  assert.throws(() => buildQaPatch(live, local.slice(0, local.indexOf("match /anonymousQuestionLimits/") + 40)));
});
