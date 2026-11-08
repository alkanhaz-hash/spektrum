import test from "node:test";
import assert from "node:assert/strict";
import { loadStories, parseStory, libraryHtml, seedLibrary, SEED_ID, ATTRIBUTION_NOTE } from "./launch-library.mjs";

const stories = await loadStories();
const fields = {
  serverTimestamp: () => ({ timestamp: true }),
  increment: value => ({ increment: value }),
};
const verifyAuthors = async ids => assert.equal(new Set(ids).size, 10);

function database() {
  const documents = new Map(Array.from({ length: 10 }, (_, index) => [
    `users/user-${String(index).padStart(2, "0")}`,
    { displayName: `Deneme ${index}`, avatarUrl: "", storyCount: 2, uid: "wrong-body-uid" },
  ]));
  let writes = 0;
  const snapshot = ref => ({
    id: ref.path.split("/").at(-1), ref,
    exists: documents.has(ref.path),
    data: () => documents.get(ref.path),
  });
  const ref = path => ({ path, get: async () => snapshot(ref(path)) });
  const db = {
    documents,
    get writes() { return writes; },
    failCommit: false,
    collection: path => ({
      path, doc: id => ref(`${path}/${id}`),
      get: async () => ({ docs: [...documents.keys()]
        .filter(key => key.startsWith(`${path}/`) && key.split("/").length === 2)
        .reverse().map(key => snapshot(ref(key))) }),
    }),
    runTransaction: async callback => {
      const queued = [];
      const transaction = {
        get: value => value.get(),
        create: (reference, data) => queued.push(["create", reference, data]),
        update: (reference, data) => queued.push(["update", reference, data]),
      };
      const result = await callback(transaction);
      if (db.failCommit) throw new Error("simulated commit failure");
      const next = new Map(documents);
      for (const [kind, reference, data] of queued) {
        if (kind === "create") {
          assert.equal(next.has(reference.path), false);
          next.set(reference.path, data);
        } else {
          const current = { ...next.get(reference.path) };
          for (const [key, value] of Object.entries(data)) {
            current[key] = value?.increment ? (current[key] ?? 0) + value.increment : value;
          }
          next.set(reference.path, current);
        }
      }
      documents.clear();
      for (const entry of next) documents.set(...entry);
      writes += queued.length;
      return result;
    },
  };
  return db;
}

test("10 original stories, 66 sequential chapters, different lengths, no duplicated chapters", () => {
  assert.equal(stories.length, 10);
  const chapters = stories.flatMap(story => story.chapters);
  assert.equal(chapters.length, 66);
  assert.equal(new Set(chapters.map(chapter => chapter.content)).size, 66);
  assert.ok(new Set(stories.map(story => story.wordCount)).size >= 8);
  for (const story of stories) {
    assert.ok(story.chapters.length >= 6);
    assert.deepEqual(story.chapters.map(chapter => chapter.order),
      Array.from({ length: story.chapters.length }, (_, index) => index + 1));
  }
});

