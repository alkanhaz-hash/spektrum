export interface JetonPackage {
  id: string;
  productId: string;
  label: string;
  jetonAmount: number;
  bonusAmount: number;
  totalJeton: number;
  priceTRY: number;
  popular?: boolean;
}

export const JETON_PACKAGES: JetonPackage[] = [
  {
    id: "starter",
    productId: "spektrum_jeton_starter",
    label: "Başlangıç",
    jetonAmount: 300,
    bonusAmount: 0,
    totalJeton: 300,
    priceTRY: 144.99,
    popular: false,
  },
  {
    id: "popular",
    productId: "spektrum_jeton_popular",
    label: "Popüler",
    jetonAmount: 500,
    bonusAmount: 75,
    totalJeton: 575,
    priceTRY: 229.99,
    popular: true,
  },
  {
    id: "super",
    productId: "spektrum_jeton_super",
    label: "Süper",
    jetonAmount: 1000,
    bonusAmount: 200,
    totalJeton: 1200,
    priceTRY: 449.99,
    popular: false,
  },
  {
    id: "mega",
    productId: "spektrum_jeton_mega",
    label: "Mega",
    jetonAmount: 2000,
    bonusAmount: 500,
    totalJeton: 2500,
    priceTRY: 849.99,
    popular: false,
  },
];

export const PLAY_STORE_SKUS = JETON_PACKAGES.map(p => p.productId);

export const WORDS_PER_JETON = 100;
export const MIN_CHAPTER_COST = 5;

export function calculateChapterCost(wordCount: number): number {
  return Math.max(Math.ceil(wordCount / WORDS_PER_JETON), MIN_CHAPTER_COST);
}

export function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

export const JETON_COSTS = {
  STORY_BOOST: 200,
  PROFILE_BADGE: 500,
  TIP_WRITER_SMALL: 50,
  TIP_WRITER_MEDIUM: 100,
  TIP_WRITER_LARGE: 250,
} as const;

export type JetonSpendReason = keyof typeof JETON_COSTS;
