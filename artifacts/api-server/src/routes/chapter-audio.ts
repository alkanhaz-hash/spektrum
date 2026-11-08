import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { adminAuth, adminBucket, adminDb } from "../lib/firebase-admin";
import { AudioError, MAX_AUDIO_BYTES, audioMime, audioRange, audioServiceFailureMessage, canReadAudio, readAudioTicket, signAudioTicket, validAudioHeader, validAudioId } from "../lib/chapter-audio-core";

type AudioServices = { auth: typeof adminAuth; db: typeof adminDb; bucket: typeof adminBucket; signingSecret?: string };
export function createChapterAudioRouter(services: AudioServices = { auth: adminAuth, db: adminDb, bucket: adminBucket }) {
const { auth: adminAuth, db: adminDb, bucket: adminBucket } = services;
const router = Router();
const uploads = new Set<string>();
type StoredAudio = { id: string; fileName: string; sizeBytes: number; mime: string; ownerUid: string; objectPath: string };
function secret() {
  const value = services.signingSecret ?? process.env.SESSION_SECRET;
  if (!value) throw new AudioError(503, "Ses hizmeti yapılandırılmamış.");
  return value;
}
async function profile(uid: string) {
  if (!uid) return {};
  const value = (await adminDb().collection("users").doc(uid).get()).data();
  if (!value || value.isBanned || value.isFrozen || value.accountDeletionPending) throw new AudioError(403, "Hesabın bu işleme kapalı.");
  return value;
}
async function caller(req: Request, required = false) {
  if (!req.headers.authorization) {
    if (required) throw new AudioError(401, "Ses eklemek için giriş yapmalısın.");
    return "";
  }
  try {
    const token = await adminAuth().verifyIdToken(req.headers.authorization.replace(/^Bearer /, ""), true);
    if (token.accountDeletionPending) throw new AudioError(403, "Hesabın bu işleme kapalı.");
    if (required && (!token.email_verified || token.firebase?.sign_in_provider === "anonymous")) throw new AudioError(403, "Bu işlem için hesabını doğrulamalısın.");
    if (!required && token.firebase?.sign_in_provider === "anonymous") return "";
    return token.uid;
  } catch (e) {
    if (e instanceof AudioError) throw e;
    throw new AudioError(401, "Ses eklemek için giriş yapmalısın.");
  }
}
async function access(chapterId: string, uid: string, manage = false) {
  if (!validAudioId(chapterId)) throw new AudioError(404, "Bölüm bulunamadı.");
  const db = adminDb();
  const chapter = (await db.collection("chapters").doc(chapterId).get()).data();
  if (!chapter || !validAudioId(chapter.storyId)) throw new AudioError(404, "Bölüm bulunamadı.");
  const story = (await db.collection("stories").doc(chapter.storyId).get()).data();
  const account = await profile(uid);
  if (!story || (manage ? !uid || story.authorId !== uid : !canReadAudio(chapter, story, uid, account.role)))
    throw new AudioError(403, "Bu bölüme erişim iznin yok.");
  return { chapter, story, account };
}
function info(chapterId: string, audio: StoredAudio, uid: string) {
  const ticket = signAudioTicket({ chapterId, audioId: audio.id, uid, expires: Date.now() + 90 * 60_000 }, secret());
  return { id: audio.id, fileName: audio.fileName, sizeBytes: audio.sizeBytes, playbackUrl: `/api/chapter-audio-stream?ticket=${ticket}` };
}
function fail(req: Request, res: Response, error: unknown) {
  if (res.headersSent || res.destroyed) { res.destroy(); return; }
  if (error instanceof AudioError) { res.status(error.status).json({ error: error.message }); return; }
  req.log.error({ message: error instanceof Error ? error.message : "Unknown audio error" }, "Chapter audio operation failed");
  res.status(503).json({ error: audioServiceFailureMessage(error) });
}
router.use(["/chapter-audio/:chapterId", "/chapter-audio-stream"], (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
router.get("/chapter-audio/:chapterId", async (req, res) => {
  try {
    const id = String(req.params.chapterId);
    const uid = await caller(req);
    await access(id, uid);
    const audio = (await adminDb().collection("chapterAudio").doc(id).get()).data() as StoredAudio | undefined;
    res.json({ audio: audio ? info(id, audio, uid) : null });
  } catch (e) { fail(req, res, e); }
});
router.put("/chapter-audio/:chapterId", async (req, res) => {
  let path: string | undefined;
  let uid = "";
  let locked = false;
  try {
    secret(); // Refuse an upload before accepting bytes if playback cannot be issued.
    uid = await caller(req, true);
    const id = String(req.params.chapterId);
    const { chapter } = await access(id, uid, true);
    const expected = req.headers["if-match"];
    if (typeof expected !== "string") throw new AudioError(428, "Ses bilgisini yenileyip tekrar dene.");
    if (uploads.has(uid) || uploads.size >= 100) throw new AudioError(429, "Bir ses yüklemesi zaten sürüyor. Biraz bekle.");
    uploads.add(uid); locked = true;
    const ref = adminDb().collection("chapterAudio").doc(id);
    const before = (await ref.get()).data() as StoredAudio | undefined;
    if ((before?.id ?? "none") !== expected) throw new AudioError(409, "Bu ses dosyası başka bir oturumda değiştirildi. Yenileyip tekrar dene.");
    let name: string;
    try { name = decodeURIComponent(String(req.headers["x-audio-name"] ?? "")); }
    catch { throw new AudioError(400, "Ses dosyasının adı geçersiz."); }
    if (!name || name.length > 180 || /[/\\\x00-\x1f]/.test(name)) throw new AudioError(400, "Ses dosyasının adı geçersiz.");
    const mime = audioMime(name, String(req.headers["content-type"] ?? "").split(";")[0]!);
    const length = Number(req.headers["content-length"]);
    if (Number.isFinite(length) && length > MAX_AUDIO_BYTES) throw new AudioError(413, "Ses dosyası en fazla 100 MB olabilir.");
    const version = randomUUID();
    path = `chapter-audio/${uid}/${id}/${version}`;
    const file = adminBucket().file(path);
    let total = 0;
    let prefix = Buffer.alloc(0);
    let checked = false;
    const guard = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        total += chunk.length;
        if (total > MAX_AUDIO_BYTES) return done(new AudioError(413, "Ses dosyası en fazla 100 MB olabilir."));
        if (!checked) {
          prefix = Buffer.concat([prefix, chunk]);
          if (prefix.length < 12) return done();
          if (!validAudioHeader(prefix, mime)) return done(new AudioError(415, "Yalnızca MP3 veya M4A ses dosyası yükleyebilirsin."));
          checked = true;
          done(null, prefix); prefix = Buffer.alloc(0);
        } else done(null, chunk);
      },
      flush(done) {
        if (!checked || total < 128) return done(new AudioError(415, "Ses dosyası geçersiz veya boş."));
        done();
      },
    });
    // Streaming bounds memory; upload has no Firebase download token/public ACL.
    const timeout = setTimeout(() => req.destroy(new Error("Audio upload timeout")), 15 * 60_000);
    try {
      await pipeline(req, guard, file.createWriteStream({ resumable: false, metadata: { contentType: mime, cacheControl: "private, no-store" } }));
    } finally { clearTimeout(timeout); }
    const audio: StoredAudio = { id: version, fileName: name, sizeBytes: total, mime, ownerUid: uid, objectPath: path };
    await adminDb().runTransaction(async tx => {
      const [current, chapterNow, storyNow, userNow] = await Promise.all([
        tx.get(ref), tx.get(adminDb().collection("chapters").doc(id)),
        tx.get(adminDb().collection("stories").doc(chapter.storyId)),
        tx.get(adminDb().collection("users").doc(uid)),
      ]);
      if (!chapterNow.exists || chapterNow.data()?.storyId !== chapter.storyId || storyNow.data()?.authorId !== uid
          || !userNow.exists || userNow.data()?.accountDeletionPending || userNow.data()?.isBanned || userNow.data()?.isFrozen)
        throw new AudioError(403, "Bu bölüme erişim iznin yok.");
      if ((current.data()?.id ?? "none") !== expected) throw new AudioError(409, "Bu ses dosyası başka bir oturumda değiştirildi. Yenileyip tekrar dene.");
      tx.set(ref, { ...audio, updatedAt: new Date() });
    });
    path = undefined; // Attached: never delete committed audio in the error cleanup.
    if (before?.objectPath?.startsWith(`chapter-audio/${uid}/${id}/`)) {
      await adminBucket().file(before.objectPath).delete({ ignoreNotFound: true }).catch(e => req.log.warn({ message: String(e) }, "Old chapter audio cleanup pending"));
    }
    res.json({ audio: info(id, audio, uid) });
  } catch (e) {
    if (path) await adminBucket().file(path).delete({ ignoreNotFound: true }).catch(() => {});
    fail(req, res, e);
  } finally { if (locked) uploads.delete(uid); }
});
router.delete("/chapter-audio/:chapterId", async (req, res) => {
  try {
    const uid = await caller(req, true);
    await profile(uid);
    const id = String(req.params.chapterId);
    if (!validAudioId(id)) throw new AudioError(404, "Bölüm bulunamadı.");
    const ref = adminDb().collection("chapterAudio").doc(id);
    const audio = (await ref.get()).data() as StoredAudio | undefined;
    if (!audio) { res.sendStatus(204); return; }
    if (audio.ownerUid !== uid) throw new AudioError(403, "Bu bölüme erişim iznin yok.");
    if (audio.id !== req.headers["if-match"]) throw new AudioError(409, "Bu ses dosyası başka bir oturumda değiştirildi. Yenileyip tekrar dene.");
    if (!audio.objectPath.startsWith(`chapter-audio/${uid}/${id}/`)) throw new AudioError(403, "Bu bölüme erişim iznin yok.");
    // Delete this immutable version first. A storage failure leaves retryable metadata;
    // a concurrent replacement cannot have its new object or metadata deleted.
    await adminBucket().file(audio.objectPath).delete({ ignoreNotFound: true });
    await adminDb().runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.id !== audio.id) throw new AudioError(409, "Bu ses dosyası başka bir oturumda değiştirildi. Yenileyip tekrar dene.");
      tx.delete(ref);
    });
    res.sendStatus(204);
  } catch (e) { fail(req, res, e); }
});
router.get("/chapter-audio-stream", async (req, res) => {
  try {
    const ticket = readAudioTicket(String(req.query.ticket ?? ""), secret());
    await access(ticket.chapterId, ticket.uid);
    const audio = (await adminDb().collection("chapterAudio").doc(ticket.chapterId).get()).data() as StoredAudio | undefined;
    if (!audio || audio.id !== ticket.audioId || !audio.objectPath.startsWith(`chapter-audio/${audio.ownerUid}/${ticket.chapterId}/`))
      throw new AudioError(404, "Ses dosyası bulunamadı.");
    let range;
    try { range = audioRange(req.headers.range, audio.sizeBytes); }
    catch (e) { res.setHeader("Content-Range", `bytes */${audio.sizeBytes}`); throw e; }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", audio.mime);
    res.setHeader("Content-Length", range ? range.end - range.start + 1 : audio.sizeBytes);
    if (range) { res.status(206); res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${audio.sizeBytes}`); }
    if (req.method === "HEAD") { res.end(); return; }
    const stream = adminBucket().file(audio.objectPath).createReadStream(range ?? {});
    res.on("close", () => stream.destroy());
    stream.on("error", e => fail(req, res, e));
    stream.pipe(res);
  } catch (e) { fail(req, res, e); }
});
return router;
}
export default createChapterAudioRouter();
