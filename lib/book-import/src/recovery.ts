import { validateImportPreview, validateSource, type BookImportPreview, type BookImportSource } from "./index";

export interface ImportRecovery { sourceText: string; preview: BookImportPreview; source: BookImportSource; consent: true }
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(entries: [string, string][]): Promise<unknown>;
  multiRemove(keys: string[]): Promise<unknown>;
}
export function createImportRecovery(storage: Storage) {
  const prefix = (uid: string) => `spektrum.mobile-import.${uid}.`;
  const CHUNK = 64 * 1024;
  let queue = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action); queue = result.then(() => undefined, () => undefined); return result;
  };
  const saveImportRecovery = (uid: string, snapshot: ImportRecovery): Promise<void> => {
    const sourceText = validateSource(snapshot.sourceText), preview = validateImportPreview(snapshot.preview);
    if (snapshot.consent !== true || !["txt", "docx", "paste"].includes(snapshot.source)) throw new Error("Aktarım onayı veya kaynağı eksik.");
    const payload = JSON.stringify({ ...snapshot, sourceText, preview });
    return serial(async () => {
      const root = prefix(uid), version = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const chunks: [string, string][] = [];
      for (let offset = 0; offset < payload.length;) {
        let end = Math.min(payload.length, offset + CHUNK);
        const last = payload.charCodeAt(end - 1);
        if (end < payload.length && last >= 0xd800 && last <= 0xdbff) end--;
        chunks.push([root + version + "." + chunks.length, payload.slice(offset, end)]);
        offset = end;
      }
      await storage.multiSet(chunks);
      await storage.setItem(root + "manifest", JSON.stringify({ version, count: chunks.length }));
      const keep = new Set([root + "manifest", ...chunks.map(([key]) => key)]);
      const old = (await storage.getAllKeys()).filter(key => key.startsWith(root) && !keep.has(key));
      if (old.length) await storage.multiRemove(old);
    });
  };
  const readImportRecovery = (uid: string): Promise<ImportRecovery | null> => serial(async () => {
    const root = prefix(uid), raw = await storage.getItem(root + "manifest");
    if (!raw) return null;
    try {
      const { version, count } = JSON.parse(raw);
      if (typeof version !== "string" || !/^[a-zA-Z0-9-]+$/.test(version) || !Number.isInteger(count) || count < 1 || count > 160) throw new Error();
      const chunks = await storage.multiGet(Array.from({ length: count }, (_, i) => root + version + "." + i));
      if (chunks.some(([, value]) => value === null)) throw new Error();
      const data = JSON.parse(chunks.map(([, value]) => value).join(""));
      if (data.consent !== true || !["txt", "docx", "paste"].includes(data.source)) throw new Error();
      return { sourceText: validateSource(data.sourceText), preview: validateImportPreview(data.preview), source: data.source, consent: true };
    } catch { throw new Error("Saklanan aktarım okunamadı. Mevcut taslağını kontrol et veya bu cihazdaki aktarımı sıfırla."); }
  });
  const clearImportRecovery = (uid: string): Promise<void> => serial(async () => {
    const keys = (await storage.getAllKeys()).filter(key => key.startsWith(prefix(uid)));
    if (keys.length) await storage.multiRemove(keys);
  });
  return { readImportRecovery, saveImportRecovery, clearImportRecovery };
}
