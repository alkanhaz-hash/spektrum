import { Router } from "express";
import { getMessaging } from "firebase-admin/messaging";
import { Timestamp } from "firebase-admin/firestore";
import { GetPushDeviceResponse, RegisterPushDeviceBody, DisablePushDeviceBody, TestPushDeviceBody } from "@workspace/api-zod";
import { PushError, deviceState, registerDevice, revokeDevice, activeAccount } from "@workspace/push-notifications/server";
import { messageFor } from "@workspace/push-notifications/delivery";
import { adminAuth, adminDb } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

const router = Router();
const limits = new Map<string, { count: number; until: number }>();
router.use("/push", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now(), key = req.ip ?? "unknown";
  if (limits.size >= 10000) for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
  const old = limits.get(key), window = old && old.until > now ? old : { count: 0, until: now + 60_000 };
  if ((!limits.has(key) && limits.size >= 10000) || ++window.count > 60) {
    res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Çok fazla istek. Bir dakika bekle." }); return;
  }
  limits.set(key, window); next();
});
async function uid(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) throw new PushError(401, "Giriş yapmalısın.");
  try { return (await adminAuth().verifyIdToken(header.slice(7), true)).uid; }
  catch { throw new PushError(401, "Oturumunu yenileyip tekrar dene."); }
}
const id = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
function requireDeliveryReady() {
  if (process.env.SPEKTRUM_PUSH_DELIVERY_ENABLED !== "true") {
    throw new PushError(503, "Telefon bildirimleri henüz etkinleştirilmedi. Firebase gönderim servisi hazırlandıktan sonra tekrar dene.");
  }
}
function failure(res: import("express").Response, error: unknown) {
  if (error instanceof PushError) res.status(error.status).json({ error: error.message });
  else {
    // FCM errors can contain tokens; never log their raw objects.
    const code = (error as { code?: unknown })?.code;
    logger.error({ code: typeof code === "string" && /^[a-z-]+(\/[a-z-]+)?$/.test(code) ? code : "push-error" }, "Push operation failed");
    res.status(503).json({ error: "Bildirim servisine ulaşılamadı. Firebase/FCM yapılandırmasını kontrol edip yeniden dene." });
  }
}
router.get("/push/device", async (req, res) => {
  try {
    const actor = await uid(req.headers.authorization);
    requireDeliveryReady();
    if (!id(req.query.installationId)) throw new PushError(400, "Geçersiz cihaz.");
    res.json(GetPushDeviceResponse.parse(await deviceState(adminDb(), actor, req.query.installationId)));
  } catch (e) { failure(res, e); }
});
router.put("/push/device", async (req, res) => {
  try {
    const actor = await uid(req.headers.authorization);
    requireDeliveryReady();
    const body = RegisterPushDeviceBody.strict().safeParse(req.body);
    if (!body.success) throw new PushError(400, "Geçersiz cihaz veya bildirim tercihi.");
    res.json(await registerDevice(adminDb(), actor, body.data));
  } catch (e) { failure(res, e); }
});
router.post("/push/disable", async (req, res) => {
  try {
    const body = DisablePushDeviceBody.strict().safeParse(req.body);
    if (!body.success) throw new PushError(400, "Geçersiz cihaz.");
    res.json(await revokeDevice(adminDb(), body.data.installationId, body.data.revokeSecret, body.data.revision));
  } catch (e) { failure(res, e); }
});
router.post("/push/test", async (req, res) => {
  try {
    const actor = await uid(req.headers.authorization), db = adminDb();
    requireDeliveryReady();
    await activeAccount(db, actor);
    const body = TestPushDeviceBody.strict().safeParse(req.body);
    if (!body.success) throw new PushError(400, "Geçersiz cihaz.");
    const ref = db.doc(`pushDevices/${body.data.installationId}`);
    const token = await db.runTransaction(async tx => {
      const d = (await tx.get(ref)).data();
      if (!d || d.uid !== actor || d.expiresAt.toMillis() <= Date.now()) throw new PushError(404, "Önce bu telefonda bildirimleri aç.");
      if ((d.lastTestAt?.toMillis() ?? 0) > Date.now() - 60_000) throw new PushError(429, "Yeni deneme için bir dakika bekle.");
      tx.update(ref, { lastTestAt: Timestamp.now() }); return d.token as string;
    });
    await getMessaging(adminAuth().app).send(messageFor(actor, token, "spektrum-test", {
      mode: "test", targetId: "settings", body: "Deneme bildirimi. Telefon bildirimlerin hazır.",
    }));
    res.json({ accepted: true });
  } catch (e) { failure(res, e); }
});
export default router;
