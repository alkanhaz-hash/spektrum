import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/", async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text gerekli" });
    return;
  }
  if (text.length > 15000) {
    res.status(400).json({ error: "Metin çok uzun (max 15000 karakter)" });
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `Türkçe yazım ve noktalama düzeltme asistanısın. Verilen metni şu kurallara göre düzelt:
- Yazım hatalarını düzelt (yanlış/eksik harf, yanlış kelime)
- Noktalama işaretlerini düzelt (eksik nokta, virgül, soru işareti vb.)
- Büyük/küçük harf kurallarını uygula (cümle başları, özel isimler)
- Birleşik/ayrı yazım kurallarını uygula
- Türkçe dil bilgisi kurallarını uygula

ÖNEMLİ: Metnin anlamını, tonunu, yazı stilini ve içeriğini KESINLIKLE değiştirme. Sadece hataları düzelt. Kelime veya cümle ekleme çıkarma yapma.

Yanıtını şu JSON formatında ver (başka hiçbir şey yazma):
{"corrected":"düzeltilmiş metnin tamamı","changes":["yapılan değişiklik 1","yapılan değişiklik 2"]}`
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Geçersiz yanıt formatı" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { corrected?: string; changes?: string[] };
    res.json({
      corrected: parsed.corrected ?? text,
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    });
  } catch (err) {
    req.log.error(err, "correction error");
    res.status(500).json({ error: "Düzeltme başarısız oldu" });
  }
});

export default router;
