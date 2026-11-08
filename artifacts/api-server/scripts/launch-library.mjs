import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SEED_ID = "spektrum-launch-library";
// Legacy public note retained only to identify and remove it from existing records.
export const ATTRIBUTION_NOTE = "SPEKTRUM başlangıç koleksiyonu için yapay zekâ desteğiyle hazırlanmış özgün hikâye; hesap sahibinin izniyle bu profile atanmıştır.";
const GENRES = new Set(["Fantastik", "Romantik", "Gizem", "Komedi", "Bilim Kurgu", "Macera", "Gençlik", "Dram", "Spor"]);
export const CONTENT_DIR = fileURLToPath(new URL("../seed-content/", import.meta.url));
export const wordCount = text => text.trim().split(/\s+/u).filter(Boolean).length;
const hash = value => createHash("sha256").update(value).digest("hex");

export function parseStory(source, filename) {
  if (!/^\d{2}-[a-z0-9-]+\.md$/.test(filename)) throw new Error("Geçersiz içerik dosyası adı.");
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  const sections = normalized.split(/^## /m);
  const header = sections.shift();
  const lines = header.split("\n").filter(Boolean);
  if (lines.length !== 4 || !lines[0].startsWith("# ") ||
      !lines[1].startsWith("Tür: ") || !lines[2].startsWith("Etiketler: ") ||
      !lines[3].startsWith("Özet: ")) throw new Error(`${filename}: Başlık bilgileri eksik.`);
  const title = lines[0].slice(2).trim();
  const genre = lines[1].slice(5).trim();
  const summary = lines[3].slice(6).trim();
  const tags = lines[2].slice(11).split(",").map(t => t.trim()).filter(Boolean);
  if (!title || title.length > 150 || !GENRES.has(genre) || summary.length < 40 ||
      summary.length > 2000 || tags.length < 2) throw new Error(`${filename}: Geçersiz hikâye bilgisi.`);
  const chapters = sections.map((section, index) => {
    const newline = section.indexOf("\n");
    const match = section.slice(0, newline).match(/^(\d+)\. (.+)$/u);
    const content = section.slice(newline + 1).trim();
    const count = wordCount(content);
    if (!match || Number(match[1]) !== index + 1 || count < 70 ||
        Buffer.byteLength(content, "utf8") > 100_000) {
      throw new Error(`${filename}: ${index + 1}. bölüm eksik, sırasız veya boyut sınırı dışında.`);
    }
    return { title: match[2].trim(), content, order: index + 1, wordCount: count };
  });
  if (chapters.length < 6 || chapters.length > 30) throw new Error(`${filename}: En az altı bölüm gerekir.`);
  return {
    id: `launch_${filename.slice(0, -3)}`, title, genre, tags, summary, chapters,
    wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
  };
}

export async function loadStoriesFromDirectory(directory) {
  const names = (await readdir(directory)).filter(name => /^\d{2}-[a-z0-9-]+\.md$/.test(name)).sort();
  if (names.length !== 10) throw new Error("Başlangıç kütüphanesi tam 10 hikâye içermeli.");
  const stories = await Promise.all(names.map(async name =>
    parseStory(await readFile(`${directory}/${name}`, "utf8"), name)));
  if (new Set(stories.map(s => s.title)).size !== 10) throw new Error("Tekrarlanan hikâye başlığı.");
  const chapterTexts = stories.flatMap(s => s.chapters.map(ch => ch.content));
  if (new Set(chapterTexts).size !== chapterTexts.length) throw new Error("Tekrarlanan bölüm metni.");
  if (Buffer.byteLength(JSON.stringify(stories), "utf8") > 2_000_000) {
    throw new Error("Kütüphane tek atomik kayıt için boyut sınırını aşıyor.");
  }
  return stories;
}

export async function loadStories() {
  return loadStoriesFromDirectory(CONTENT_DIR);
}

export function libraryDigest(stories) {
  return hash(JSON.stringify(stories));
}

function completedResult(data, digest) {
  if (data.status !== "complete" || data.contentDigest !== digest ||
      !Array.isArray(data.assignments) || data.assignments.length !== 10) {
    throw new Error("Önceki başlangıç kaydı farklı veya tamamlanmamış. Otomatik üzerine yazılmadı.");
  }
  return { status: "already-complete", assignments: data.assignments };
}

/**
 * No HTTP endpoint: trusted, explicit operator-only operation.
 * ALL stories, chapters, profile increments and the completion receipt commit
 * in a single transaction. Failure leaves nothing; retry never overwrites edits,
 * recreates a removed story, reassigns authors or increments counters twice.
 */
export async function seedLibrary(db, stories, { apply = false, fields, verifyAuthors, seedId = SEED_ID }) {
  const digest = libraryDigest(stories);
  const receiptRef = db.collection("privateSeedRuns").doc(seedId);
  const perform = async (reader, transaction) => {
    const receipt = await reader.get(receiptRef);
    if (receipt.exists) return completedResult(receipt.data(), digest);
    const profiles = await reader.get(db.collection("users"));
    if (profiles.docs.length !== 10) {
      throw new Error(`10 kullanıcı bekleniyordu; ${profiles.docs.length} profil bulundu. Hesap seçimi yeniden netleştirilmeli.`);
    }
    const authors = profiles.docs.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const author of authors) {
      const data = author.data();
      if (data.banned === true || data.accountFrozen === true || data.accountDeletionPending === true ||
          typeof data.displayName !== "string" || !data.displayName.trim() ||
          (data.storyCount !== undefined && (!Number.isSafeInteger(data.storyCount) || data.storyCount < 0))) {
        throw new Error("Etkin olmayan, silinmekte olan veya eksik profilli hesap var. Hiçbir içerik kaydedilmedi.");
      }
    }
    // Auth existence/provider/disabled checks are read-only. This never signs in
    // as another user, creates credentials, changes roles or alters rules.
    await verifyAuthors(authors.map(author => author.id));
    const assignments = stories.map((story, index) => ({
      storyId: story.id, title: story.title, authorId: authors[index].id,
      authorName: authors[index].data().displayName,
      chapterCount: story.chapters.length,
    }));
    const entries = stories.flatMap(story => [
      db.collection("stories").doc(story.id),
      ...story.chapters.map(ch => db.collection("chapters").doc(`${story.id}_chapter_${ch.order}`)),
    ]);
    // Check every deterministic ID before queuing any writes.
    for (const ref of entries) {
      if ((await reader.get(ref)).exists) {
        throw new Error("Bir hikâye veya bölüm kimliği zaten mevcut. Mevcut içerik korunarak işlem durduruldu.");
      }
    }
    if (!apply) return { status: "dry-run", assignments };
    if (!transaction || !fields) throw new Error("Atomik yazma bağlamı eksik.");
    for (let index = 0; index < stories.length; index++) {
      const story = stories[index];
      const author = authors[index];
      const profile = author.data();
      transaction.create(db.collection("stories").doc(story.id), {
        authorId: author.id, authorName: profile.displayName,
        authorAvatar: typeof profile.avatarUrl === "string" ? profile.avatarUrl : "",
        title: story.title, summary: story.summary, genre: story.genre, tags: story.tags,
        coverUrl: "", chapterCount: story.chapters.length,
        readCount: 0, likeCount: 0, commentCount: 0, status: "published",
        seedCollection: seedId,
        createdAt: fields.serverTimestamp(), updatedAt: fields.serverTimestamp(),
      });
      for (const chapter of story.chapters) {
        transaction.create(db.collection("chapters").doc(`${story.id}_chapter_${chapter.order}`), {
          ...chapter, storyId: story.id, status: "published",
          readCount: 0, isPaid: false, price: 0,
          createdAt: fields.serverTimestamp(), updatedAt: fields.serverTimestamp(),
        });
      }
      transaction.update(author.ref, { storyCount: fields.increment(1) });
    }
    transaction.create(receiptRef, {
      status: "complete", contentDigest: digest, assignments,
      createdAt: fields.serverTimestamp(), authorConsentConfirmed: true,
      contentOrigin: "ai-assisted-original",
    });
    return { status: "created", assignments };
  };
  return apply
    ? db.runTransaction(transaction => perform(transaction, transaction))
    : perform({ get: ref => ref.get() });
}

