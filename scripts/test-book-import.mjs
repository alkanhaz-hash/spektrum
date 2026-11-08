// Run from the workspace root: node --test scripts/test-book-import.mjs
// Tests real TypeScript modules with an in-memory Firebase protocol adapter.
// These tests do not contact Firebase or prove deployed rules/permissions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const webRequire = createRequire(new URL("../artifacts/spektrum/package.json", import.meta.url));
const sourcePath = (file) => new URL(`../artifacts/spektrum/src/lib/${file}.ts`, import.meta.url);
function load(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(sourcePath(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => dependencies[name] ?? webRequire(name), module, module.exports);
  return module.exports;
}
const parser = load("book-import");
const genres = new Function(`return ${readFileSync(sourcePath("firestore-service"), "utf8").match(/export const GENRES = (\[[\s\S]*?\]);/)[1]}`)();
const preview = () => ({
  title: "Test kitabı", summary: "Bu, kayıt testinin açıklamasıdır.", genre: genres[0],
  chapters: [{ title: "Bölüm 1", content: "İlk bölümün güvenli metni." }, { title: "Bölüm 2", content: "İkinci bölümün metni." }],
});
const request = () => ({ preview: preview(), ownershipConfirmed: true, source: "paste" });

function mockFirebase() {
  const uid = "unit-author";
  const db = { app: { options: { projectId: "test-project" } }, docs: new Map(), versions: new Map(), tail: Promise.resolve() };
  db.docs.set(`users/${uid}`, { displayName: "Test yazarı", role: "user", storyCount: 0 });
  const auth = { currentUser: { uid, getIdToken: async () => "unit-test-only" } };
  const apply = (path, patch, replace) => {
    const data = replace ? {} : { ...db.docs.get(path) };
    for (const [key, value] of Object.entries(patch)) {
      data[key] = value?.__increment ? (data[key] ?? 0) + value.__increment : value;
    }
    db.docs.set(path, data);
    db.versions.set(path, (db.versions.get(path) ?? 0) + 1);
  };
  const sdk = {
    doc: (_, collection, id) => `${collection}/${id}`,
    increment: (n) => ({ __increment: n }),
    serverTimestamp: () => ({ seconds: 1 }),
    runTransaction: async (_, callback) => {
      const previous = db.tail;
      let release;
      db.tail = new Promise((resolve) => { release = resolve; });
      await previous;
      const writes = [];
      try {
        const result = await callback({
          get: async (path) => {
            if (path.startsWith("chapters/") && !db.docs.has(path)) {
              throw Object.assign(new Error("Missing private chapter reads are denied"), { code: "permission-denied" });
            }
            const data = structuredClone(db.docs.get(path));
            return { exists: () => data !== undefined, data: () => data };
          },
          set: (path, data) => writes.push([path, data, true]),
          update: (path, data) => writes.push([path, data, false]),
        });
        if (db.failParent) { db.failParent = false; throw new Error("parent write failed"); }
        for (const [path, data, replace] of writes) apply(path, data, replace);
        return result;
      } finally { release(); }
    },
  };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const fieldValue = (value) => "stringValue" in value ? value.stringValue : "integerValue" in value ? Number(value.integerValue) : value.booleanValue;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer unit-test-only");
    if (options.method === "GET") {
      const path = String(url).split("/documents/")[1];
      const data = db.docs.get(path);
      if (!data) return response({ error: { status: "NOT_FOUND" } }, 404);
      return response({
        fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { stringValue: value }])),
        updateTime: `version-${db.versions.get(path)}`,
      });
    }
    const { writes } = JSON.parse(options.body);
    const pathOf = (write) => write.update.name.split("/documents/")[1];
    if (db.failChapters) { db.failChapters = false; return response({ error: { status: "UNAVAILABLE" } }, 503); }
    for (const write of writes) {
      const path = pathOf(write);
      if (write.currentDocument.exists === false && db.docs.has(path)) return response({ error: { status: "FAILED_PRECONDITION" } }, 400);
      if (write.currentDocument.updateTime && write.currentDocument.updateTime !== `version-${db.versions.get(path)}`) {
        return response({ error: { status: "FAILED_PRECONDITION" } }, 400);
      }
    }
    for (const write of writes) {
      const path = pathOf(write);
      const data = Object.fromEntries(Object.entries(write.update.fields).map(([key, value]) => [key, fieldValue(value)]));
      for (const transform of write.updateTransforms) {
        data[transform.fieldPath] = transform.increment ? { __increment: Number(transform.increment.integerValue) } : { seconds: 1 };
      }
      apply(path, data, !write.updateMask);
    }
    if (db.loseReply) { db.loseReply = false; throw new Error("reply lost after commit"); }
    return response({ writeResults: [], commitTime: "test" });
  };
  const commit = load("book-import-commit", { "./firebase": { auth, db } });
  const service = load("book-import-service", {
    "firebase/firestore": sdk, "./firebase": { auth, db }, "./book-import": parser,
    "./firestore-service": { GENRES: genres }, "./book-import-commit": commit,
  });
  return { db, auth, service, restore: () => { globalThis.fetch = previousFetch; } };
}

