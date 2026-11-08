import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { IMPORT_LIMITS, parseImportBytes, type BookImportSource } from "@workspace/book-import";

export * from "@workspace/book-import";
export async function pickImportFile(): Promise<{ text: string; suggestedTitle: string; source: BookImportSource } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    copyToCacheDirectory: true, multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error("Dosya seçilemedi.");
  if (asset.size !== undefined && asset.size > IMPORT_LIMITS.fileBytes) throw new Error("Dosya en fazla 5 MB olabilir.");
  if (!/\.(txt|docx)$/i.test(asset.name)) throw new Error("Yalnızca TXT ve DOCX destekleniyor.");
  const cached = asset.file ? null : new File(asset.uri);
  try {
    const size = asset.file?.size ?? cached!.size;
    if (!size || size > IMPORT_LIMITS.fileBytes) throw new Error(size ? "Dosya en fazla 5 MB olabilir." : "Dosya boş.");
    const bytes = asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await cached!.bytes();
    const parsed = parseImportBytes(asset.name, bytes);
    return { text: parsed.text, suggestedTitle: parsed.title, source: /\.docx$/i.test(asset.name) ? "docx" : "txt" };
  } finally {
    // Native picker copies belong to this import only, never delete original files.
    if (cached?.exists) { try { cached.delete(); } catch { /* OS can evict cache later. */ } }
  }
}
