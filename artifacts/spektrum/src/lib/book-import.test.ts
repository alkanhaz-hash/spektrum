import { beforeAll, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import {
  IMPORT_LIMITS, documentXmlToText, extractDocumentXml, importSourceId,
  readImportFile, splitImportChapters, validateImportPreview, validateSource,
} from "./book-import";
import { clearImportRecovery, readImportRecovery, saveImportRecovery } from "./book-import-recovery";

beforeAll(() => Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }));
const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Bölüm 1: Başlangıç</w:t></w:r></w:p>
<w:p><w:r><w:t>Bir &amp; iki</w:t><w:br/><w:t>ikinci satır</w:t></w:r><w:del><w:r><w:t>Silinmiş</w:t></w:r></w:del></w:p>
<w:p><w:r><w:t>Chapter II — Son</w:t></w:r></w:p><w:p><w:r><w:t>Son metin.</w:t></w:r></w:p>
</w:body></w:document>`;

describe("book import parsing and limits", () => {
  it("normalizes BOM and Windows line endings", () => {
    expect(validateSource("\uFEFF Bölüm 1\r\nMetin \rson ")).toBe("Bölüm 1\nMetin \nson");
  });
  it("preserves preamble, Turkish/English headings and paragraphs", () => {
    expect(splitImportChapters("Önsöz\n\nBölüm 1: İlk\n\nMetin.\n\nChapter II — Son\nSon.")).toEqual([
      { title: "Bölüm 1", content: "Önsöz" },
      { title: "Bölüm 1: İlk", content: "Metin." },
      { title: "Chapter II — Son", content: "Son." },
    ]);
  });
  it("does not mistake sentences for headings and supports single section", () => {
    const text = "Bölüm 1 boyunca yürüdüm.\n\nMetin";
    expect(splitImportChapters(text)).toEqual([{ title: "Bölüm 1", content: text }]);
    expect(splitImportChapters("Bölüm 1\nMetin\nBölüm 2\nDevam", "single")).toHaveLength(1);
  });
  it("keeps empty consecutive sections visible instead of dropping headings", () => {
    expect(splitImportChapters("Bölüm 1\nBölüm 2\nMetin\nBölüm 3")).toEqual([
      { title: "Bölüm 1", content: "" }, { title: "Bölüm 2", content: "Metin" }, { title: "Bölüm 3", content: "" },
    ]);
  });
  it("rejects excessive heading rows before rendering, with a single-section recovery", () => {
    const source = Array.from({ length: 51 }, (_, i) => `Bölüm ${i + 1}\nMetin`).join("\n");
    expect(() => splitImportChapters(source)).toThrow("50’den fazla");
    expect(splitImportChapters(source, "single")).toEqual([{ title: "Bölüm 1", content: source }]);
  });
  it("rejects empty/binary and oversized UTF-8 text", () => {
    expect(() => validateSource(" \n")).toThrow("boş");
    expect(() => validateSource("PK\0x")).toThrow("düz metin");
    expect(() => validateSource("ş".repeat(IMPORT_LIMITS.textBytes / 2 + 1))).toThrow("2 MB");
  });
  it("enforces metadata, chapter count and byte limits including multibyte text", () => {
    const valid = { title: "Kitap", summary: "Kitap açıklaması", genre: "Roman", chapters: [{ title: "İlk", content: "Metin" }] };
    expect(() => validateImportPreview(valid)).not.toThrow();
    expect(() => validateImportPreview({ ...valid, summary: "kısa" })).toThrow("Açıklama");
    expect(() => validateImportPreview({ ...valid, chapters: Array.from({ length: 51 }, () => valid.chapters[0]) })).toThrow("1–50");
    expect(() => validateImportPreview({ ...valid, chapters: [{ title: "İlk", content: " " }] })).toThrow("boş");
    expect(() => validateImportPreview({ ...valid, chapters: [{ title: "İlk", content: "ş".repeat(102401) }] })).toThrow("200 KB");
    expect(() => validateImportPreview({ ...valid, chapters: Array.from({ length: 12 }, () => ({ title: "İlk", content: "a".repeat(200000) })) })).toThrow("2 MB");
  });
  it("extracts DOCX text without HTML, keeps breaks, excludes deleted tracked text", () => {
    const bytes = zipSync({ "word/document.xml": strToU8(xml), "word/media/image.png": new Uint8Array(20) });
    const text = documentXmlToText(extractDocumentXml(bytes));
    expect(text).toContain("Bir & iki\nikinci satır");
    expect(text).not.toContain("Silinmiş");
    expect(splitImportChapters(text)).toHaveLength(2);
  });
  it("rejects malformed/encrypted/non-DOCX archives and decompression expansion", () => {
    expect(() => extractDocumentXml(zipSync({ "other.xml": strToU8(xml) }))).toThrow("DOCX");
    expect(() => extractDocumentXml(strToU8("not a zip"))).toThrow();
    expect(() => documentXmlToText("<broken>")).toThrow("bozuk");
    expect(() => documentXmlToText("<!DOCTYPE w [<!ENTITY x 'y'>]><w/>")).toThrow("desteklenmiyor");
    expect(() => extractDocumentXml(zipSync({ "word/document.xml": strToU8("a".repeat(IMPORT_LIMITS.xmlBytes + 1)) }))).toThrow("8 MB");
  });
  it("rejects unsupported, empty, oversized and non-UTF8 files", async () => {
    const file = (name: string, data: Uint8Array, size = data.length) => ({ name, size, arrayBuffer: async () => data.buffer }) as File;
    await expect(readImportFile(file("book.pdf", strToU8("Metin")))).rejects.toThrow("TXT");
    await expect(readImportFile(file("book.txt", new Uint8Array()))).rejects.toThrow("boş");
    await expect(readImportFile(file("book.txt", new Uint8Array(1), IMPORT_LIMITS.fileBytes + 1))).rejects.toThrow("5 MB");
    await expect(readImportFile(file("book.txt", new Uint8Array([0xff])))).rejects.toThrow("UTF-8");
    expect(await readImportFile(file("Kitabım.TXT", strToU8("Merhaba")))).toEqual({ title: "Kitabım", text: "Merhaba" });
    expect((await readImportFile(file("Kitabım.docx", zipSync({ "word/document.xml": strToU8(xml) })))).text).toContain("Son metin.");
  });
  it("source identity survives newline/BOM changes and isolates authors", async () => {
    const key = await importSourceId("author", "Bölüm 1\nMetin");
    expect(await importSourceId("author", "\uFEFFBölüm 1\r\nMetin ")).toBe(key);
    expect(await importSourceId("other", "Bölüm 1\nMetin")).not.toBe(key);
    expect(await importSourceId("author", "Yeni metin")).not.toBe(key);
  });
  it("preserves separator and UTF-16 import compatibility", async () => {
    expect(splitImportChapters("Birinci\n---\nİkinci", "separator").map(c => c.content)).toEqual(["Birinci", "İkinci"]);
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0, 0x42, 0]);
    const file = { name: "kitap.txt", size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
    expect((await readImportFile(file)).text).toBe("AB");
  });
  it("restores user-isolated old and new pending recovery records", () => {
    sessionStorage.clear();
    const preview = { title: "Kitap", summary: "Kitap açıklaması", genre: "Gizem", chapters: [{ title: "İlk", content: "Metin" }] };
    saveImportRecovery("writer", { preview, source: "paste", consent: true, sourceText: "Bölüm 1\nMetin" });
    expect(readImportRecovery("other")).toBeNull();
    expect(readImportRecovery("writer")?.sourceText).toBe("Bölüm 1\nMetin");
    saveImportRecovery("writer", { preview, source: "txt", consent: true });
    expect(readImportRecovery("writer")?.sourceText).toBeUndefined();
    expect(readImportRecovery("writer")?.preview).toEqual(preview);
    clearImportRecovery("writer");
    expect(readImportRecovery("writer")).toBeNull();
  });
});
