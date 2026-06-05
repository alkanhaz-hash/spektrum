import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "Metin boş" });
    return;
  }

  const truncated = text.slice(0, 10000);

  const attempt = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text: truncated, language: "tr" }).toString(),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // 3 deneme hakkı — 429 / ağ hatası sonrası birer saniye bekle
  for (let i = 0; i < 3; i++) {
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 1000 * i));
      const r = await attempt();
      if (r.ok) {
        const data = await r.json();
        res.json(data);
        return;
      }
      if (r.status !== 429) break; // Tekrar denemek anlamsız
    } catch {
      // AbortError veya ağ hatası → sonraki deneme
    }
  }

  res.status(503).json({ error: "servis_mesgul" });
});

export default router;
