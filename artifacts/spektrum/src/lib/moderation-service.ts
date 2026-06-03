/**
 * Client-side moderation helper — calls the Express /api/moderation endpoints.
 *
 * NOT: import.meta.env.BASE_URL Vite'ın uygulama base path'idir (/spektrum/ gibi).
 * API çağrılarında KULLANILMAZ — /api prefix'i shared proxy tarafından doğrudan
 * yönlendirilir, BASE_URL ile birleştirmek /spektrum/api/... → 404 üretir.
 */

export interface ModerationResult {
  safe: boolean;
  action: "approved" | "pending_review" | "rejected";
  categories: string[];
  score: number;
  reason: string | null;
}

export async function moderateText(text: string, language = "tr"): Promise<ModerationResult> {
  const res = await fetch("/api/moderation/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error("Moderasyon servisi yanıt vermedi");
  return res.json();
}

export async function moderateMedia(url: string, mediaType: "image" | "video" | "gif"): Promise<ModerationResult> {
  const res = await fetch("/api/moderation/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, mediaType }),
  });
  if (!res.ok) throw new Error("Moderasyon servisi yanıt vermedi");
  return res.json();
}
