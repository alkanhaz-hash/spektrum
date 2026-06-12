import express, { Router, Request, Response } from "express";
import { ModerateTextBody } from "@workspace/api-zod";
import jpegjs from "jpeg-js";

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
// jpeg-js (pure-JS JPEG decoder) ile piksel seviyesi skin-tone analizi yapılır.
// Daha doğru bir analiz için TF Lite model entegrasyonu yapılabilir (ilerleyen sprint).

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const SKIN_RATIO_THRESHOLD = 0.45;       // %45'ten fazla skin-tone → uyarı

/**
 * Sempel (max 2500 piksel) üzerinde skin-tone oranı hesaplar.
 * Eşik: Chai ve arkadaşlarının (1999) RGB skin modeli.
 * R>95, G>40, B>20, max-min>15, |R-G|>15, R>G, R>B
 */
function skinRatio(data: Uint8Array, width: number, height: number): number {
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 2500));
  let skinCount = 0;
  let sampleCount = 0;

  for (let i = 0; i < total; i += step) {
    const off = i * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (
      r > 95 && g > 40 && b > 20 &&
      mx - mn > 15 &&
      Math.abs(r - g) > 15 &&
      r > g && r > b
    ) {
      skinCount++;
    }
    sampleCount++;
  }
  return sampleCount === 0 ? 0 : skinCount / sampleCount;
}

// Sadece bu rota için JSON body limitini artır (base64 kodlama ~%33 şişirir).
// 12 MB limit → maks. ~9 MB gerçek görsel verisi; MAX_SIZE_BYTES (10 MB) ile tutarlı.
// express.json() ile global limit değiştirilmez, güvenlik riski oluşmaz.
router.post("/media", express.json({ limit: "12mb" }), (req: Request, res: Response) => {
  const { mimeType, fileSizeBytes, imageBase64 } = req.body as {
    mimeType?: string;
    fileSizeBytes?: number;
    imageBase64?: string;
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

  // JPEG görsellerde piksel-seviyesi skin-tone analizi
  if (
    imageBase64 &&
    (mimeType.toLowerCase() === "image/jpeg" || mimeType.toLowerCase() === "image/jpg")
  ) {
    try {
      const buf = Buffer.from(imageBase64, "base64");
      const decoded = jpegjs.decode(buf, { useTArray: true, maxMemoryUsageInMB: 50 });
      const ratio = skinRatio(decoded.data, decoded.width, decoded.height);

      if (ratio >= SKIN_RATIO_THRESHOLD) {
        res.json({
          safe: false,
          action: "rejected",
          categories: ["sexual"],
          score: Math.min(1, ratio * 1.6),
          reason: "Görselde uygunsuz (müstehcen/çıplaklık) içerik tespit edildi.",
        });
        return;
      }
    } catch {
      // Decode başarısız → format invalid, reddet
      res.json({
        safe: false,
        action: "rejected",
        categories: ["invalid_image"],
        score: 1,
        reason: "Görsel okunamadı veya bozuk.",
      });
      return;
    }
  }

  res.json({ safe: true, action: "approved", categories: [], score: 0, reason: null });
});

export default router;
