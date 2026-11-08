import { Router, type Request, type Response } from "express";
import { CastWeeklyVoteBody, CastWeeklyVoteResponse, GetMyWeeklyVoteResponse, GetWeeklyLeaderboardResponse } from "@workspace/api-zod";
import { adminAuth, adminDb } from "../lib/firebase-admin";
import { getWeeklyStandings, readWeeklyChoice, recordWeeklyVote, VotingError } from "../lib/weekly-voting";

const router = Router();
// Bound public read costs and failed writes per instance; weekly uniqueness is database-enforced.
const windows = new Map<string, { count: number; until: number }>();
function limited(key: string, max: number) {
  const now = Date.now();
  if (windows.size >= 10_000) {
    for (const [id, value] of windows) if (value.until <= now) windows.delete(id);
    if (windows.size >= 10_000 && !windows.has(key)) return true;
  }
  let window = windows.get(key);
  if (!window || window.until <= now) {
    window = { count: 0, until: now + 60_000 };
    windows.set(key, window);
  }
  return ++window.count > max;
}
async function caller(req: Request) {
  if (!req.headers.authorization?.startsWith("Bearer ")) throw new VotingError(401, "AUTH_REQUIRED", "Oy vermek için giriş yapmalısın.");
  try {
    const token = await adminAuth().verifyIdToken(req.headers.authorization.slice(7), true);
    if (token.firebase?.sign_in_provider === "anonymous" || !token.email_verified) {
      throw new VotingError(403, "VERIFICATION_REQUIRED", "Oy vermek için kayıtlı hesabının e-postasını doğrulamalısın.");
    }
    if (limited(`user:${token.uid}`, 30)) throw new VotingError(429, "RATE_LIMIT", "Çok sık denedin. Bir dakika bekle.");
    return token.uid;
  } catch (error) {
    if (error instanceof VotingError) throw error;
    if (String((error as { code?: string }).code).startsWith("auth/")) {
      throw new VotingError(401, "AUTH_REQUIRED", "Oturumunu yenileyip tekrar giriş yapmalısın.");
    }
    throw error;
  }
}
function failure(req: Request, res: Response, error: unknown) {
  if (error instanceof VotingError) {
    if (error.status === 429) res.set("Retry-After", "60");
    res.status(error.status).json({ error: error.message, code: error.code });
  } else {
    req.log.error({ err: error }, "Weekly voting operation failed");
    res.status(503).json({ error: "Oylama servisine şu an ulaşılamıyor. Tekrar deneyebilirsin.", code: "VOTING_UNAVAILABLE" });
  }
}
router.use("/weekly-votes", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (limited(`ip:${req.ip ?? "unknown"}`, 120)) {
    failure(req, res, new VotingError(429, "RATE_LIMIT", "Çok sık denedin. Bir dakika bekle."));
    return;
  }
  next();
});
router.get("/weekly-votes", async (req, res): Promise<void> => {
  try { res.json(GetWeeklyLeaderboardResponse.parse(await getWeeklyStandings(adminDb()))); }
  catch (error) { failure(req, res, error); }
});
router.get("/weekly-votes/me", async (req, res): Promise<void> => {
  try {
    const uid = await caller(req);
    res.json(GetMyWeeklyVoteResponse.parse(await readWeeklyChoice(adminDb(), uid)));
  } catch (error) { failure(req, res, error); }
});
router.post("/weekly-votes", async (req, res): Promise<void> => {
  try {
    const input = CastWeeklyVoteBody.strict().safeParse(req.body);
    if (!input.success) throw new VotingError(400, "INVALID_INPUT", "Yalnızca geçerli bir hikâye seçmelisin.");
    const uid = await caller(req);
    res.json(CastWeeklyVoteResponse.parse(await recordWeeklyVote(adminDb(), uid, input.data.storyId)));
  } catch (error) { failure(req, res, error); }
});
export default router;
