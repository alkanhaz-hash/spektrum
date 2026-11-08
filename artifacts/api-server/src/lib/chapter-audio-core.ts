import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export class AudioError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Keep provider/account details in server logs, but don't suggest retrying a disabled service. */
export function audioServiceFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/billing account\b.*\bdisabled\b/i.test(message)) {
    return "Uygulamanın dosya depolama hizmeti kapalı olduğu için ses kaydedilemiyor. Hizmet yeniden etkinleştirilmeli.";
  }
  return "Ses yüklenemedi. Tekrar dene.";
}
export type AudioTicket = { chapterId: string; audioId: string; uid: string; expires: number };
export function signAudioTicket(value: AudioTicket, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readAudioTicket(ticket: string, secret: string, now = Date.now()): AudioTicket {
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra || ticket.length > 2000) throw new AudioError(403, "Ses bağlantısının süresi doldu. Tekrar dene.");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AudioError(403, "Ses bağlantısının süresi doldu. Tekrar dene.");
  let value: AudioTicket;
  try { value = JSON.parse(Buffer.from(payload, "base64url").toString()); }
  catch { throw new AudioError(403, "Ses bağlantısının süresi doldu. Tekrar dene."); }
  if (!value || typeof value.uid !== "string" || !validAudioId(value.chapterId) || !validAudioId(value.audioId)
      || !Number.isFinite(value.expires) || value.expires <= now) throw new AudioError(403, "Ses bağlantısının süresi doldu. Tekrar dene.");
  return value;
}
export function validAudioId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}
export function audioMime(name: string, mime: string): "audio/mpeg" | "audio/mp4" {
  if (/\.mp3$/i.test(name) && mime === "audio/mpeg") return "audio/mpeg";
  if (/\.m4a$/i.test(name) && ["audio/mp4", "audio/x-m4a", "audio/m4a"].includes(mime)) return "audio/mp4";
  throw new AudioError(415, "Yalnızca MP3 veya M4A ses dosyası yükleyebilirsin.");
}
export function validAudioHeader(bytes: Buffer, mime: string) {
  return mime === "audio/mpeg"
    ? bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    : bytes.subarray(4, 8).toString() === "ftyp";
}
export function audioRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new AudioError(416, "Invalid range");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size)
    throw new AudioError(416, "Invalid range");
  return { start, end };
}
export function canReadAudio(
  chapter: { status?: string; isPaid?: boolean },
  story: { authorId?: string; status?: string },
  uid: string, role?: string,
) {
  if ((uid && story.authorId === uid) || role === "admin" || role === "moderator") return true;
  // Never expose paid narration until a server-verifiable entitlement exists.
  return chapter.status === "published" && ["published", "completed"].includes(story.status ?? "") && chapter.isPaid !== true;
}
