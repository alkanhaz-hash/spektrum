// ─── JETON PAKETLERİ ─────────────────────────────────────────────────────────
// Fiyatlar belirlendi. Ödeme entegrasyonu (Google Play Billing) hazır olunca
// bu dosyadaki priceTRY değerleri doğrudan kullanılacak.

export interface JetonPackage {
  id: string;
  label: string;
  /** Satın alınan temel jeton miktarı */
  jetonAmount: number;
  /** Bonus jeton (büyük pakette bedava extra) */
  bonusAmount: number;
  /** Toplam alınan jeton = jetonAmount + bonusAmount */
  totalJeton: number;
  /** ₺ cinsinden fiyat — null ise "Yakında" gösterilir */
  priceTRY: number | null;
  /** Etkin birim fiyat: priceTRY / totalJeton */
  unitPriceTRY: number | null;
  popular?: boolean;
}

export const JETON_PACKAGES: JetonPackage[] = [
  {
    id: "starter",
    label: "Başlangıç",
    jetonAmount: 300,
    bonusAmount: 0,
    totalJeton: 300,
    priceTRY: null,        // ödeme entegrasyonunda: 144.99
    unitPriceTRY: null,    // 0.483
    popular: false,
  },
  {
    id: "popular",
    label: "Popüler",
    jetonAmount: 500,
    bonusAmount: 75,
    totalJeton: 575,
    priceTRY: null,        // ödeme entegrasyonunda: 229.99
    unitPriceTRY: null,    // 0.400
    popular: true,
  },
  {
    id: "super",
    label: "Süper",
    jetonAmount: 1000,
    bonusAmount: 200,
    totalJeton: 1200,
    priceTRY: null,        // ödeme entegrasyonunda: 449.99
    unitPriceTRY: null,    // 0.375
    popular: false,
  },
  {
    id: "mega",
    label: "Mega",
    jetonAmount: 2000,
    bonusAmount: 500,
    totalJeton: 2500,
    priceTRY: null,        // ödeme entegrasyonunda: 849.99
    unitPriceTRY: null,    // 0.340
    popular: false,
  },
];

// ─── BÖLÜM OKUMA — KELIME BAZLI FİYATLANDIRMA ───────────────────────────────
// Her 100 kelime = 1 jeton. Minimum 5 jeton (çok kısa bölümler için taban).
// Hesaplama okuma anında yapılır; bölümün content alanından kelime sayılır.

export const WORDS_PER_JETON = 100;
export const MIN_CHAPTER_COST = 5;

/**
 * Bölüm içeriğinden gereken jeton miktarını hesaplar.
 * @param wordCount Bölümdeki kelime sayısı
 */
export function calculateChapterCost(wordCount: number): number {
  const raw = Math.ceil(wordCount / WORDS_PER_JETON);
  return Math.max(raw, MIN_CHAPTER_COST);
}

/**
 * Metin içeriğinden kelime sayısını döndürür.
 * Boşluk ve satır sonu karakterlerine göre böler.
 */
export function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

// ─── DİĞER PREMIUM ÖZELLİK MALİYETLERİ ──────────────────────────────────────

export const JETON_COSTS = {
  /** Hikayeyi 24 saat keşfet sayfasının başına taşı */
  STORY_BOOST: 200,
  /** Profil rozeti kilidi aç */
  PROFILE_BADGE: 500,
  /** Yazara küçük bahşiş */
  TIP_WRITER_SMALL: 50,
  /** Yazara orta bahşiş */
  TIP_WRITER_MEDIUM: 100,
  /** Yazara büyük bahşiş */
  TIP_WRITER_LARGE: 250,
} as const;

export type JetonSpendReason = keyof typeof JETON_COSTS;
