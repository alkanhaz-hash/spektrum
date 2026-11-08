/**
 * Seed the ten authorized second-library stories. Read-only by default.
 * Covers are content-addressed objects; Firestore publishes all 70 documents
 * and profile counters in one transaction. Interrupted retries create no dupes.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { loadStoriesFromDirectory, libraryDigest } from "./launch-library.mjs";

const SEED_ID = "spektrum-romance-adventure-library";
const PROJECT = "spektrum-5c7cc";
const BUCKET = `${PROJECT}.firebasestorage.app`;
const CONTENT_DIR = "artifacts/api-server/seed-content-romance";
const COVER_DIR = "generated-artifacts/book-covers-romance";

function assertStoryCollection(stories) {
  if (stories.length !== 10 || stories.some(s => s.chapters.length < 6)) {
    throw new Error("10 kitap ve kitap başına en az 6 bölüm olmalı.");
  }
  const titleWords = ["aşk", "macera", "dövüş", "büyü", "gizem"];
  for (const story of stories) {
    const text = `${story.title} ${story.summary} ${story.chapters.map(ch => `${ch.title} ${ch.content}`).join(" ")}`.toLocaleLowerCase("tr");
    if (!titleWords.some(word => text.includes(word)) &&
        !/(sevgi|sevg|âşık|kaçış|serüven|yolculuk|büyü|ejderha|gizem|mücadele|çarpış|saldırı|savun)/iu.test(text)) {
      throw new Error(`${story.title}: macera/fantastik/gizem teması doğrulanamadı.`);
    }
  }
  return stories;
}

async function readStories() {
  return assertStoryCollection(await loadStoriesFromDirectory(CONTENT_DIR));
}

async function getCover(story, index) {
  const path = `${COVER_DIR}/cover-${String(index + 11).padStart(2, "0")}.webp`;
  const bytes = await readFile(path);
  if (bytes.length < 1000 || bytes.length > 500_000 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${story.title}: kapak biçimi veya boyutu geçersiz.`);
  }
  return bytes;
}

async function ensureCover(bucket, story, authorId, bytes) {
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const path = `story-covers/${authorId}/${story.id}-art-${digest}.webp`;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  let token;
  if (exists) {
    const [metadata] = await file.getMetadata();
    token = metadata.metadata?.firebaseStorageDownloadTokens?.split(",")[0];
    if (!token) throw new Error("Yüklenmiş kapak erişim anahtarı eksik.");
  } else {
    token = randomUUID();
    await file.save(bytes, {
      resumable: false, validation: "crc32c",
      metadata: {
        contentType: "image/webp",
        cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: token },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  }
  return {
    path,
    url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.filter(arg => ["--check", "--verify", "--apply"].includes(arg));
  if (mode.length > 1 || args.some(arg =>
    !["--check", "--verify", "--apply", `--confirm-project=${PROJECT}`].includes(arg))) {
    throw new Error("Komut seçenekleri geçersiz.");
  }
  if (args.includes("--apply") && !args.includes(`--confirm-project=${PROJECT}`)) {
    throw new Error("Yazılacak proje açıkça doğrulanmalı.");
  }
  const stories = await readStories();
  const covers = await Promise.all(stories.map(getCover));
  console.table(stories.map((s, i) => ({
    title: s.title, chapters: s.chapters.length, words: s.wordCount, coverKB: Math.round(covers[i].length / 1024),
  })));
  if (args.includes("--check")) { console.log("İçerik ve kapaklar hazır; Firebase'e bağlanılmadı."); return; }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Hizmet hesabı Replit Secrets alanında eksik.");
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error("Hizmet hesabı biçimi geçersiz."); }
  if (account.project_id !== PROJECT || process.env.VITE_FIREBASE_PROJECT_ID !== PROJECT ||
      process.env.VITE_FIREBASE_STORAGE_BUCKET !== BUCKET) {
    throw new Error("Firebase projesi veya Storage kovası beklenen projeyle eşleşmiyor.");
  }
  const app = initializeApp({ credential: cert(account), projectId: PROJECT, storageBucket: BUCKET }, "romance-adventure-library");
  try {
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket();
    const receiptRef = db.doc(`privateSeedRuns/${SEED_ID}`);
    const digest = libraryDigest(stories);
    const receipt = await receiptRef.get();

    if (receipt.exists) {
      const record = receipt.data();
      if (record.status !== "complete" || record.contentDigest !== digest ||
          record.assignments?.length !== 10) {
        throw new Error("İçerik değişmiş veya önceki kayıt eksik; mevcut kitaplar korunuyor.");
      }
      const refs = stories.flatMap(s => [
        db.doc(`stories/${s.id}`),
        ...s.chapters.map(ch => db.doc(`chapters/${s.id}_chapter_${ch.order}`)),
      ]);
      const saved = await db.getAll(...refs);
      if (saved.length !== 70 || saved.some(s => !s.exists)) {
        throw new Error("Kitap ya da bölüm eksik; otomatik yeniden oluşturma yapılmadı.");
      }
      for (let index = 0; index < stories.length; index++) {
        const story = stories[index];
        const data = saved[index * 7].data();
        if (data.title !== story.title || data.authorId !== record.assignments[index].authorId ||
            data.summary !== story.summary || typeof data.coverUrl !== "string" ||
            !data.coverUrl.includes(encodeURIComponent(record.assignments[index].coverPath))) {
          throw new Error("Canlı kitap, yazar veya kapak beklenen değerle uyuşmuyor.");
        }
      }
      console.log("Mevcut kitap koleksiyonu doğrulandı; tekrar yazılmadı.");
      return;
    }
    if (args.includes("--verify")) throw new Error("Koleksiyon henüz yayınlanmadı.");

    // Reuse only the ten accounts already authorized for the first collection.
    // New signups must never be silently enrolled as authors of seeded content.
    const initialReceipt = await db.doc("privateSeedRuns/spektrum-launch-library").get();
    const initialAssignments = initialReceipt.data()?.assignments;
    if (initialReceipt.data()?.authorConsentConfirmed !== true ||
        !Array.isArray(initialAssignments) || initialAssignments.length !== 10 ||
        new Set(initialAssignments.map(item => item.authorId)).size !== 10) {
      throw new Error("Önceden izin verilmiş on yazarın kayıt makbuzu doğrulanamadı.");
    }
    const authors = await db.getAll(...initialAssignments.map(item => db.doc(`users/${item.authorId}`)));
    for (const author of authors) {
      const profile = author.data();
      if (!author.exists || profile.banned || profile.accountFrozen || profile.accountDeletionPending ||
          typeof profile.displayName !== "string" || !profile.displayName.trim() ||
          (profile.storyCount !== undefined && (!Number.isSafeInteger(profile.storyCount) || profile.storyCount < 0))) {
        throw new Error("Etkin olmayan veya eksik yazar profili var; hiçbir kitap kaydedilmedi.");
      }
    }
    const authResults = await getAuth(app).getUsers(authors.map(user => ({ uid: user.id })));
    if (authResults.users.length !== 10 || authResults.notFound.length ||
        authResults.users.some(u => u.disabled || !u.providerData.length ||
          u.customClaims?.accountDeletionPending === true)) {
      throw new Error("On etkin kayıtlı yazar hesabı doğrulanamadı.");
    }
    const assignments = stories.map((story, index) => ({
      storyId: story.id, title: story.title, authorId: authors[index].id,
      authorName: authors[index].data().displayName, chapterCount: story.chapters.length,
    }));
    const refs = stories.flatMap(s => [
      db.doc(`stories/${s.id}`),
      ...s.chapters.map(ch => db.doc(`chapters/${s.id}_chapter_${ch.order}`)),
    ]);
    const collisions = await db.getAll(...refs);
    if (collisions.some(doc => doc.exists)) throw new Error("Kitap veya bölüm kimliği zaten kullanımda; hiçbir kayıt değiştirilmedi.");
    console.log("Salt-okunur ön kontrol: 10 kitap, 60 bölüm, 10 kayıtlı yazar.");
    if (!args.includes("--apply")) return;

    // Upload before the transaction using content-addressed object paths.
    // If the process stops midway, the next run safely reuses completed uploads.
    const coverRecords = [];
    for (let index = 0; index < stories.length; index++) {
      coverRecords.push(await ensureCover(bucket, stories[index], authors[index].id, covers[index]));
    }
    await db.runTransaction(async tx => {
      const existingReceipt = await tx.get(receiptRef);
      if (existingReceipt.exists) {
        if (existingReceipt.data().status === "complete" && existingReceipt.data().contentDigest === digest) return;
        throw new Error("İşlem sırasında farklı kayıt makbuzu oluştu.");
      }
      const currentProfiles = await tx.getAll(...authors.map(author => author.ref));
      const currentDocs = await tx.getAll(...refs);
      if (currentDocs.some(doc => doc.exists)) throw new Error("İşlem sırasında kayıt kimliği kullanıldı.");
      for (let index = 0; index < authors.length; index++) {
        const current = currentProfiles[index].data();
        if (!current || current.displayName !== assignments[index].authorName ||
            current.banned || current.accountFrozen || current.accountDeletionPending ||
            (current.storyCount !== undefined && (!Number.isSafeInteger(current.storyCount) || current.storyCount < 0))) {
          throw new Error("İşlem sırasında yazar hesabı değişti; kayıt yapılmadı.");
        }
      }
      for (let index = 0; index < stories.length; index++) {
        const story = stories[index];
        const author = authors[index];
        const profile = currentProfiles[index].data();
        tx.create(refs[index * 7], {
          authorId: author.id, authorName: profile.displayName,
          authorAvatar: typeof profile.avatarUrl === "string" ? profile.avatarUrl : "",
          title: story.title, summary: story.summary, genre: story.genre, tags: story.tags,
          coverUrl: coverRecords[index].url, chapterCount: story.chapters.length,
          readCount: 0, likeCount: 0, commentCount: 0,
          status: "published", seedCollection: SEED_ID, coverStoragePath: coverRecords[index].path,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        story.chapters.forEach((chapter, chIndex) => tx.create(refs[index * 7 + chIndex + 1], {
          ...chapter, storyId: story.id, status: "published",
          readCount: 0, isPaid: false, price: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }));
        tx.update(author.ref, { storyCount: FieldValue.increment(1) });
      }
      tx.create(receiptRef, {
        status: "complete", contentDigest: digest, assignments: assignments.map((item, i) => ({
          ...item, coverPath: coverRecords[i].path,
        })),
        createdAt: FieldValue.serverTimestamp(),
        authorConsentConfirmed: true, contentOrigin: "ai-assisted-original",
      });
    });
    const written = await db.getAll(...refs);
    if (written.length !== 70 || written.some(doc => !doc.exists)) {
      throw new Error("Canlı kayıtların tümü doğrulanamadı.");
    }
    for (let index = 0; index < stories.length; index++) {
      const story = stories[index];
      const storyDoc = written[index * 7].data();
      if (storyDoc.coverUrl !== coverRecords[index].url || storyDoc.summary !== story.summary ||
          storyDoc.authorId !== assignments[index].authorId || storyDoc.status !== "published") {
        throw new Error("Canlı kitap kapağı, özet veya yazarlık doğrulanamadı.");
      }
      for (let chapterIndex = 0; chapterIndex < story.chapters.length; chapterIndex++) {
        const saved = written[index * 7 + chapterIndex + 1].data();
        if (saved.content !== story.chapters[chapterIndex].content || saved.status !== "published") {
          throw new Error("Bölüm metni canlı kayıtta doğrulanamadı.");
        }
      }
      const image = await fetch(coverRecords[index].url);
      if (!image.ok || !image.headers.get("content-type")?.includes("image/webp")) {
        throw new Error("Canlı kapak görseli indirilemedi.");
      }
      if (!Buffer.from(await image.arrayBuffer()).equals(covers[index])) {
        throw new Error("İndirilen kapak görseli beklenen dosyayla uyuşmuyor.");
      }
    }
    console.log("Canlı yayın doğrulandı: 10 kitap, 60 bölüm, 10 özgün kapak.");
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error?.code
    ? `İşlem başarısız (${String(error.code)}); Firebase gizli ayrıntıları gösterilmedi.`
    : error.message);
  process.exitCode = 1;
});
