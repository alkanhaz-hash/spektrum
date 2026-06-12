export interface ModerationResult {
  safe: boolean;
  action: "approved" | "pending_review" | "rejected";
  categories: string[];
  score: number;
  reason: string | null;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  try {
    const res = await fetch("/api/moderation/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "tr" }),
    });
    if (!res.ok) throw new Error("not ok");
    return res.json() as Promise<ModerationResult>;
  } catch {
    return {
      safe: true,
      action: "pending_review",
      categories: [],
      score: 0,
      reason: "İçerik moderatör incelemesine gönderildi.",
    };
  }
}
