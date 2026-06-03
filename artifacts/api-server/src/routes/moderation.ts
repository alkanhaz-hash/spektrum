import { Router, Request, Response } from "express";
import { ModerateTextBody, ModerateMediaBody } from "@workspace/api-zod";

const router = Router();

// ─── Turkish + English content filter ────────────────────────────────────────

const CATEGORIES = {
  sexual: [
    // Turkish
    "seks", "cinsel", "müstehcen", "porno", "porniyo", "porni", "erotik",
    "tecavüz", "cinsel taciz", "fuhuş", "orospu", "fahişe", "sikiş", "sikişme",
    "göt", "penis", "vajina", "meme", "yarak", "amk", "amına", "sikeyim",
    "siktir", "oç", "orospu çocuğu", "taşak", "sik",
    // English
    "porn", "nude", "naked", "xxx", "nsfw", "hentai",
    "rape", "molest", "prostitut",
  ],
  violence: [
    // Turkish — aşırı genel kelimeler kaldırıldı ("kesmek", "vurmak")
    "öldür", "katliam", "bıçaklamak", "katil", "cinayet",
    "bomba", "patlama", "terörist", "terör", "infaz", "işkence", "kıyım",
    "kurban et", "kan dök", "kelle", "başını kopar", "parçala", "ezip geç",
    "döverim", "kıracağım", "öldürece", "katlede", "vahşet", "linç",
    // English
    "kill", "murder", "massacre", "slaughter", "torture", "behead", "execute",
    "terrorist", "bomb", "blow up", "genocide",
  ],
  drugs: [
    // Turkish
    "eroin", "kokain", "esrar", "uyuşturucu", "bong", "ot çek", "tiner",
    "metamfetamin", "ectasy", "ecstasy", "uyuştur", "madde kullan", "bağımlılık",
    "kafayı bul", "kafayı yak", "uyuşturucu kaçakçı",
    // English
    "heroin", "cocaine", "meth", "crystal meth", "fentanyl", "ecstasy",
    "drug deal", "overdose", "narcotics",
  ],
  suicide: [
    // Turkish
    "intihar et", "kendini öldür", "canına kıy", "hayatına son ver",
    "ölmek istiyorum", "yaşamak istemiyorum", "kendine zarar ver",
    "bileklerini kes", "kendini as", "zehirlen", "intihar yöntemi",
    "ölmenin yolu", "nasıl intihar",
    // English
    "kill yourself", "commit suicide", "end your life", "how to suicide",
    "self harm", "cut yourself", "suicide method",
  ],
  child_safety: [
    // Turkish
    "çocuk istismar", "pedofil", "çocuğa tecavüz",
    "reşit olmayan", "çocuk pornosu", "loli",
    // English
    "child abuse", "pedophil", "minor sex", "underage sex", "child porn", "loli",
  ],
  weapons: [
    // Turkish
    "silah sat", "silah kaçakçı", "tabanca al", "ruhsatsız silah",
    "bomba yap", "el bombası", "patlayıcı", "molotof",
    // English
    "buy gun", "illegal weapon", "make bomb", "explosive", "firearm sell",
  ],
};

type Category = keyof typeof CATEGORIES;

interface ScanResult {
  flagged: boolean;
  categories: Category[];
  score: number;
}

/**
 * Tam kelime sınırı eşleşmesi: Türkçe/İngilizce harf olmayan karakterlerle
 * çevrilmiş olmasını gerektirir.
 * Bu sayede "am" → "anlam", "program", "kamera" gibi kelimelerde eşleşmez.
 */
function matchesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const letters = "a-zA-ZğüşöçıİĞÜŞÖÇ0-9";
  const pattern = new RegExp(`(?<![${letters}])${escaped}(?![${letters}])`, "i");
  return pattern.test(text);
}

function scanText(text: string): ScanResult {
  const lower = text.toLowerCase();
  const found: Category[] = [];

  for (const [cat, words] of Object.entries(CATEGORIES) as [Category, string[]][]) {
    if (words.some((w) => matchesKeyword(lower, w))) {
      found.push(cat);
    }
  }

  const weights: Record<Category, number> = {
    child_safety: 1.0,
    sexual: 0.85,
    suicide: 0.8,
    violence: 0.7,
    drugs: 0.6,
    weapons: 0.6,
  };

  const score = found.length === 0
    ? 0
    : Math.min(1, found.reduce((acc, c) => acc + weights[c], 0) / 2);

  return { flagged: found.length > 0, categories: found, score };
}

const CATEGORY_LABELS: Record<Category, string> = {
  sexual: "müstehcen içerik",
  violence: "şiddet içeriği",
  drugs: "uyuşturucu/madde",
  suicide: "intihar yönlendirme",
  child_safety: "çocuk güvenliği ihlali",
  weapons: "yasadışı silah",
};

// ─── TEXT MODERATION ──────────────────────────────────────────────────────────

router.post("/text", async (req: Request, res: Response) => {
  const parsed = ModerateTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz istek" });
    return;
  }

  const { text } = parsed.data;
  const result = scanText(text);

  if (!result.flagged) {
    res.json({ safe: true, action: "approved", categories: [], score: 0, reason: null });
    return;
  }

  const hardBlock: Category[] = ["child_safety", "suicide"];
  const isHardBlock = result.categories.some((c) => hardBlock.includes(c));
  const labels = result.categories.map((c) => CATEGORY_LABELS[c]).join(", ");
  const reason = `İçerik şu kategorilerde uygunsuz içerik barındırıyor: ${labels}.`;

  res.json({
    safe: false,
    action: isHardBlock || result.score > 0.8 ? "rejected" : "pending_review",
    categories: result.categories,
    score: result.score,
    reason,
  });
});

// ─── MEDIA MODERATION ─────────────────────────────────────────────────────────

router.post("/media", async (req: Request, res: Response) => {
  const parsed = ModerateMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz istek" });
    return;
  }

  const { url, mediaType } = parsed.data;
  const lowerUrl = url.toLowerCase();
  const suspiciousPatterns = [
    "porn", "xxx", "nude", "naked", "nsfw", "hentai", "sex",
    "porno", "müstehcen", "erotik",
  ];

  if (suspiciousPatterns.some((p) => lowerUrl.includes(p))) {
    res.json({
      safe: false,
      action: "rejected" as const,
      categories: ["sexual"],
      score: 0.95,
      reason: "Medya URL'si uygunsuz içerik barındırıyor.",
    });
    return;
  }

  if (mediaType === "video" || mediaType === "gif") {
    res.json({
      safe: true,
      action: "pending_review" as const,
      categories: [],
      score: 0.1,
      reason: `${mediaType === "video" ? "Video" : "GIF"} içerikler moderatör onayına gönderildi.`,
    });
    return;
  }

  res.json({ safe: true, action: "approved" as const, categories: [], score: 0, reason: null });
});

export default router;
