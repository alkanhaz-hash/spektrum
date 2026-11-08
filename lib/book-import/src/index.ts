import { Unzip, UnzipInflate, strFromU8, strToU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";

export const IMPORT_LIMITS = {
  fileBytes: 5 * 1024 * 1024, textBytes: 2 * 1024 * 1024,
  xmlBytes: 8 * 1024 * 1024, chapterBytes: 200 * 1024, chapters: 50,
} as const;
export const BOOK_IMPORT_LIMITS = { ...IMPORT_LIMITS, docxXmlBytes: IMPORT_LIMITS.xmlBytes };
export interface ImportChapter { title: string; content: string }
export type ImportedChapter = ImportChapter;
export type BookImportSource = "txt" | "docx" | "paste";
export interface BookImportPreview {
  title: string; summary: string; genre: string; chapters: ImportChapter[];
}
export const byteLength = (text: string) => strToU8(text).length;
export const utf8Bytes = byteLength;
export const normalizeImportText = (text: string) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
export function validateSource(text: string): string {
  const normalized = normalizeImportText(text);
  if (!normalized) throw new Error("Metin boş. Aktarılacak metni ekle.");
  if (normalized.includes("\0")) throw new Error("Bu dosya düz metin değil. UTF-8 TXT veya DOCX kullan.");
  if (byteLength(normalized) > IMPORT_LIMITS.textBytes) throw new Error("Metin en fazla 2 MB olabilir.");
  return normalized;
}
export const validateImportText = validateSource;

export function splitImportChapters(text: string, mode: "headings" | "separator" | "single" = "headings"): ImportChapter[] {
  const source = validateSource(text);
  if (mode === "single") return [{ title: "Bölüm 1", content: source }];
  if (mode === "separator") {
    const parts = source.split(/^\s*---+\s*$/m).map(part => part.trim()).filter(Boolean);
    if (parts.length > IMPORT_LIMITS.chapters) throw new Error("En fazla 50 bölüm olabilir.");
    return parts.map((content, index) => ({ title: `Bölüm ${index + 1}`, content }));
  }
  const heading = /^(?:(?:bölüm|bolum|chapter)\s+(?:\d+|[ivxlcdm]+)(?:\s*[:.\-–—]\s*.+)?|(?:\d+|[ivxlcdm]+)\s*[.)\-–—:]\s*(?:bölüm|bolum)(?:\s*[:.\-–—]\s*.+)?)$/iu;
  const chapters: ImportChapter[] = [];
  let title = "Bölüm 1", lines: string[] = [], hasHeading = false;
  const flush = () => {
    const content = lines.join("\n").trim();
    if (content || hasHeading) {
      chapters.push({ title, content });
      if (chapters.length > IMPORT_LIMITS.chapters) throw new Error("Metinde 50’den fazla bölüm başlığı var. Tek bölüm seçerek önizle ve sınırları elle düzenle.");
    }
    lines = [];
  };
  for (const line of source.split("\n")) {
    if ((heading.test(line.trim()) || /^#{1,3}\s+\S/.test(line.trim())) && line.trim().length <= 200) {
      flush(); title = line.trim(); hasHeading = true;
    } else lines.push(line);
  }
  flush();
  return chapters;
}
export function validateImportPreview(preview: BookImportPreview): BookImportPreview {
  if (!preview.title.trim() || preview.title.length > 120) throw new Error("Kitap başlığı 1–120 karakter olmalı.");
  if (preview.summary.trim().length < 10 || preview.summary.length > 500) throw new Error("Açıklama 10–500 karakter olmalı.");
  if (!preview.genre) throw new Error("Bir tür seç.");
  if (!preview.chapters.length || preview.chapters.length > IMPORT_LIMITS.chapters) throw new Error("Aktarım 1–50 bölüm içermeli.");
  let total = 0;
  preview.chapters.forEach((chapter, index) => {
    if (!chapter.title.trim() || chapter.title.length > 200) throw new Error(`${index + 1}. bölüm başlığı 1–200 karakter olmalı.`);
    if (!chapter.content.trim()) throw new Error(`${index + 1}. bölüm boş. Metin ekle veya önceki bölümle birleştir.`);
    const size = byteLength(chapter.content);
    if (size > IMPORT_LIMITS.chapterBytes) throw new Error(`${index + 1}. bölüm 200 KB sınırını aşıyor. Bölümü ayır.`);
    total += size;
  });
  if (total > IMPORT_LIMITS.textBytes) throw new Error("Bölümlerin toplam metni en fazla 2 MB olabilir.");
  return { title: preview.title.trim(), summary: preview.summary.trim(), genre: preview.genre.trim(),
    chapters: preview.chapters.map(c => ({ title: c.title.trim(), content: normalizeImportText(c.content) })) };
}
type Digest = (text: string) => Promise<string>;
const webDigest: Digest = async text => {
  const bytes = await crypto.subtle.digest("SHA-256", strToU8(text) as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
};
export async function importSourceId(uid: string, source: string, digest: Digest = webDigest): Promise<string> {
  return `import_${await digest(JSON.stringify([uid, validateSource(source)]))}`;
}
export async function getImportFingerprint(uid: string, preview: BookImportPreview, digest: Digest = webDigest): Promise<string> {
  const normalized = validateImportPreview(preview);
  return digest(JSON.stringify([1, uid, normalized.chapters.map(c => c.content)]));
}

/** Strict Unicode decoding without browser TextDecoder/Hermes encoding assumptions. */
export function decodeImportText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    if (bytes.length % 2) throw new Error("TXT kodlaması bozuk. Dosyayı UTF-8 olarak kaydet.");
    const little = bytes[0] === 0xff;
    let text = "";
    for (let i = 2; i < bytes.length; i += 2) {
      const code = little ? bytes[i] | bytes[i + 1] << 8 : bytes[i] << 8 | bytes[i + 1];
      text += String.fromCharCode(code);
    }
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("TXT kodlaması bozuk. Dosyayı UTF-8 olarak kaydet.");
      } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("TXT kodlaması bozuk. Dosyayı UTF-8 olarak kaydet.");
    }
    return text;
  }
  const text = strFromU8(bytes);
  const encoded = strToU8(text);
  if (encoded.length !== bytes.length || encoded.some((byte, index) => byte !== bytes[index])) {
    throw new Error("Dosya okunamadı. TXT dosyasını UTF-8 olarak kaydet; DOCX dosyasını yeniden dışa aktar.");
  }
  return text;
}
export function extractDocumentXml(bytes: Uint8Array): string {
  let found = false, size = 0;
  const chunks: Uint8Array[] = [];
  const unzip = new Unzip(file => {
    if (file.name !== "word/document.xml") return;
    if (found) throw new Error("DOCX birden fazla ana belge içeriyor.");
    found = true;
    if (file.originalSize && file.originalSize > IMPORT_LIMITS.xmlBytes) throw new Error("DOCX içeriği çok büyük (en fazla 8 MB).");
    file.ondata = (error, data) => {
      if (error) throw error;
      size += data.length;
      if (size > IMPORT_LIMITS.xmlBytes) throw new Error("DOCX açılmış içeriği 8 MB sınırını aşıyor.");
      chunks.push(data);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("DOCX dosyası bozuk veya desteklenmiyor.");
  }
  if (!found || !size) throw new Error("Geçerli bir DOCX belgesi değil; ana metin bulunamadı.");
  const xml = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { xml.set(chunk, offset); offset += chunk.length; }
  return decodeImportText(xml);
}
export function documentXmlToText(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Bu DOCX belgesindeki XML yapısı desteklenmiyor.");
  let document;
  try {
    document = new DOMParser({ onError: () => { throw new Error("Bozuk XML"); } }).parseFromString(xml, "application/xml");
  } catch { throw new Error("DOCX metni bozuk; dosyayı yeniden kaydet."); }
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  if (!document.documentElement || document.documentElement.namespaceURI !== ns || document.documentElement.localName !== "document") {
    throw new Error("DOCX ana metin yapısı desteklenmiyor.");
  }
  const paragraphs = Array.from(document.getElementsByTagNameNS(ns, "p"));
  const text = paragraphs.map(paragraph => {
    let result = "";
    const visit = (node: typeof paragraph | ChildNode, depth = 0) => {
      if (depth > 128) throw new Error("DOCX yapısı çok karmaşık. Belgeyi sade metin olarak kaydet.");
      if (node.nodeType === 1) {
        const element = node as typeof paragraph;
        if (element.namespaceURI === ns) {
          if (element.localName === "t") { result += element.textContent ?? ""; return; }
          if (element.localName === "tab") result += "\t";
          if (element.localName === "br" || element.localName === "cr") result += "\n";
          if (element.localName === "del") return;
        }
      }
      for (let child = node.firstChild; child; child = child.nextSibling) visit(child as typeof paragraph, depth + 1);
    };
    visit(paragraph); return result;
  }).join("\n\n");
  return validateSource(text);
}
export function parseImportBytes(name: string, bytes: Uint8Array): { text: string; title: string } {
  if (bytes.length > IMPORT_LIMITS.fileBytes) throw new Error("Dosya en fazla 5 MB olabilir.");
  if (!bytes.length) throw new Error("Dosya boş.");
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext !== "txt" && ext !== "docx") throw new Error("Yalnızca TXT ve DOCX destekleniyor. PDF/DOC dosyalarını önce dönüştür.");
  const text = ext === "txt" ? validateSource(decodeImportText(bytes)) : documentXmlToText(extractDocumentXml(bytes));
  return { text, title: name.replace(/\.[^.]+$/, "").slice(0, 120) };
}
export async function readImportFile(file: File) {
  if (file.size > IMPORT_LIMITS.fileBytes) throw new Error("Dosya en fazla 5 MB olabilir.");
  return parseImportBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}
export const docxXmlToText = documentXmlToText;
export const extractDocxXml = async (buffer: ArrayBuffer) => extractDocumentXml(new Uint8Array(buffer));
export async function readBookImportFile(file: File) {
  const result = await readImportFile(file);
  return { text: result.text, suggestedTitle: result.title, source: file.name.split(".").pop()!.toLowerCase() as BookImportSource };
}
