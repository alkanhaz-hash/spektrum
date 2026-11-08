import { getStoryReadingReport, recordReadingObservation } from "@workspace/api-client-react";
import type { ReadingObservation } from "@workspace/reading-analytics";
import { auth } from "./firebase";
export type { StoryReadingReport } from "@workspace/reading-analytics";

async function request<T>(run: (options: RequestInit) => Promise<T>, required: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const user = auth.currentUser;
    if (required && !user) throw new Error("İstatistikleri görmek için giriş yapmalısın.");
    const headers: Record<string, string> = {};
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return await run({ headers, signal: controller.signal, keepalive: !required });
  } catch (e) {
    const error = e as { data?: { error?: string }; message?: string; name?: string };
    throw new Error(error.name === "AbortError" ? "İstatistik servisi zamanında yanıt vermedi." : error.data?.error ?? error.message ?? "İstatistik servisine ulaşılamadı.");
  } finally { clearTimeout(timer); }
}
export const sendReadingObservation = (input: ReadingObservation) =>
  request(options => recordReadingObservation(input, options), false);
export const getReadingReport = (storyId: string, days: 7 | 30 | 90) =>
  request(options => getStoryReadingReport({ storyId, days }, options), true);
