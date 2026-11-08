import { test } from "node:test";
import assert from "node:assert/strict";
import { createImportRecovery, type ImportRecovery } from "./recovery";
import { decodeImportText, parseImportBytes } from "./index";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys: string[]) => keys.map(key => [key, values.get(key) ?? null] as const),
    multiSet: async (entries: [string, string][]) => { entries.forEach(([k, v]) => values.set(k, v)); },
    multiRemove: async (keys: string[]) => { keys.forEach(key => values.delete(key)); },
  };
}
const snapshot = (): ImportRecovery => ({
  sourceText: "Bölüm 1\nKayıp defterin öyküsü.", source: "paste", consent: true,
  preview: { title: "Defter", summary: "Kayıp defterin öyküsü.", genre: "Macera", chapters: [{ title: "Bölüm 1", content: "Kayıp defterin öyküsü." }] },
});
test("mobile recovery isolates authors and clears only the departing account", async () => {
  const storage = memoryStorage(), recovery = createImportRecovery(storage);
  await recovery.saveImportRecovery("writer", snapshot());
  assert.equal(await recovery.readImportRecovery("other"), null);
  await recovery.saveImportRecovery("other", snapshot());
  await recovery.clearImportRecovery("writer");
  assert.equal(await recovery.readImportRecovery("writer"), null);
  assert.deepEqual(await recovery.readImportRecovery("other"), snapshot());
});
test("long-book recovery uses bounded rows and roundtrips astral Unicode", async () => {
  const storage = memoryStorage(), recovery = createImportRecovery(storage);
  const data = snapshot();
  data.preview.chapters = Array.from({ length: 10 }, (_, i) => ({ title: `Bölüm ${i + 1}`, content: "x".repeat(150_000) + "🌱" }));
  data.sourceText = data.preview.chapters.map(ch => ch.content).join("\n");
  await recovery.saveImportRecovery("writer", data);
  assert.deepEqual(await recovery.readImportRecovery("writer"), data);
  assert.ok([...storage.values.values()].every(value => value.length <= 65536));
});
test("failed manifest replacement keeps the previous frozen snapshot readable", async () => {
  const storage = memoryStorage(), recovery = createImportRecovery(storage);
  await recovery.saveImportRecovery("writer", snapshot());
  const original = storage.setItem;
  storage.setItem = async () => { throw new Error("disk full"); };
  await assert.rejects(recovery.saveImportRecovery("writer", { ...snapshot(), sourceText: "Farklı metin" }), /disk full/);
  storage.setItem = original;
  assert.deepEqual(await recovery.readImportRecovery("writer"), snapshot());
  await recovery.clearImportRecovery("writer");
  assert.equal(storage.values.size, 0);
});
test("truncated recovery is an explicit error, and queued logout clears completed chunks", async () => {
  const storage = memoryStorage(), recovery = createImportRecovery(storage);
  await recovery.saveImportRecovery("writer", snapshot());
  const chunk = [...storage.values.keys()].find(key => key.endsWith(".0"))!;
  storage.values.delete(chunk);
  await assert.rejects(recovery.readImportRecovery("writer"), /okunamadı/);
  await Promise.all([recovery.saveImportRecovery("writer", snapshot()), recovery.clearImportRecovery("writer")]);
  assert.equal(storage.values.size, 0);
});
test("portable decoder supports BOMs and rejects invalid Unicode and unsupported files", () => {
  assert.equal(decodeImportText(new Uint8Array([239, 187, 191, 65])), "A");
  assert.equal(decodeImportText(new Uint8Array([254, 255, 0, 65])), "A");
  assert.throws(() => decodeImportText(new Uint8Array([255, 254, 0])), /kodlaması/);
  assert.throws(() => decodeImportText(new Uint8Array([255, 254, 0, 216])), /kodlaması/);
  assert.throws(() => decodeImportText(new Uint8Array([192, 175])));
  assert.throws(() => parseImportBytes("a.pdf", new Uint8Array([65])), /TXT ve DOCX/);
});