test("normalizes line endings, preserves Turkish text and splits headings", () => {
  const chapters = parser.splitImportChapters("\uFEFFBÖLÜM 1\r\nÖzgürlük\r\nBölüm 2: Yol\r\nİkinci metin");
  assert.deepEqual(chapters, [{ title: "BÖLÜM 1", content: "Özgürlük" }, { title: "Bölüm 2: Yol", content: "İkinci metin" }]);
  assert.equal(parser.splitImportChapters("önsöz\nBölüm 1\nmetin").length, 2);
});
test("separator and single-chapter modes preserve actual content", () => {
  assert.deepEqual(parser.splitImportChapters("Bir\n---\nİki", "separator").map((c) => c.content), ["Bir", "İki"]);
  assert.equal(parser.splitImportChapters("Bir\n---\nİki", "single").length, 1);
});
test("limits use UTF-8 bytes and reject empty/oversized chapters and chapter counts", () => {
  assert.throws(() => parser.validateImportText(" "), /boş/);
  assert.throws(() => parser.validateImportText("İ".repeat(600000)), /1 MB/);
  assert.throws(() => parser.validateImportPreview({ ...preview(), chapters: [{ title: "Başlık", content: "" }] }), /boş/);
  assert.throws(() => parser.validateImportPreview({ ...preview(), chapters: [{ title: "Başlık", content: "ş".repeat(120000) }] }), /200 KB/);
  assert.throws(() => parser.validateImportPreview({ ...preview(), chapters: Array(41).fill(preview().chapters[0]) }), /1–40/);
});
test("reads UTF-8 and UTF-16 TXT, rejects unsupported extension and large files", async () => {
  const txt = await parser.readBookImportFile(new File(["Bölüm 1\nÖzgürlük"], "Kitabım.txt"));
  assert.equal(txt.suggestedTitle, "Kitabım");
  assert.equal(txt.source, "txt");
  const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from("Türkçe", "utf16le")]);
  assert.equal((await parser.readBookImportFile(new File([utf16], "test.txt"))).text, "Türkçe");
  await assert.rejects(parser.readBookImportFile(new File(["x"], "test.pdf")), /TXT ve DOCX/);
  await assert.rejects(parser.readBookImportFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "test.txt")), /2 MB/);
  await assert.rejects(parser.readBookImportFile(new File([new Uint8Array([255, 255])], "test.txt")), /kodlaması/);
});
test("extracts only document XML and rejects invalid archives, XML expansion and entities", async () => {
  const { zipSync, strToU8 } = webRequire("fflate");
  const xml = '<w:document xmlns:w="urn:word"><w:p><w:r><w:t>Türkçe</w:t></w:r></w:p></w:document>';
  const zip = zipSync({ "word/document.xml": strToU8(xml), "word/media/image.jpg": new Uint8Array(20) });
  assert.equal(await parser.extractDocxXml(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)), xml);
  await assert.rejects(parser.extractDocxXml(new Uint8Array([1, 2, 3]).buffer));
  const bomb = zipSync({ "word/document.xml": strToU8("x".repeat(parser.BOOK_IMPORT_LIMITS.docxXmlBytes + 1)) });
  await assert.rejects(parser.extractDocxXml(bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength)), /çok büyük/);
  assert.throws(() => parser.docxXmlToText('<!DOCTYPE x [<!ENTITY y "z">]><x/>'), /desteklenmiyor/);
});
test("fingerprint survives metadata/title changes and differs by author or content", async () => {
  const p = preview();
  const changed = { ...p, title: "Yeni başlık", summary: "Farklı bir açıklama metni.", chapters: p.chapters.map((c) => ({ ...c, title: "Yeni bölüm adı" })) };
  assert.equal(await parser.getImportFingerprint("a", p), await parser.getImportFingerprint("a", changed));
  assert.notEqual(await parser.getImportFingerprint("a", p), await parser.getImportFingerprint("b", p));
});
test("requires explicit consent and login before any writes", async () => {
  const m = mockFirebase();
  try {
    await assert.rejects(m.service.saveImportedBook({ ...request(), ownershipConfirmed: false }), /onaylamalısın/);
    m.auth.currentUser = null;
    await assert.rejects(m.service.saveImportedBook(request()), /giriş/);
    assert.equal(m.db.docs.size, 1);
  } finally { m.restore(); }
});
test("successful import is draft-only, counted once, and repeat preserves edited chapters", async () => {
  const m = mockFirebase();
  try {
    const id = await m.service.saveImportedBook(request());
    assert.equal(m.db.docs.get(`stories/${id}`).status, "draft");
    assert.equal(m.db.docs.get(`stories/${id}`).importState, "complete");
    assert.equal(m.db.docs.get(`stories/${id}`).chapterCount, 2);
    assert.equal(m.db.docs.get("users/unit-author").storyCount, 1);
    assert.equal(m.db.docs.get(`chapters/${id}_1`).status, "draft");
    m.db.docs.get(`chapters/${id}_1`).content = "Sonradan düzenlenen bölüm";
    const retry = request(); retry.preview.summary = "Başka bir özet ile yeniden deneme.";
    assert.equal(await m.service.saveImportedBook(retry), id);
    assert.equal(m.db.docs.get(`chapters/${id}_1`).content, "Sonradan düzenlenen bölüm");
    assert.equal(m.db.docs.size, 4);
  } finally { m.restore(); }
});
test("parent transaction failure leaves no partial parent or counter", async () => {
  const m = mockFirebase();
  try {
    m.db.failParent = true;
    await assert.rejects(m.service.saveImportedBook(request()));
    assert.equal(m.db.docs.size, 1);
    assert.equal(m.db.docs.get("users/unit-author").storyCount, 0);
  } finally { m.restore(); }
});
test("chapter failure leaves one pending draft; retry fills chapters without duplicates", async () => {
  const m = mockFirebase();
  try {
    m.db.failChapters = true;
    await assert.rejects(m.service.saveImportedBook(request()));
    const parent = [...m.db.docs.keys()].find((key) => key.startsWith("stories/"));
    assert.equal(m.db.docs.get(parent).importState, "pending");
    assert.equal(m.db.docs.get(parent).chapterCount, 0);
    assert.equal([...m.db.docs.keys()].filter((key) => key.startsWith("chapters/")).length, 0);
    const id = await m.service.saveImportedBook(request());
    assert.equal(parent, `stories/${id}`);
    assert.equal(m.db.docs.size, 4);
    assert.equal(m.db.docs.get("users/unit-author").storyCount, 1);
  } finally { m.restore(); }
});
test("lost reply after successful atomic commit is safe to retry", async () => {
  const m = mockFirebase();
  try {
    m.db.loseReply = true;
    await assert.rejects(m.service.saveImportedBook(request()));
    const id = await m.service.saveImportedBook(request());
    assert.equal(m.db.docs.get(`stories/${id}`).chapterCount, 2);
    assert.equal(m.db.docs.get("users/unit-author").storyCount, 1);
    assert.equal(m.db.docs.size, 4);
  } finally { m.restore(); }
});
test("concurrent imports converge on one parent and one chapter set", async () => {
  const m = mockFirebase();
  try {
    const [a, b] = await Promise.all([m.service.saveImportedBook(request()), m.service.saveImportedBook(request())]);
    assert.equal(a, b);
    assert.equal(m.db.docs.size, 4);
    assert.equal(m.db.docs.get("users/unit-author").storyCount, 1);
    assert.equal(m.db.docs.get(`stories/${a}`).chapterCount, 2);
  } finally { m.restore(); }
});
test("creation precondition preserves pre-existing orphan/edited chapters", async () => {
  const m = mockFirebase();
  try {
    const hash = await parser.getImportFingerprint("unit-author", preview());
    const key = `chapters/import_${hash}_1`;
    m.db.docs.set(key, { content: "Korunması gereken bölüm" });
    await assert.rejects(m.service.saveImportedBook(request()), /üzerine yazılmadı/);
    assert.equal(m.db.docs.get(key).content, "Korunması gereken bölüm");
    assert.equal(m.db.docs.get(`stories/import_${hash}`).importState, "pending");
  } finally { m.restore(); }
});

