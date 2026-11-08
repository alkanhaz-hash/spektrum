import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { ChapterAudio } from "@workspace/api-client-react";
import { auth } from "./firebase";
export type { ChapterAudio } from "@workspace/api-client-react";
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
function base() {
  const value = (process.env.EXPO_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
  if (!value && Platform.OS !== "web") throw new Error("Ses hizmeti bu sürümde yapılandırılmamış.");
  return value;
}
async function headers(required = false): Promise<Record<string, string>> {
  if (!auth.currentUser) {
    if (required) throw new Error("Ses eklemek için giriş yapmalısın.");
    return {};
  }
  return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
}
function usable(audio: ChapterAudio | null): ChapterAudio | null {
  if (!audio) return null;
  return { ...audio, playbackUrl: `${base()}${audio.playbackUrl}` };
}
export async function getChapterAudio(chapterId: string): Promise<ChapterAudio | null> {
  const res = await fetch(`${base()}/api/chapter-audio/${encodeURIComponent(chapterId)}`, { headers: await headers() });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Ses yüklenemedi. Tekrar dene."), { status: res.status });
  return usable(data.audio);
}
export async function removeChapterAudio(chapterId: string, previousId: string) {
  const res = await fetch(`${base()}/api/chapter-audio/${encodeURIComponent(chapterId)}`, {
    method: "DELETE", headers: { ...await headers(true), "If-Match": previousId },
  });
  if (!res.ok) { const data = await res.json(); throw Object.assign(new Error(data.error ?? "Ses yüklenemedi. Tekrar dene."), { status: res.status }); }
}
export async function uploadChapterAudio(chapterId: string, file: DocumentPickerAsset, previousId: string | null, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<ChapterAudio> {
  if (!/\.(mp3|m4a)$/i.test(file.name)) throw new Error("Yalnızca MP3 veya M4A ses dosyası yükleyebilirsin.");
  const size = file.size ?? (Platform.OS !== "web" ? (await FileSystem.getInfoAsync(file.uri) as { size?: number }).size : file.file?.size);
  if (!size || size > MAX_AUDIO_BYTES) throw new Error("Ses dosyası en fazla 100 MB olabilir.");
  const uploadHeaders = { ...await headers(true), "If-Match": previousId ?? "none", "X-Audio-Name": encodeURIComponent(file.name), "Content-Type": /\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/mp4" };
  const url = `${base()}/api/chapter-audio/${encodeURIComponent(chapterId)}`;
  if (signal?.aborted) throw new Error("Yükleme iptal edildi.");
  let response: { status: number; body: string } | null;
  if (Platform.OS === "web") {
    response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      signal?.addEventListener("abort", abort, { once: true });
      xhr.open("PUT", url); xhr.timeout = 15 * 60_000;
      for (const [key, value] of Object.entries(uploadHeaders)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)); };
      xhr.onloadend = () => signal?.removeEventListener("abort", abort);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = xhr.ontimeout = () => reject(new Error("Ses yüklenemedi. Tekrar dene."));
      xhr.onabort = () => reject(new Error("Yükleme iptal edildi."));
      xhr.send(file.file);
    });
  } else {
    // Native binary upload reads from the file URI, not a 100 MB JS Blob.
    const task = FileSystem.createUploadTask(url, file.uri, {
      httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: uploadHeaders,
    }, progress => onProgress?.(Math.round(progress.totalBytesSent / Math.max(1, progress.totalBytesExpectedToSend) * 100)));
    const abort = () => { void task.cancelAsync(); };
    signal?.addEventListener("abort", abort, { once: true });
    try { response = await task.uploadAsync() ?? null; }
    finally { signal?.removeEventListener("abort", abort); }
  }
  if (signal?.aborted || !response) throw new Error("Yükleme iptal edildi.");
  let data;
  try { data = JSON.parse(response.body); } catch { throw new Error("Ses yüklenemedi. Tekrar dene."); }
  if (response.status < 200 || response.status >= 300 || !data.audio) throw Object.assign(new Error(data.error ?? "Ses yüklenemedi. Tekrar dene."), { status: response.status });
  return usable(data.audio)!;
}
