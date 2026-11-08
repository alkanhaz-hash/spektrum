import { getChapterAudio as fetchAudio, removeChapterAudio as deleteAudio, type ChapterAudio } from "@workspace/api-client-react";
import { auth } from "./firebase";
export type { ChapterAudio } from "@workspace/api-client-react";
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

async function headers(required = false): Promise<Record<string, string>> {
  if (!auth.currentUser) {
    if (required) throw new Error("Ses eklemek için giriş yapmalısın.");
    return {};
  }
  return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
}
function readable(error: unknown): never {
  const e = error as { data?: { error?: string }; message?: string; status?: number };
  throw Object.assign(new Error(e.data?.error ?? e.message ?? "Ses yüklenemedi. Tekrar dene."), { status: e.status });
}
function usable(audio: ChapterAudio | null) {
  return audio ? { ...audio, playbackUrl: new URL(audio.playbackUrl, window.location.origin).href } : null;
}
export async function getChapterAudio(chapterId: string): Promise<ChapterAudio | null> {
  try { return usable((await fetchAudio(chapterId, { headers: await headers() })).audio); }
  catch (e) { return readable(e); }
}
export async function removeChapterAudio(chapterId: string, previousId: string) {
  try { await deleteAudio(chapterId, { headers: { ...await headers(true), "If-Match": previousId } }); }
  catch (e) { readable(e); }
}
export async function uploadChapterAudio(chapterId: string, file: File, previousId: string | null, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<ChapterAudio> {
  if (!/\.(mp3|m4a)$/i.test(file.name)) throw new Error("Yalnızca MP3 veya M4A ses dosyası yükleyebilirsin.");
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error("Ses dosyası en fazla 100 MB olabilir.");
  const authHeaders = await headers(true);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal?.aborted) { reject(new Error("Yükleme iptal edildi.")); return; }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", `/api/chapter-audio/${encodeURIComponent(chapterId)}`);
    xhr.timeout = 15 * 60_000;
    for (const [key, value] of Object.entries(authHeaders)) xhr.setRequestHeader(key, value);
    xhr.setRequestHeader("If-Match", previousId ?? "none");
    xhr.setRequestHeader("X-Audio-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", /\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/mp4");
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)); };
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || !data.audio) throw Object.assign(new Error(data.error ?? "Ses yüklenemedi. Tekrar dene."), { status: xhr.status });
        resolve(usable(data.audio)!);
      } catch (e) { reject(e); }
    };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Ses yüklenemedi. Tekrar dene."));
    xhr.onabort = () => reject(new Error("Yükleme iptal edildi."));
    xhr.send(file);
  });
}