test("recovery survives a page reload, is scoped by author, and clears on completion", () => {
  const previous = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = {
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  try {
    const recovery = load("book-import-recovery", { "./book-import": parser });
    const snapshot = { preview: preview(), source: "paste", consent: true };
    recovery.saveImportRecovery("author-a", snapshot);
    assert.deepEqual(recovery.readImportRecovery("author-a"), snapshot);
    assert.equal(recovery.readImportRecovery("author-b"), null);
    recovery.clearImportRecovery("author-a");
    assert.equal(recovery.readImportRecovery("author-a"), null);
  } finally { globalThis.sessionStorage = previous; }
});
test("recovery fails explicitly on blocked storage or malformed persisted data", () => {
  const previous = globalThis.sessionStorage;
  try {
    const recovery = load("book-import-recovery", { "./book-import": parser });
    globalThis.sessionStorage = { setItem: () => { throw new Error("blocked"); } };
    assert.throws(() => recovery.saveImportRecovery("author", { preview: preview(), source: "paste", consent: true }), /saklanamadı/);
    globalThis.sessionStorage = { getItem: () => "null" };
    assert.throws(() => recovery.readImportRecovery("author"), /okunamadı/);
    globalThis.sessionStorage = { getItem: () => "{broken" };
    assert.throws(() => recovery.readImportRecovery("author"), /okunamadı/);
  } finally { globalThis.sessionStorage = previous; }
});
