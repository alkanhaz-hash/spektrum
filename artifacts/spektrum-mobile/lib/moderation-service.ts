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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // "data:image/jpeg;base64,XXXX" → "XXXX"
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Base64 dönüşümü başarısız"));
    reader.readAsDataURL(blob);
  });
}

export async function checkImageSafety(asset: {
  mimeType?: string | null;
  fileSize?: number | null;
  uri: string;
}): Promise<ModerationResult> {
  const apiBase = getApiBase();
  const url = `${apiBase}/api/moderation/media`;
  try {
    let imageBase64: string | undefined;
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      imageBase64 = await blobToBase64(blob);
    } catch {
      // Base64 alınamadı — sadece metadata gönder, sunucu yine de format kontrolü yapar
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mimeType: asset.mimeType ?? "image/jpeg",
        fileSizeBytes: asset.fileSize ?? 0,
        ...(imageBase64 ? { imageBase64 } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ModerationResult>;
  } catch {
    // Fail-closed: moderasyon servisine ulaşılamıyorsa gönderimi engelle.
    return {
      safe: false,
      action: "rejected",
      categories: [],
      score: 0,
      reason: "Moderasyon servisine ulaşılamadı. Lütfen tekrar dene.",
    };
  }
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
