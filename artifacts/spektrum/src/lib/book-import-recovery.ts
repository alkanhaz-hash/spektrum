import { validateImportPreview, type BookImportPreview, type BookImportSource } from "./book-import";

export interface ImportRecovery {
  preview: BookImportPreview;
  source: BookImportSource;
  consent: boolean;
  sourceText?: string;
}
const key = (uid: string) => `spektrum.book-import.pending.${uid}`;

export function saveImportRecovery(uid: string, snapshot: ImportRecovery): void {
  try {
    sessionStorage.setItem(key(uid), JSON.stringify({ version: 1, uid, ...snapshot }));
  } catch {
    throw new Error("Yeniden deneme için önizleme tarayıcıda saklanamadı. Tarayıcı saklama iznini kontrol et veya siteyi doğrudan aç. Bu denemede Firebase kaydı başlatılmadı.");
  }
}

export function readImportRecovery(uid: string): ImportRecovery | null {
  const text = sessionStorage.getItem(key(uid));
  if (!text) return null;
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("Saklanan aktarım önizlemesi okunamadı. Aynı kaynak dosya veya metni yeniden yükle."); }
  if (!data || typeof data !== "object" || data.version !== 1 || data.uid !== uid || data.consent !== true
      || !["txt", "docx", "paste"].includes(data.source) || !data.preview
      || typeof data.preview.title !== "string" || typeof data.preview.summary !== "string"
      || typeof data.preview.genre !== "string" || !Array.isArray(data.preview.chapters)
      || !data.preview.chapters.every((c: unknown) => c !== null && typeof c === "object"
        && typeof (c as { title?: unknown }).title === "string"
        && typeof (c as { content?: unknown }).content === "string")) {
    throw new Error("Saklanan aktarım önizlemesi okunamadı. Aynı kaynak dosya veya metni yeniden yükle.");
  }
  if (data.sourceText !== undefined && typeof data.sourceText !== "string") throw new Error("Saklanan kaynak metni okunamadı.");
  return { preview: validateImportPreview(data.preview), source: data.source, consent: true, sourceText: data.sourceText };
}

export function clearImportRecovery(uid: string): void {
  sessionStorage.removeItem(key(uid));
}
