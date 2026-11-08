// Disposable loopback-only fixture. Never initializes the production Firebase app.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import express from "express";
import cors from "cors";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createChapterAudioRouter } from "../src/routes/chapter-audio";

export async function startAudioQaServer(port = 0) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:18081";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:19199";
  const app = initializeApp({ projectId: "demo-spektrum-qa", storageBucket: "demo-spektrum-qa.appspot.com" }, `audio-qa-${randomBytes(4).toString("hex")}`);
  const auth = getAuth(app), db = getFirestore(app), bucket = getStorage(app).bucket();
  const password = `Qa-only-${randomBytes(12).toString("hex")}!`;
  const users = [
    { uid: "qa-audio-author", email: "audio-author@qa.invalid", displayName: "Ses QA Yazarı" },
    { uid: "qa-audio-reader", email: "audio-reader@qa.invalid", displayName: "Ses QA Okuru" },
  ];
  const now = Timestamp.now();
  for (const user of users) {
    await auth.deleteUser(user.uid).catch(e => { if (e.code !== "auth/user-not-found") throw e; });
    await auth.createUser({ ...user, password, emailVerified: true });
    await db.collection("users").doc(user.uid).set({
      uid: user.uid, displayName: user.displayName, nickname: user.uid, username: user.uid,
      avatarUrl: "", bio: "Türkçe biyografi aynen kalmalı.", role: "user", isBanned: false, isFrozen: false,
      createdAt: now, updatedAt: now, acceptedTerms: true, acceptedPrivacy: true,
      termsAcceptedAt: now, privacyAcceptedAt: now, consentVersion: "2026-01",
    });
  }
  await db.collection("stories").doc("qa_audio_story").set({
    title: "Sesli Bölüm Test Kitabı", authorId: users[0]!.uid, authorName: users[0]!.displayName,
    authorAvatar: "", summary: "Yalnızca yerel ses testi.", genre: "Macera", coverUrl: "",
    contentLanguage: "tr", tags: [], status: "published", chapterCount: 1,
    readCount: 0, likeCount: 0, commentCount: 0, createdAt: now, updatedAt: now,
  });
  await db.collection("chapters").doc("qa_audio_chapter").set({
    storyId: "qa_audio_story", title: "Deneme Bölümü", content: "Bu bölüm yalnızca ses özelliğinin yerel testi içindir.\n\nBölüm metni ve ses dosyası birbirinden bağımsızdır.",
    status: "published", order: 1, isPaid: false, wordCount: 24, readCount: 0, createdAt: now, updatedAt: now,
  });
  await db.collection("chapterAudio").doc("qa_audio_chapter").delete();
  await bucket.deleteFiles({ prefix: "chapter-audio/qa-audio-author/" });
  const tokens: Record<string, string> = {};
  for (const user of users) {
    const response = await fetch("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
    });
    const body = await response.json() as { idToken: string };
    if (!body.idToken) throw new Error("Local emulator login failed");
    tokens[user.uid] = body.idToken;
  }
  const http = express();
  http.use(cors());
  http.use((req, _res, next) => {
    // Test logger deliberately records neither media tickets nor auth credentials.
    (req as any).log = { error: () => {}, warn: () => {} }; next();
  });
  http.use("/api", createChapterAudioRouter({ auth: () => auth, db: () => db, bucket: () => bucket, signingSecret: "demo-loopback-audio-signing-only" }));
  const server = http.listen(port, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  return { server, db, bucket, tokens, url: `http://127.0.0.1:${address.port}`, fixture: { users, password, chapterId: "qa_audio_chapter", storyId: "qa_audio_story" } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const qa = await startAudioQaServer(18422);
  const dir = fileURLToPath(new URL("../../../generated-artifacts/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}chapter-audio-qa.json`, JSON.stringify(qa.fixture), { mode: 0o600 });
  console.log(`Local-only chapter audio QA API listening at ${qa.url}; fixture written to generated-artifacts/chapter-audio-qa.json`);
}
