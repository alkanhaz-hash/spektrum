import { Router, Request, Response } from "express";
import { ModerateTextBody } from "@workspace/api-zod";

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
const WORD_BOUNDARY = "a-zA-ZğüşöçıİĞÜŞÖÇ0-9";

function buildKeywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Gerekçe: keyword'ler statik, geliştirici tanımlı CATEGORIES listesinden gelir,
  // regex özel karakterleri escape edilir, iç içe niceleyici (backtracking) yoktur ve
  // kullanıcı girdisiyle regex kurulmaz; ReDoS riski yoktur.
  // nosemgrep: detect-non-literal-regexp
  return new RegExp(`(?<![${WORD_BOUNDARY}])${escaped}(?![${WORD_BOUNDARY}])`, "i");
}

// Desenleri modül yüklenirken bir kez derle (her tarama çağrısında yeniden derlemeyi önler).
const KEYWORD_PATTERNS: Map<string, RegExp> = new Map();
for (const words of Object.values(CATEGORIES)) {
  for (const w of words) {
    if (!KEYWORD_PATTERNS.has(w)) KEYWORD_PATTERNS.set(w, buildKeywordPattern(w));
  }
}

function matchesKeyword(text: string, keyword: string): boolean {
  const pattern = KEYWORD_PATTERNS.get(keyword) ?? buildKeywordPattern(keyword);
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

// ─── MEDIA MODERATION (mobil istemci) ────────────────────────────────────────
// Web istemcisi tarayıcı tabanlı nsfwjs kullanır; mobil istemci bu endpoint'i çağırır.
// Kabul edilen MIME türleri ve maksimum boyut denetlenir; içerik analizi kural tabanlıdır.

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

router.post("/media", (req: Request, res: Response) => {
  const { mimeType, fileSizeBytes } = req.body as {
    mimeType?: string;
    fileSizeBytes?: number;
  };

  if (!mimeType || typeof mimeType !== "string") {
    res.status(400).json({ error: "mimeType gerekli" });
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    res.json({
      safe: false,
      action: "rejected",
      categories: ["unsupported_format"],
      score: 1,
      reason: `Desteklenmeyen dosya türü: ${mimeType}. Yalnızca JPEG, PNG, WebP ve GIF kabul edilir.`,
    });
    return;
  }

  if (typeof fileSizeBytes === "number" && fileSizeBytes > MAX_SIZE_BYTES) {
    res.json({
      safe: false,
      action: "rejected",
      categories: ["file_too_large"],
      score: 1,
      reason: `Dosya boyutu çok büyük (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maksimum 10 MB izin verilir.`,
    });
    return;
  }

  res.json({ safe: true, action: "approved", categories: [], score: 0, reason: null });
});

export default router;
