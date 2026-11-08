import { Platform } from "react-native";
import { auth } from "./firebase";

export interface WeeklyVoteStatus {
  weekId: string;
  startsAt: string;
  endsAt: string;
  storyId: string | null;
}
export interface WeeklyLeaderboard {
  weekId: string;
  startsAt: string;
  endsAt: string;
  entries: { storyId: string; title: string; authorName: string; coverUrl: string; votes: number; rank: number }[];
}

async function request<T>(path: string, authenticated = false, storyId?: string): Promise<T> {
  const base = (process.env.EXPO_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
  if (!base && Platform.OS !== "web") throw new Error("Oylama sunucusu adresi bu sürümde yapılandırılmamış.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authenticated) {
    if (!auth.currentUser) throw new Error("Oy vermek için giriş yapmalısın.");
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${base}/api/weekly-votes${path}`, {
      method: storyId === undefined ? "GET" : "POST",
      headers, signal: controller.signal,
      ...(storyId === undefined ? {} : { body: JSON.stringify({ storyId }) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Oylama servisine ulaşılamadı.");
    return data as T;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error("Oylama sunucusu zamanında yanıt vermedi. Tekrar deneyebilirsin.");
    }
    throw error;
  } finally { clearTimeout(timer); }
}
export const getWeeklyLeaderboard = () => request<WeeklyLeaderboard>("");
export const getMyWeeklyVote = () => request<WeeklyVoteStatus>("/me", true);
export const castWeeklyVote = (storyId: string) => request<WeeklyVoteStatus>("", true, storyId);