export async function verifyLibrary(db, stories) {
  const receipt = await db.collection("privateSeedRuns").doc(SEED_ID).get();
  if (!receipt.exists || receipt.data().status !== "complete" ||
      receipt.data().contentDigest !== libraryDigest(stories) ||
      !Array.isArray(receipt.data().assignments) || receipt.data().assignments.length !== stories.length) {
    throw new Error("Canlı yayın makbuzu eksik veya beklenen içerikle uyuşmuyor.");
  }
  const assignments = new Map(receipt.data().assignments.map(item => [item.storyId, item]));
  const refs = stories.flatMap(story => [
    db.collection("stories").doc(story.id),
    ...story.chapters.map(ch => db.collection("chapters").doc(`${story.id}_chapter_${ch.order}`)),
  ]);
  const saved = await db.getAll(...refs);
  if (saved.length !== refs.length || saved.some(item => !item.exists)) {
    throw new Error("Hikâye veya bölüm eksik; işlem doğrulanmış sayılmaz.");
  }
  let position = 0;
  for (const story of stories) {
    const assignment = assignments.get(story.id);
    if (!assignment) throw new Error("Hikâye/yazar eşleştirme makbuzu eksik.");
    const stored = saved[position++].data();
    if (stored.authorId !== assignment.authorId || stored.authorName !== assignment.authorName ||
        stored.title !== story.title || stored.status !== "published" ||
        stored.chapterCount !== story.chapters.length ||
        stored.summary !== story.summary) {
      throw new Error("Yayınlanmış hikâye veya yazar sahipliği beklenen değerlerle uyuşmuyor.");
    }
    for (const chapter of story.chapters) {
      const chapterData = saved[position++].data();
      if (chapterData.storyId !== story.id || chapterData.order !== chapter.order ||
          chapterData.title !== chapter.title || chapterData.content !== chapter.content ||
          chapterData.status !== "published" || chapterData.isPaid !== false) {
        throw new Error("Bir bölüm eksik veya içeriği beklenen sürümden farklı.");
      }
    }
  }
  return { status: "verified", stories: stories.length, chapters: saved.length - stories.length };
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function libraryHtml(stories) {
  const links = stories.map(s => `<li><a href="#${s.id}">${escapeHtml(s.title)}</a> — ${s.chapters.length} bölüm, ${s.wordCount} kelime</li>`).join("");
  const articles = stories.map(s => `<article id="${s.id}"><h1>${escapeHtml(s.title)}</h1><p class="meta">${escapeHtml(s.genre)} · ${s.chapters.length} bölüm · ${s.wordCount} kelime</p><p>${escapeHtml(s.summary)}</p>${s.chapters.map(ch => `<section><h2>${ch.order}. ${escapeHtml(ch.title)}</h2>${ch.content.split(/\n\s*\n/u).map(p => `<p>${escapeHtml(p)}</p>`).join("")}</section>`).join("")}<a href="#baslangic">İçindekilere dön</a></article>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SPEKTRUM — Başlangıç Kütüphanesi</title><style>html{scroll-behavior:smooth}body{font:18px/1.8 Georgia,serif;background:#faf8f3;color:#24302f;max-width:760px;margin:auto;padding:28px}h1,h2{line-height:1.3}h1{font-size:2rem}h2{font-size:1.45rem;margin-top:3rem}article{border-top:2px solid #d8e0d4;margin-top:5rem;padding-top:2rem}.meta,nav{font-family:system-ui,sans-serif;font-size:.9rem}a{color:#266951}li{margin-bottom:.6rem}p{white-space:pre-line}@media print{nav{display:none}article{break-before:page}body{max-width:none;background:white}}@media(max-width:500px){body{padding:20px;font-size:17px}h1{font-size:1.7rem}}</style></head><body><header id="baslangic"><h1>SPEKTRUM Başlangıç Kütüphanesi</h1><p>10 özgün hikâye · ${stories.reduce((n, s) => n + s.chapters.length, 0)} bölüm · ${stories.reduce((n, s) => n + s.wordCount, 0)} kelime</p></header><nav aria-label="İçindekiler"><ol>${links}</ol></nav>${articles}</body></html>`;
}
