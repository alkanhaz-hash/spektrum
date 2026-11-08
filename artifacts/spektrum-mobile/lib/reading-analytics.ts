import { Platform } from "react-native";
import { auth } from "./firebase";
import type { ReadingObservation, StoryReadingReport } from "@workspace/reading-analytics";
export type { StoryReadingReport } from "@workspace/reading-analytics";

async function request<T>(path: string, input?: ReadingObservation): Promise<T> {
  const base = (process.env.EXPO_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
  if (!base && Platform.OS !== "web") throw new Error("İstatistik sunucusu adresi bu sürümde yapılandırılmamış.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    if (!input && !auth.currentUser) throw new Error("İstatistikleri görmek için giriş yapmalısın.");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    const response = await fetch(`${base}/api/reading-analytics${path}`, {
      method: input ? "POST" : "GET", headers, signal: controller.signal,
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "İstatistik servisine ulaşılamadı.");
    return body as T;
  } finally { clearTimeout(timer); }
}
export const sendReadingObservation = (input: ReadingObservation) => request<{ accepted: boolean }>("/observations", input);
export const getReadingReport = (storyId: string, days: 7 | 30 | 90) =>
  request<StoryReadingReport>(`/report?storyId=${encodeURIComponent(storyId)}&days=${days}`);
