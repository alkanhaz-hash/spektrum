import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createFixture, projectId } from "./weekly-voting-fixture.mjs";
import { getVotingWeek, recordWeeklyVote, getWeeklyStandings, removeWeeklyVotesForUser } from "../src/lib/weekly-voting.ts";

let f;
before(async () => { f = await createFixture(); });
after(async () => { if (f) await f.close(); });
async function api(path = "", role, body) {
  const response = await fetch(`${f.base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json(), cache: response.headers.get("cache-control") };
}
test("Istanbul weeks turn on Monday at 00:00, including year boundaries", () => {
  assert.equal(getVotingWeek(new Date("2026-10-18T20:59:59.999Z")).weekId, "2026-10-12");
  assert.equal(getVotingWeek(new Date("2026-10-18T21:00:00Z")).weekId, "2026-10-19");
  assert.equal(getVotingWeek(new Date("2026-10-25T20:59:59.999Z")).weekId, "2026-10-19");
  assert.equal(getVotingWeek(new Date("2026-10-25T21:00:00Z")).weekId, "2026-10-26");
  assert.equal(getVotingWeek(new Date("2027-01-01T00:00:00Z")).weekId, "2026-12-28");
});
test("public standings have explicit empty state and no private identity; my vote requires auth", async () => {
  const result = await api();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.entries, []);
  assert.equal(result.cache, "no-store");
  assert.equal((await api("/me")).status, 401);
  assert.equal((await api("/me", "reader")).data.storyId, null);
});
test("HTTP rejects forged fields, path injection, unverified users, own stories and drafts", async () => {
  assert.equal((await api("", null, { storyId: f.storyId })).status, 401);
  for (const extra of ["voterUid", "weekId", "votes", "rank"]) {
    assert.equal((await api("", "reader", { storyId: f.storyId, [extra]: "forged" })).status, 400);
  }
  assert.equal((await api("", "reader", { storyId: "../private" })).status, 400);
  assert.equal((await api("", "unverified", { storyId: f.storyId })).status, 403);
  assert.equal((await api("", "writer", { storyId: f.storyId })).data.code, "SELF_VOTE");
  assert.equal((await api("", "reader", { storyId: `${f.storyId}_draft` })).status, 403);
});
test("anonymous auth and disabled auth accounts cannot vote", async () => {
  const response = await fetch("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
  });
  const guest = await response.json();
  f.accounts.guest = { uid: guest.localId, token: guest.idToken };
  assert.equal((await api("", "guest", { storyId: f.storyId })).status, 403);
  await f.auth.updateUser(f.accounts.other.uid, { disabled: true });
  assert.equal((await api("", "other", { storyId: f.storyId })).status, 401);
  await f.auth.updateUser(f.accounts.other.uid, { disabled: false });
});
test("banned, frozen, deleting and absent profiles leave no votes", async () => {
  const at = new Date("2026-01-05T10:00:00Z");
  for (const flag of ["banned", "accountFrozen", "accountDeletionPending"]) {
    await f.db.doc(`users/${f.accounts.other.uid}`).set({ [flag]: true });
    await assert.rejects(recordWeeklyVote(f.db, f.accounts.other.uid, f.storyId, at), { code: "INACTIVE_ACCOUNT" });
  }
  await f.db.doc(`users/${f.accounts.other.uid}`).delete();
  await assert.rejects(recordWeeklyVote(f.db, f.accounts.other.uid, f.storyId, at), { code: "INACTIVE_ACCOUNT" });
  await f.db.doc(`users/${f.accounts.other.uid}`).set({ displayName: "Weekly other" });
});
test("concurrent different-story attempts record exactly one weekly choice and one count", async () => {
  const otherStory = `${f.storyId}_second`;
  await f.db.doc(`stories/${otherStory}`).set(f.published);
  const outcomes = await Promise.allSettled([
    recordWeeklyVote(f.db, f.accounts.reader.uid, f.storyId),
    recordWeeklyVote(f.db, f.accounts.reader.uid, otherStory),
  ]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const rejected = outcomes.find(r => r.status === "rejected");
  assert.equal(rejected.reason.code, "ALREADY_VOTED");
  const mine = await api("/me", "reader");
  const choice = mine.data.storyId;
  for (let retry = 0; retry < 3; retry++) assert.equal((await api("", "reader", { storyId: choice })).status, 200);
  const tallies = await f.db.collection("weeklyStoryVotes").doc(getVotingWeek().weekId).collection("tallies").get();
  assert.equal(tallies.docs.reduce((sum, d) => sum + d.data().votes, 0), 1);
  assert.equal((await api()).data.entries[0].storyId, choice);
  assert.equal((await api("", "reader", { storyId: choice === f.storyId ? otherStory : f.storyId })).status, 409);
});
test("a new week permits another vote without altering previous results", async () => {
  const at = new Date("2027-02-08T00:00:00Z");
  await recordWeeklyVote(f.db, f.accounts.reader.uid, f.storyId, at);
  assert.equal((await getWeeklyStandings(f.db, at)).entries[0].votes, 1);
  assert.equal((await api()).data.entries[0].votes, 1);
});
test("top three excludes unpublished, deleted and incomplete imports, paginating hidden entries", async () => {
  const at = new Date("2027-03-01T10:00:00Z");
  const week = getVotingWeek(at);
  const batch = f.db.batch();
  for (let i = 0; i < 30; i++) {
    const id = `hidden_${String(i).padStart(2, "0")}`;
    batch.set(f.db.doc(`stories/${id}`), { ...f.published, status: "draft", title: "PRIVATE_DRAFT_TITLE" });
    batch.set(f.db.doc(`weeklyStoryVotes/${week.weekId}/tallies/${id}`), { votes: 100 });
  }
  for (const [id, extras] of [["deleted_story", { isDeleted: true }], ["incomplete", { importState: "prepared" }]]) {
    batch.set(f.db.doc(`stories/${id}`), { ...f.published, ...extras });
    batch.set(f.db.doc(`weeklyStoryVotes/${week.weekId}/tallies/${id}`), { votes: 99 });
  }
  for (const id of ["rank_a", "rank_b", "rank_c", "rank_d"]) {
    batch.set(f.db.doc(`stories/${id}`), { ...f.published, status: id === "rank_a" ? "completed" : "published" });
    batch.set(f.db.doc(`weeklyStoryVotes/${week.weekId}/tallies/${id}`), { votes: 2 });
  }
  await batch.commit();
  const first = await getWeeklyStandings(f.db, at);
  const again = await getWeeklyStandings(f.db, at);
  assert.equal(first.entries.length, 3);
  assert.deepEqual(first, again);
  assert.deepEqual(first.entries.map(e => e.rank), [1, 2, 3]);
  assert.ok(first.entries.every(e => e.storyId.startsWith("rank_")));
  assert.ok(!JSON.stringify(first).includes("PRIVATE_DRAFT_TITLE"));
  assert.ok(!JSON.stringify(first).includes("voterUid"));
});
test("real Firestore rules deny ballot and tally reads/lists/writes to all client roles", async () => {
  const week = getVotingWeek().weekId;
  const root = `http://127.0.0.1:18081/v1/projects/${projectId}/databases/(default)/documents`;
  for (const role of [null, "reader", "writer", "other", "guest"]) {
    const headers = role ? { Authorization: `Bearer ${f.accounts[role].token}` } : {};
    for (const path of [
      `weeklyStoryBallots/${week}_${f.accounts.reader.uid}`, "weeklyStoryBallots",
      `weeklyStoryVotes/${week}/tallies/${f.storyId}`, `weeklyStoryVotes/${week}/tallies`,
    ]) {
      assert.equal((await fetch(`${root}/${path}`, { headers })).status, 403, `${role} read ${path}`);
      if (path.split("/").length % 2 === 0) {
        const write = await fetch(`${root}/${path}`, {
          method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { votes: { integerValue: "999" } } }),
        });
        assert.equal(write.status, 403, `${role} write ${path}`);
      }
    }
  }
});
test("account deletion removes all private weekly choices and decrements each tally exactly once", async () => {
  assert.equal(await removeWeeklyVotesForUser(f.db, f.accounts.reader.uid), 2);
  assert.equal(await removeWeeklyVotesForUser(f.db, f.accounts.reader.uid), 0);
  assert.equal((await f.db.collection("weeklyStoryBallots").where("voterUid", "==", f.accounts.reader.uid).get()).size, 0);
  assert.deepEqual((await api()).data.entries, []);
});
