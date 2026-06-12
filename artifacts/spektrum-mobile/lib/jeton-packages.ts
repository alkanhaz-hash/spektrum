export interface JetonPackage {
  id: string;
  label: string;
  jetonAmount: number;
  bonusAmount: number;
  totalJeton: number;
  priceTRY: number | null;
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
    priceTRY: 49,
    unitPriceTRY: 0.16,
    popular: false,
  },
  {
    id: "popular",
    label: "Popüler",
    jetonAmount: 500,
    bonusAmount: 75,
    totalJeton: 575,
    priceTRY: 79,
    unitPriceTRY: 0.14,
    popular: true,
  },
  {
    id: "super",
    label: "Süper",
    jetonAmount: 1000,
    bonusAmount: 200,
    totalJeton: 1200,
    priceTRY: 149,
    unitPriceTRY: 0.12,
    popular: false,
  },
  {
    id: "mega",
    label: "Mega",
    jetonAmount: 2000,
    bonusAmount: 500,
    totalJeton: 2500,
    priceTRY: 249,
    unitPriceTRY: 0.10,
    popular: false,
  },
];

export const WORDS_PER_JETON = 100;
export const MIN_CHAPTER_COST = 5;

export function calculateChapterCost(wordCount: number): number {
  const raw = Math.ceil(wordCount / WORDS_PER_JETON);
  return Math.max(raw, MIN_CHAPTER_COST);
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
