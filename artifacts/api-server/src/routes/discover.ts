import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /api/discover/trending
 *
 * Gerçek trending için Firestore Admin SDK entegrasyonu gerekir.
 * Sahte mock veriler kaldırıldı — boş dizi döndürülüyor.
 * TODO: Firebase Admin SDK ile son 24 saatin en yüksek engagement skorlu
 * published hikayelerini sırala.
 */
router.get("/trending", async (_req: Request, res: Response) => {
  res.json([]);
});

export default router;
