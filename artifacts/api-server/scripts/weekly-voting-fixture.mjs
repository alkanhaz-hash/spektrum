import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import express from "express";
import { writeFile, unlink } from "node:fs/promises";
import votingRouter from "../src/routes/weekly-voting.ts";

export const projectId = "demo-spektrum-qa";
export async function createFixture(port = 0) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18081"
      || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19099") {
    throw new Error("Explicit loopback Firestore AND Auth emulators are mandatory; live Firebase is forbidden.");
  }
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  const auth = getAuth(app);
  const suffix = Date.now().toString(36);
  const accounts = {};
  for (const role of ["reader", "writer", "other", "unverified"]) {
    const email = `${role}-${suffix}@weekly.invalid`;
    const password = `Disposable-${suffix}!`;
    const user = await auth.createUser({ email, password, emailVerified: role !== "unverified", displayName: `Weekly ${role}` });
    await db.doc(`users/${user.uid}`).set({ displayName: `Weekly ${role}`, role: "user", storyCount: 0 });
    const response = await fetch(`http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const result = await response.json();
    if (!response.ok || !result.idToken) throw new Error("Fixture sign-in failed");
    accounts[role] = { uid: user.uid, email, password, token: result.idToken };
  }
  const published = { title: "Haftalık Oylama Deneme Hikâyesi", authorId: accounts.writer.uid, authorName: "Weekly writer", authorAvatar: "", coverUrl: "", genre: "Macera", summary: "Yalnızca izole test için hazırlanmış hikâye.", tags: [], status: "published", chapterCount: 0, readCount: 0, likeCount: 0, commentCount: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
  const storyId = `weekly_fixture_${suffix}`;
  await db.doc(`stories/${storyId}`).set(published);
  await db.doc(`stories/${storyId}_draft`).set({ ...published, status: "draft" });
  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => { req.log = { error() {} }; next(); });
  api.use("/api", votingRouter);
  const server = await new Promise(resolve => {
    const started = api.listen(port, "127.0.0.1", () => resolve(started));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/weekly-votes`;
  return {
    db, auth, accounts, storyId, published, base,
    async close() {
      await new Promise(resolve => server.close(resolve));
      // The demo project belongs exclusively to this local fixture run.
      await fetch(`http://127.0.0.1:18081/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
      await fetch(`http://127.0.0.1:19099/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
      await deleteApp(app);
    },
  };
}

if (process.argv.includes("--serve")) {
  const fixture = await createFixture(18722);
  const file = "/tmp/spektrum-weekly-voting-fixture.json";
  await writeFile(file, JSON.stringify({ accounts: fixture.accounts, storyId: fixture.storyId, base: fixture.base }));
  process.stdout.write("Disposable weekly voting fixture ready on loopback 18722\n");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    await fixture.close();
    await unlink(file).catch(() => {});
    process.exit(0);
  });
}
