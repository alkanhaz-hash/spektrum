import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /api/discover/trending
 *
 * Returns top 20 trending stories based on engagement.
 * In production this would query Firestore via the Admin SDK.
 * We return a stable mock here so the frontend can render the Keşfet feed
 * before a Firestore Admin integration is wired up.
 */
router.get("/trending", async (_req: Request, res: Response) => {
  const GENRES = [
    "Fantastik", "Romantik", "Gizem", "Korku", "Bilim Kurgu",
    "Macera", "Dram", "Psikolojik", "Tarihi", "Gençlik",
  ];

  const stories = Array.from({ length: 12 }, (_, i) => ({
    storyId: `story-${i + 1}`,
    title: [
      "Karanlığın Çocukları",
      "Mor Ufuklar",
      "Gece Yarısı Şiirleri",
      "Sessiz Fırtına",
      "Yıldızların Dili",
      "Kayıp Şehir",
      "Gölge Krallığı",
      "Sonsuz Yolculuk",
      "Neon Bahçesi",
      "Derin Mavi",
      "Ateş ve Kül",
      "Kırık Aynalar",
    ][i],
    authorId: `author-${i + 1}`,
    authorName: [
      "Elif Kara", "Mert Yıldız", "Selin Aydın", "Can Demir",
      "Zeynep Çelik", "Arda Koç", "Büşra Şahin", "Emre Tok",
      "İrem Bal", "Kaan Aslan", "Leyla Nur", "Ozan Çam",
    ][i],
    coverUrl: null,
    commentCount: Math.floor(Math.random() * 300) + 50,
    readCount: Math.floor(Math.random() * 10000) + 500,
    engagementScore: parseFloat((Math.random() * 5 + 1).toFixed(2)),
    genre: GENRES[i % GENRES.length],
    trendingRank: i + 1,
  }));

  res.json(stories);
});

export default router;
