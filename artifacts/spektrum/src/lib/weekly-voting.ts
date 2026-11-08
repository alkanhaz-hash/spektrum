import {
  getWeeklyLeaderboard as fetchLeaderboard,
  getMyWeeklyVote as fetchMyVote,
  castWeeklyVote as submitVote,
} from "@workspace/api-client-react";
import { auth } from "./firebase";

export type { WeeklyLeaderboard, WeeklyVoteStatus } from "@workspace/api-client-react";

async function headers() {
  if (!auth.currentUser) throw new Error("Oy vermek için giriş yapmalısın.");
  return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
}

function message(error: unknown): never {
  if ((error as { name?: string }).name === "AbortError") {
    throw new Error("Oylama sunucusu zamanında yanıt vermedi. Tekrar deneyebilirsin.");
  }
  const e = error as { data?: { error?: string }; message?: string };
  throw new Error(e.data?.error ?? e.message ?? "Oylama servisine ulaşılamadı.");
}

async function request<T>(action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { return await action(controller.signal); }
  catch (error) { return message(error); }
  finally { clearTimeout(timer); }
}
export async function getWeeklyLeaderboard() {
  return request(signal => fetchLeaderboard({ signal }));
}
export async function getMyWeeklyVote() {
  return request(async signal => fetchMyVote({ signal, headers: await headers() }));
}
export async function castWeeklyVote(storyId: string) {
  return request(async signal => submitVote({ storyId }, { signal, headers: await headers() }));
}
