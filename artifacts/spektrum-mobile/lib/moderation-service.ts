import Constants from "expo-constants";

export interface ModerationResult {
  safe: boolean;
  action: "approved" | "pending_review" | "rejected";
  categories: string[];
  score: number;
  reason: string | null;
}

function getApiBase(): string {
  const base = (Constants.expoConfig?.extra as { apiBase?: string } | null)?.apiBase ?? "";
  return base;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const apiBase = getApiBase();
  const url = `${apiBase}/api/moderation/text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "tr" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ModerationResult>;
  } catch {
    return {
      safe: true,
      action: "pending_review",
      categories: [],
      score: 0,
      reason: "Moderasyon servisine ulaşılamadı; içerik incelemeye alındı.",
    };
  }
}
