/**
 * Explicit operator-only presentation update for the existing launch collection.
 * Reuses Firebase Storage; never creates stories, reassigns authors or writes chapters.
 * Default is read-only. --apply --confirm-project=spektrum-5c7cc enables writes.
 */
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { loadStories, SEED_ID, ATTRIBUTION_NOTE } from "./launch-library.mjs";

export function cleanLaunchSummary(summary) {
  if (typeof summary !== "string") throw new Error("Hikâye açıklaması geçersiz.");
  return summary.replace(ATTRIBUTION_NOTE, "").trim();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--confirm-project=spektrum-5c7cc"].includes(arg))) {
    throw new Error("Bilinmeyen seçenek.");
  }
  const apply = args.includes("--apply");
  if (apply && !args.includes("--confirm-project=spektrum-5c7cc")) {
    throw new Error("Yazılacak proje açıkça doğrulanmalı.");
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Firebase hizmet hesabı Secrets alanında eksik.");
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error("Hizmet hesabı biçimi geçersiz."); }
  if (account.project_id !== "spektrum-5c7cc") throw new Error("Yanlış Firebase projesi.");
  const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (bucketName !== "spektrum-5c7cc.firebasestorage.app") throw new Error("Mevcut Firebase Storage kovası doğrulanamadı.");
  const app = initializeApp({ credential: cert(account), storageBucket: bucketName }, "launch-presentation");
  try {
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket();
    const stories = await loadStories();
    const receipt = await db.doc(`privateSeedRuns/${SEED_ID}`).get();
    const assignments = receipt.data()?.assignments;
    if (receipt.data()?.status !== "complete" || !Array.isArray(assignments) || assignments.length !== 10) {
      throw new Error("Başlangıç koleksiyonu sahiplik makbuzu eksik.");
    }
    const snapshots = await db.getAll(...stories.map(story => db.doc(`stories/${story.id}`)));
    const plans = [];
    for (let index = 0; index < stories.length; index++) {
      const story = stories[index];
      const snap = snapshots[index];
      const data = snap.data();
      const assignment = assignments.find(item => item.storyId === story.id);
      if (!snap.exists || !assignment || data.authorId !== assignment.authorId ||
          data.seedCollection !== SEED_ID || data.title !== story.title) {
        throw new Error(`${story.title}: mevcut hikâye/sahiplik beklenen kayıtla uyuşmuyor.`);
      }
      const bytes = await readFile(`generated-artifacts/book-covers/cover-${String(index + 1).padStart(2, "0")}.webp`);
      if (bytes.length < 1000 || bytes.length > 500_000 ||
          bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
        throw new Error(`${story.title}: kapak biçimi veya boyutu geçersiz.`);
      }
      const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
      const path = `story-covers/${data.authorId}/${story.id}-art-${digest}.webp`;
      const oldCover = data.coverUrl ?? "";
      if (oldCover && !oldCover.includes(encodeURIComponent(path))) {
        throw new Error(`${story.title}: yazarın mevcut kapağı otomatik ezilmedi.`);
      }
      plans.push({
        ref: snap.ref, title: story.title, authorId: data.authorId,
        oldSummary: data.summary, oldCover, summary: cleanLaunchSummary(data.summary),
        bytes, path, url: oldCover,
      });
    }
    console.table(plans.map(plan => ({ title: plan.title, coverKB: Math.round(plan.bytes.length / 1024), removeNote: plan.oldSummary !== plan.summary })));
    if (!apply) { console.log("Salt-okunur kontrol başarılı. Hiçbir kayıt değiştirilmedi."); return; }
    // Upload first; one transaction publishes all ten URLs only after every
    // object succeeds. Content-addressed paths make interrupted retries safe.
    for (const plan of plans) {
      const file = bucket.file(plan.path);
      const [exists] = await file.exists();
      let token;
      if (exists) {
        const [metadata] = await file.getMetadata();
        token = metadata.metadata?.firebaseStorageDownloadTokens?.split(",")[0];
        if (!token) throw new Error("Var olan kapak için indirme erişimi eksik.");
      } else {
        token = randomUUID();
        await file.save(plan.bytes, {
          resumable: false, validation: "crc32c",
          metadata: { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable",
            metadata: { firebaseStorageDownloadTokens: token } },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      }
      plan.url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(plan.path)}?alt=media&token=${token}`;
    }
    await db.runTransaction(async tx => {
      const current = await tx.getAll(...plans.map(plan => plan.ref));
      for (let index = 0; index < plans.length; index++) {
        const data = current[index].data();
        const plan = plans[index];
        if (!data || data.authorId !== plan.authorId || data.summary !== plan.oldSummary ||
            (data.coverUrl ?? "") !== plan.oldCover || data.title !== plan.title) {
          throw new Error("İşlem sırasında hikâye düzenlendi. Değişiklikler ezilmeden durduruldu.");
        }
      }
      for (const plan of plans) {
        tx.update(plan.ref, {
          summary: plan.summary, coverUrl: plan.url,
          contentOrigin: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(db.doc(`privateSeedRuns/${SEED_ID}-presentation`), {
        updatedAt: FieldValue.serverTimestamp(),
        contentOrigin: "ai-assisted-original",
        stories: plans.map(plan => ({ storyId: plan.ref.id, storagePath: plan.path })),
      });
    });
    const saved = await db.getAll(...plans.map(plan => plan.ref));
    for (let index = 0; index < plans.length; index++) {
      const data = saved[index].data();
      const plan = plans[index];
      if (data.summary !== plan.summary || data.coverUrl !== plan.url || data.authorId !== plan.authorId ||
          data.contentOrigin !== undefined || /yapay zek[aâ]|hesap sahibinin izniyle/iu.test(data.summary)) {
        throw new Error("Kayıt sonrası doğrulama başarısız.");
      }
      const response = await fetch(plan.url);
      if (!response.ok || !response.headers.get("content-type")?.includes("image/webp")) {
        throw new Error(`${plan.title}: halka açık kapak indirilemedi.`);
      }
      const downloaded = Buffer.from(await response.arrayBuffer());
      if (!downloaded.equals(plan.bytes)) throw new Error("İndirilen kapak dosyası beklenen görselle uyuşmuyor.");
    }
    console.log("Doğrulandı: 10 kapak ve temizlenmiş açıklama canlıda. Sahiplik ve bölümler korunmuştur.");
  } finally { await deleteApp(app); }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(() => {
    // Do not dump SDK errors: storage request errors can contain signed URLs.
    console.error("Kapak güncellemesi tamamlanamadı. Gizli ayrıntılar yazdırılmadı; mevcut kayıtlar yeniden kontrol edilmeli.");
    process.exitCode = 1;
  });
}
