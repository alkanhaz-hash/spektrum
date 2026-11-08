/** Three targeted, cover-only repairs. No story text, chapter or owner writes. */
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const ROOT = "generated-artifacts/book-cover-repairs";
const PROJECT = "spektrum-5c7cc";
const BUCKET = `${PROJECT}.firebasestorage.app`;
const RECEIPT = "spektrum-cover-anatomy-repair";
const targets = [
  { key: "06", id: "launch_06-mavi-defterin-rotasi", title: "Mavi Defterin Rotası",
    caption: "Mavi Defterin\nRotası", source: "generated-artifacts/book-covers",
    receipt: "spektrum-launch-library", crop: "640x950+192+36", artwork: "art-06-closed.png" },
  { key: "12", id: "launch_12-saat-kulesinin-sirri", title: "Saat Kulesinin Sırrı",
    caption: "Saat Kulesinin\nSırrı", source: "generated-artifacts/book-covers-diverse",
    receipt: "spektrum-romance-adventure-library", artwork: "art-12.png" },
  { key: "17", id: "launch_17-fenerin-ardindaki-ses", title: "Fenerin Yanında Bir Yaz",
    caption: "Fenerin Yanında\nBir Yaz", source: "generated-artifacts/book-covers-diverse",
    receipt: "spektrum-romance-adventure-library", artwork: "art-17.png" },
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
class RepairConflict extends Error {}
function check(condition, message) { if (!condition) throw new RepairConflict(message); }

export function coverChanges(cover) {
  return { coverUrl: cover.url, coverStoragePath: cover.path };
}

export function assertCoverUnchanged(data, plan) {
  check(data && data.title === plan.title && data.authorId === plan.authorId &&
    data.coverUrl === plan.oldUrl && (data.coverStoragePath ?? null) === plan.oldStoragePath,
  "Mevcut kapak, başlık veya sahiplik değişmiş; yazarın düzenlemesini korumak için işlem durdu.");
}

async function render() {
  const exec = promisify(execFile);
  const serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";
  const sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  for (const target of targets) {
    const args = [`${ROOT}/${target.artwork}`, "-resize", "1024x1024!"];
    if (target.crop) args.push("-crop", target.crop, "+repage");
    args.push("-resize", target.crop ? "800x1200!" : "800x1200^",
      "-gravity", "center", "-extent", "800x1200", "-colorspace", "sRGB",
      "(", "-size", "800x360", "gradient:#081427ee-#08142700", ")",
      "-gravity", "north", "-compose", "over", "-composite",
      "(", "-background", "none", "-fill", "#fff5da", "-font", serif,
      "-pointsize", "55", "-interline-spacing", "5", "-size", "736x185",
      "-gravity", "center", `caption:${target.caption}`, ")",
      "-gravity", "north", "-geometry", "+0+48", "-composite",
      "(", "-size", "800x110", "gradient:#08142700-#081427cc", ")",
      "-gravity", "south", "-geometry", "+0+0", "-composite",
      "-font", sans, "-pointsize", "20", "-fill", "#fff5da",
      "-gravity", "south", "-annotate", "+0+30", "S P E K T R U M",
      "-strip", "-quality", "85", `${ROOT}/cover-${target.key}.webp`);
    await exec("magick", args);
  }
  await exec("magick", ["montage", "-font", sans, ...targets.map(t => `${ROOT}/cover-${t.key}.webp`),
    "-thumbnail", "400x600", "-tile", "3x1", "-geometry", "+12+12",
    "-background", "#eef0f3", `${ROOT}/duzeltilmis-kapaklar.jpg`]);
  console.log("Üç düzeltilmiş kapak hazır; canlı veriler henüz değiştirilmedi.");
}

async function verify(db, plans, covers) {
  const snapshots = await db.getAll(...plans.map(plan => plan.ref));
  for (let index = 0; index < plans.length; index++) {
    const data = snapshots[index].data();
    check(data?.title === plans[index].title && data.authorId === plans[index].authorId &&
      data.coverUrl === covers[index].url && data.coverStoragePath === covers[index].path,
    "Canlı kapak kaydı doğrulanamadı.");
    const response = await fetch(covers[index].url);
    check(response.ok && response.headers.get("content-type")?.includes("image/webp") &&
      Buffer.from(await response.arrayBuffer()).equals(plans[index].bytes),
    "Halka açık kapak dosyası doğrulanamadı.");
  }
  console.log("Canlı doğrulama başarılı: yalnızca belirtilen üç kapağın bağlantıları yenilendi.");
}

async function main() {
  const args = process.argv.slice(2);
  check(args.every(arg => ["--render", "--apply", `--confirm-project=${PROJECT}`].includes(arg)), "Bilinmeyen seçenek.");
  if (args.includes("--render")) { check(args.length === 1, "Render çevrimdışı çalıştırılmalı."); await render(); return; }
  const apply = args.includes("--apply");
  check(!apply || args.includes(`--confirm-project=${PROJECT}`), "Proje onayı gerekli.");
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "null");
  check(account?.project_id === PROJECT && process.env.VITE_FIREBASE_STORAGE_BUCKET === BUCKET, "Firebase projesi doğrulanamadı.");
  const app = initializeApp({ credential: cert(account), storageBucket: BUCKET }, "cover-anatomy-repair");
  try {
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket();
    const plans = await Promise.all(targets.map(async target => {
      const bytes = await readFile(`${ROOT}/cover-${target.key}.webp`);
      check(bytes.length > 1000 && bytes.length < 500_000 &&
        bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP", "Kapak biçimi geçersiz.");
      return { ...target, bytes, digest: hash(bytes), ref: db.doc(`stories/${target.id}`) };
    }));
    const digest = hash(JSON.stringify(plans.map(p => [p.id, p.digest])));
    const repairRef = db.doc(`privateSeedRuns/${RECEIPT}`);
    const repair = await repairRef.get();
    if (repair.exists) {
      check(repair.data()?.status === "complete" && repair.data()?.digest === digest, "Farklı bir kapak düzeltme kaydı var.");
      console.log("Bu üç kapak daha önce düzeltildi; sonraki yazar düzenlemelerine dokunulmadı.");
      return;
    }
    for (const plan of plans) {
      const [snapshot, source] = await Promise.all([plan.ref.get(), db.doc(`privateSeedRuns/${plan.receipt}`).get()]);
      const data = snapshot.data();
      const assignment = source.data()?.assignments?.find(item => item.storyId === plan.id);
      check(source.data()?.status === "complete" && assignment && data?.authorId === assignment.authorId &&
        data.title === plan.title && data.seedCollection === plan.receipt, "Kitap sahipliği doğrulanamadı.");
      const oldBytes = await readFile(`${plan.source}/cover-${plan.key}.webp`);
      const oldPath = `story-covers/${data.authorId}/${plan.id}-art-${hash(oldBytes).slice(0, 20)}.webp`;
      check(typeof data.coverUrl === "string" && data.coverUrl.includes(encodeURIComponent(oldPath)),
        "Yazarın sonradan değiştirdiği kapak otomatik ezilmedi.");
      Object.assign(plan, {
        authorId: data.authorId, oldUrl: data.coverUrl, oldStoragePath: data.coverStoragePath ?? null,
        path: `story-covers/${data.authorId}/${plan.id}-art-${plan.digest.slice(0, 20)}.webp`,
      });
    }
    console.table(plans.map(p => ({ kitap: p.title, boyutKB: Math.round(p.bytes.length / 1024) })));
    if (!apply) { console.log("Salt-okunur kontrol başarılı; hiçbir veri değiştirilmedi."); return; }
    const covers = [];
    for (const plan of plans) {
      const file = bucket.file(plan.path);
      const [exists] = await file.exists();
      let token;
      if (exists) {
        const [metadata] = await file.getMetadata();
        token = metadata.metadata?.firebaseStorageDownloadTokens?.split(",")[0];
        check(token, "Kapak erişim kaydı eksik.");
      } else {
        token = randomUUID();
        await file.save(plan.bytes, { resumable: false, validation: "crc32c",
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable",
            metadata: { firebaseStorageDownloadTokens: token } } });
      }
      covers.push({ path: plan.path, url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(plan.path)}?alt=media&token=${token}` });
    }
    await db.runTransaction(async tx => {
      check(!(await tx.get(repairRef)).exists, "Düzeltme başka bir işlemde tamamlanmış; yeniden kontrol et.");
      const current = await tx.getAll(...plans.map(p => p.ref));
      plans.forEach((plan, index) => assertCoverUnchanged(current[index].data(), plan));
      plans.forEach((plan, index) => tx.update(plan.ref, {
        ...coverChanges(covers[index]), updatedAt: FieldValue.serverTimestamp(),
      }));
      tx.create(repairRef, { status: "complete", digest, createdAt: FieldValue.serverTimestamp(),
        records: plans.map((p, index) => ({ storyId: p.id, before: { url: p.oldUrl, path: p.oldStoragePath }, after: covers[index] })) });
    });
    await verify(db, plans, covers);
  } finally { await deleteApp(app); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof RepairConflict ? error.message
      : process.argv.includes("--render") ? (error.stderr || error.message)
      : "Kapak işlemi başarısız; gizli Firebase ayrıntıları yazdırılmadı.");
    process.exitCode = 1;
  });
}