test("preview is offline, navigable and escapes markup in text", () => {
  const html = libraryHtml([{ ...stories[0], title: "<script>wrong()</script>" }]);
  assert.ok(html.includes("&lt;script&gt;wrong()&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('href="#launch_'));
  assert.ok(html.includes('lang="tr"'));
});

test("default dry-run sorts authors by document UID and never writes", async () => {
  const db = database();
  const result = await seedLibrary(db, stories, { verifyAuthors });
  assert.equal(result.status, "dry-run");
  assert.equal(db.writes, 0);
  assert.deepEqual(result.assignments.map(item => item.authorId),
    Array.from({ length: 10 }, (_, index) => `user-${String(index).padStart(2, "0")}`));
  assert.equal(db.documents.size, 10);
});

test("publishes all content atomically with actual author ownership, free chapters and real zero counters", async () => {
  const db = database();
  const result = await seedLibrary(db, stories, { apply: true, fields, verifyAuthors });
  assert.equal(result.status, "created");
  assert.equal(db.documents.size, 87); // 10 profiles, 10 stories, 66 chapters, 1 private receipt
  assert.equal(db.writes, 87);
  for (const [index, story] of stories.entries()) {
    const saved = db.documents.get(`stories/${story.id}`);
    assert.equal(saved.authorId, result.assignments[index].authorId);
    assert.equal(saved.status, "published");
    assert.equal(saved.chapterCount, story.chapters.length);
    assert.equal(saved.readCount, 0);
    assert.equal(saved.summary, story.summary);
    assert.ok(!saved.summary.includes(ATTRIBUTION_NOTE));
    assert.equal(db.documents.get(`users/${saved.authorId}`).storyCount, 3);
    for (const chapter of story.chapters) {
      const stored = db.documents.get(`chapters/${story.id}_chapter_${chapter.order}`);
      assert.equal(stored.storyId, story.id);
      assert.equal(stored.content, chapter.content);
      assert.equal(stored.status, "published");
      assert.equal(stored.isPaid, false);
      assert.equal(stored.price, 0);
    }
  }
});

test("retry after a lost acknowledgement preserves author edits, newly added users and removed stories", async () => {
  const db = database();
  await seedLibrary(db, stories, { apply: true, fields, verifyAuthors });
  const first = db.documents.get(`stories/${stories[0].id}`);
  first.title = "Yazarın kendi yeni başlığı";
  db.documents.delete(`stories/${stories[1].id}`);
  db.documents.set("users/later-user", { displayName: "Sonraki kullanıcı" });
  const writesBefore = db.writes;
  const result = await seedLibrary(db, stories, { apply: true, fields,
    verifyAuthors: async () => { throw new Error("should not run again"); } });
  assert.equal(result.status, "already-complete");
  assert.equal(db.writes, writesBefore);
  assert.equal(first.title, "Yazarın kendi yeni başlığı");
  assert.equal(db.documents.has(`stories/${stories[1].id}`), false);
});

test("commit failure leaves no stories, chapters, counters or receipt and retry succeeds", async () => {
  const db = database();
  db.failCommit = true;
  await assert.rejects(seedLibrary(db, stories, { apply: true, fields, verifyAuthors }), /commit failure/);
  assert.equal(db.documents.size, 10);
  assert.equal(db.writes, 0);
  assert.ok([...db.documents.values()].every(value => value.storyCount === 2));
  db.failCommit = false;
  assert.equal((await seedLibrary(db, stories, { apply: true, fields, verifyAuthors })).status, "created");
});

test("refuses wrong user count and frozen/banned/deleting profiles without mutations", async () => {
  const db = database();
  db.documents.delete("users/user-00");
  await assert.rejects(seedLibrary(db, stories, { apply: true, fields, verifyAuthors }), /10 kullanıcı/);
  assert.equal(db.writes, 0);
  for (const flag of ["accountFrozen", "banned", "accountDeletionPending"]) {
    const blocked = database();
    blocked.documents.get("users/user-00")[flag] = true;
    await assert.rejects(seedLibrary(blocked, stories, { apply: true, fields, verifyAuthors }), /Etkin olmayan/);
    assert.equal(blocked.writes, 0);
  }
});

test("Auth verification failure and ID collision never overwrite existing data", async () => {
  const db = database();
  await assert.rejects(seedLibrary(db, stories, { apply: true, fields,
    verifyAuthors: async () => { throw new Error("missing registered Auth user"); } }), /missing registered/);
  assert.equal(db.writes, 0);
  const chapterPath = `chapters/${stories[0].id}_chapter_1`;
  db.documents.set(chapterPath, { content: "previous content" });
  await assert.rejects(seedLibrary(db, stories, { apply: true, fields, verifyAuthors }), /kimliği zaten mevcut/);
  assert.equal(db.documents.get(chapterPath).content, "previous content");
  assert.equal(db.writes, 0);
});

test("modified content or partial receipts are explicit conflicts, not silent reseeding", async () => {
  const db = database();
  await seedLibrary(db, stories, { apply: true, fields, verifyAuthors });
  const changed = [{ ...stories[0], title: "Changed seed text" }, ...stories.slice(1)];
  await assert.rejects(seedLibrary(db, changed, { apply: true, fields, verifyAuthors }), /Önceki başlangıç/);
  const receipt = db.documents.get(`privateSeedRuns/${SEED_ID}`);
  receipt.status = "partial";
  await assert.rejects(seedLibrary(db, stories, { apply: true, fields, verifyAuthors }), /tamamlanmamış/);
});

test("parser rejects missing/short chapters and invalid headers", () => {
  assert.throws(() => parseStory("# Title\nTür: Other\n", "01-test.md"), /Başlık bilgileri/);
  const header = "# Örnek\nTür: Fantastik\nEtiketler: test, taslak\nÖzet: Yeterince uzun hazırlanmış örnek bir açıklama cümlesi burada yer alıyor.\n\n";
  assert.throws(() => parseStory(`${header}## 1. Bölüm\nKısacık metin.`, "01-test.md"), /bölüm eksik/);
});
