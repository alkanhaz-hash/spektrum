// ─── JETON PAKETLERİ ─────────────────────────────────────────────────────────
// Fiyatlar şimdilik null — ödeme entegrasyonu (Google Play Billing / iyzico)
// hazır olunca buraya eklenecek. Sadece paket yapısını ve jeton miktarını
// tanımlar; UI bu dosyadan okur.

export interface JetonPackage {
  id: string;
  label: string;
  jetonAmount: number;
  /** ₺ cinsinden fiyat — null ise "Yakında" gösterilir */
  priceTRY: number | null;
  /** Bonus yüzdesi (büyük pakette extra jeton) */
  bonusPercent: number;
  popular?: boolean;
}

export const JETON_PACKAGES: JetonPackage[] = [
  {
    id: "starter",
    label: "Başlangıç",
    jetonAmount: 100,
    priceTRY: null,
    bonusPercent: 0,
  },
  {
    id: "popular",
    label: "Popüler",
    jetonAmount: 400,
    priceTRY: null,
    bonusPercent: 0,
    popular: true,
  },
  {
    id: "super",
    label: "Süper",
    jetonAmount: 800,
    priceTRY: null,
    bonusPercent: 14,
  },
  {
    id: "mega",
    label: "Mega",
    jetonAmount: 1500,
    priceTRY: null,
    bonusPercent: 25,
  },
];

// ─── PREMIUM ÖZELLİK MALİYETLERİ ─────────────────────────────────────────────
// Kullanıcının bir işlem için harcayacağı jeton miktarları.

export const JETON_COSTS = {
  /** Hikayeyi 24 saat öne çıkar */
  STORY_BOOST: 200,
  /** Profil rozetini kilidi aç */
  PROFILE_BADGE: 500,
  /** Ücretli bölüm okuma */
  PAID_CHAPTER: 20,
  /** Yazara destek ver (bahşiş) */
  TIP_WRITER_SMALL: 50,
  TIP_WRITER_MEDIUM: 100,
  TIP_WRITER_LARGE: 250,
} as const;

export type JetonSpendReason = keyof typeof JETON_COSTS;
