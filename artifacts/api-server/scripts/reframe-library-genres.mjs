/**
 * Rewrites only the second collection after explicit operator confirmation.
 * Keeps all IDs, authors, counters, original timestamps and publication state.
 * Does not create/delete books or chapters; backs up source records privately.
 */
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  loadGenreLibrary, SOURCE_ID, REVISION_ID,
  assertSourceUnchanged, storyChanges, chapterChanges,
} from "./genre-library.mjs";

const PROJECT = "spektrum-5c7cc";
const BUCKET = `${PROJECT}.firebasestorage.app`;

async function uploadCover(bucket, authorId, story, bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const path = `story-covers/${authorId}/${story.id}-art-${hash}.webp`;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  let token;
  if (exists) {
    const [metadata] = await file.getMetadata();
    token = metadata.metadata?.firebaseStorageDownloadTokens?.split(",")[0];
    if (!token) throw new Error("Kapak indirme erişimi eksik.");
  } else {
    token = randomUUID();
    await file.save(bytes, {
      resumable: false, validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: token } },
    });
  }
  return { path, url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
}

async function verifySaved(db, refs, after, assignments, covers, bytes) {
  const saved = await db.getAll(...refs);
  for (let index = 0; index < after.length; index++) {
    const story = after[index];
    const data = saved[index * 7]?.data();
    if (!data || data.authorId !== assignments[index].authorId || data.title !== story.title ||
        data.summary !== story.summary || data.genre !== story.genre || data.chapterCount !== 6 ||
        data.coverUrl !== covers[index].url || data.status !== "published") {
      throw new Error("Canlı kitap veya sahiplik doğrulanamadı.");
    }
    story.chapters.forEach((chapter, chapterIndex) => {
      const body = saved[index * 7 + chapterIndex + 1]?.data();
      if (!body || body.title !== chapter.title || body.content !== chapter.content ||
          body.order !== chapter.order || body.storyId !== story.id || body.status !== "published") {
        throw new Error("Canlı bölüm metni doğrulanamadı.");
      }
    });
    const response = await fetch(covers[index].url);
    if (!response.ok || !response.headers.get("content-type")?.includes("image/webp") ||
        !Buffer.from(await response.arrayBuffer()).equals(bytes[index])) {
      throw new Error("Halka açık kapak görseli doğrulanamadı.");
    }
  }
  console.log("Canlı doğrulama: 10 ayrı konulu kitap, 60 bölüm, 10 kapak; yazarlar korundu.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--check", "--apply", "--verify", `--confirm-project=${PROJECT}`].includes(arg)) ||
      args.filter(arg => ["--check", "--apply", "--verify"].includes(arg)).length > 1) {
    throw new Error("Geçersiz seçenekler.");
  }
  if (args.includes("--apply") && !args.includes(`--confirm-project=${PROJECT}`)) {
    throw new Error("Yazılacak proje açıkça onaylanmalı.");
  }
  const { before, after, sourceDigest, digest } = await loadGenreLibrary();
  console.table(after.map(s => ({ title: s.title, genre: s.genre, chapters: s.chapters.length, words: s.wordCount })));
  const bytes = await Promise.all(after.map(async (_, index) => {
    const file = await readFile(`generated-artifacts/book-covers-diverse/cover-${index + 11}.webp`);
    if (file.length < 1000 || file.length > 500_000 ||
        file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WEBP") {
      throw new Error("Kapak biçimi veya boyutu geçersiz.");
    }
    return file;
  }));
  if (args.includes("--check")) { console.log("Çevrimdışı kontrol başarılı."); return; }
  let account;
  try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? ""); }
  catch { throw new Error("Firebase hizmet hesabı Secrets alanında eksik veya geçersiz."); }
  if (account.project_id !== PROJECT || process.env.VITE_FIREBASE_STORAGE_BUCKET !== BUCKET) {
    throw new Error("Firebase projesi ve Storage kovası eşleşmiyor.");
  }
  const app = initializeApp({ credential: cert(account), projectId: PROJECT, storageBucket: BUCKET }, "genre-separated-library");
  try {
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket();
    const revisionRef = db.doc(`privateSeedRuns/${REVISION_ID}`);
    const sourceRef = db.doc(`privateSeedRuns/${SOURCE_ID}`);
    const source = await sourceRef.get();
    const assignments = source.data()?.assignments;
    if (source.data()?.status !== "complete" || source.data()?.contentDigest !== sourceDigest ||
        !Array.isArray(assignments) || assignments.length !== 10) {
      throw new Error("Kaynak koleksiyonun kayıt makbuzu uyuşmuyor.");
    }
    const refs = before.flatMap(s => [
      db.doc(`stories/${s.id}`),
      ...s.chapters.map(ch => db.doc(`chapters/${s.id}_chapter_${ch.order}`)),
    ]);
    const revision = await revisionRef.get();
    if (revision.exists) {
      if (revision.data().status !== "complete" || revision.data().contentDigest !== digest) {
        throw new Error("Farklı veya yarım kalmış bir tür güncellemesi bulundu.");
      }
      if (args.includes("--verify")) {
        await verifySaved(db, refs, after, assignments, revision.data().covers, bytes);
      } else console.log("Tür güncellemesi zaten tamamlanmış; yazarın sonraki düzenlemelerine dokunulmadı.");
      return;
    }
    if (args.includes("--verify")) throw new Error("Tür güncellemesi henüz yapılmadı.");
    const snapshots = await db.getAll(...refs);
    assertSourceUnchanged(snapshots, before, assignments);
    const authorRefs = assignments.map(item => db.doc(`users/${item.authorId}`));
    const authors = await db.getAll(...authorRefs);
    if (authors.some(doc => !doc.exists || doc.data().banned || doc.data().accountFrozen || doc.data().accountDeletionPending)) {
      throw new Error("Yazar hesabı etkin değil; güncelleme durduruldu.");
    }
    console.log("Salt-okunur ön kontrol: ilk 10 kitap kapsam dışı; yalnız son 10 kitabın mevcut metinleri değişecek.");
    if (!args.includes("--apply")) return;
    const covers = [];
    for (let index = 0; index < after.length; index++) {
      covers.push(await uploadCover(bucket, assignments[index].authorId, after[index], bytes[index]));
    }
    await db.runTransaction(async tx => {
      const currentRevision = await tx.get(revisionRef);
      if (currentRevision.exists) throw new Error("Aynı güncelleme başka bir işlemde tamamlandı; güvenle yeniden kontrol edilebilir.");
      const currentSource = await tx.get(sourceRef);
      if (currentSource.data()?.contentDigest !== sourceDigest) throw new Error("Kaynak kayıt işlem sırasında değişti.");
      const current = await tx.getAll(...refs);
      assertSourceUnchanged(current, before, assignments);
      const activeAuthors = await tx.getAll(...authorRefs);
      if (activeAuthors.some(doc => !doc.exists || doc.data().banned || doc.data().accountFrozen || doc.data().accountDeletionPending)) {
        throw new Error("İşlem sırasında yazar hesabı değişti.");
      }
      const backup = current.map(snap => ({ path: snap.ref.path, data: snap.data() }));
      if (Buffer.byteLength(JSON.stringify(backup)) > 800_000) throw new Error("Güvenli yedek boyut sınırı aşıldı.");
      for (let index = 0; index < after.length; index++) {
        tx.update(refs[index * 7], {
          ...storyChanges(after[index], covers[index]), updatedAt: FieldValue.serverTimestamp(),
        });
        after[index].chapters.forEach((chapter, chapterIndex) => {
          tx.update(refs[index * 7 + chapterIndex + 1], {
            ...chapterChanges(chapter), updatedAt: FieldValue.serverTimestamp(),
          });
        });
      }
      tx.create(revisionRef, {
        status: "complete", contentDigest: digest, sourceDigest,
        covers, backup, createdAt: FieldValue.serverTimestamp(),
      });
    });
    await verifySaved(db, refs, after, assignments, covers, bytes);
  } finally { await deleteApp(app); }
}

main().catch(error => {
  console.error(error?.code ? `Firebase işlemi başarısız (${String(error.code)}); gizli ayrıntılar yazdırılmadı.` : error.message);
  process.exitCode = 1;
});
