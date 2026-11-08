import { Router } from "express";
import { RecordReadingObservationBody, GetStoryReadingReportResponse } from "@workspace/api-zod";
import { adminAuth, adminDb } from "../lib/firebase-admin";
import { ReadingError, recordReading, readingReport } from "../lib/reading-analytics";

const router = Router();
const windows = new Map<string, { count: number; until: number }>();
router.use("/reading-analytics", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const now = Date.now(), key = `${req.method}:${req.ip ?? "unknown"}`;
  for (const [k, value] of windows) if (value.until <= now) windows.delete(k);
  if (windows.size >= 10000 && !windows.has(key)) {
    res.status(429).json({ error: "Ölçüm servisi meşgul." }); return;
  }
  const entry = windows.get(key) ?? { count: 0, until: now + 60_000 };
  windows.set(key, entry);
  if (++entry.count > (req.method === "GET" ? 12 : 180)) { res.set("Retry-After", "60").status(429).json({ error: "Çok sık istek gönderildi." }); return; }
  next();
});
async function caller(header: string | undefined, required: boolean) {
  if (!header) {
    if (required) throw new ReadingError(401, "Giriş yapmalısın.");
    return null;
  }
  if (!header.startsWith("Bearer ")) throw new ReadingError(401, "Geçersiz oturum.");
  try { return (await adminAuth().verifyIdToken(header.slice(7), true)).uid; }
  catch { throw new ReadingError(401, "Oturumunu yenileyip tekrar giriş yapmalısın."); }
}
router.post("/reading-analytics/observations", async (req, res) => {
  try {
    const parsed = RecordReadingObservationBody.strict().safeParse(req.body);
    if (!parsed.success) throw new ReadingError(400, "Geçersiz okuma ölçümü.");
    res.json(await recordReading(adminDb(), await caller(req.headers.authorization, false), parsed.data));
  } catch (e) {
    if (e instanceof ReadingError) res.status(e.status).json({ error: e.message });
    else { req.log.error({ err: e }, "Reading observation failed"); res.status(503).json({ error: "Okuma ölçümü kaydedilemedi." }); }
  }
});
router.get("/reading-analytics/report", async (req, res) => {
  try {
    const uid = await caller(req.headers.authorization, true);
    const storyId = req.query.storyId;
    const days = req.query.days === undefined ? 30 : Number(req.query.days);
    if (typeof storyId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(storyId) || ![7, 30, 90].includes(days)) {
      throw new ReadingError(400, "Hikâye ve 7, 30 veya 90 günlük dönem seçmelisin.");
    }
    res.json(GetStoryReadingReportResponse.parse(await readingReport(adminDb(), uid!, storyId, days)));
  } catch (e) {
    if (e instanceof ReadingError) res.status(e.status).json({ error: e.message });
    else { req.log.error({ err: e }, "Reading report failed"); res.status(503).json({ error: "İstatistikler yüklenemedi. Tekrar dene." }); }
  }
});
export default router;
