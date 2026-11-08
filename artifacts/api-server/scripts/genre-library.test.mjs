import test from "node:test";
import assert from "node:assert/strict";
import {
  loadGenreLibrary, EXPECTED_GENRES,
  assertSourceUnchanged, storyChanges, chapterChanges,
} from "./genre-library.mjs";

const { before, after } = await loadGenreLibrary();

function fixture() {
  const assignments = before.map((story, index) => ({
    storyId: story.id, authorId: `authorized-${index}`,
    coverPath: `story-covers/authorized-${index}/${story.id}-old.webp`,
  }));
  const snap = (id, body) => ({ id, exists: true, data: () => body });
  const snapshots = before.flatMap((story, index) => [
    snap(story.id, {
      ...story, authorId: assignments[index].authorId, status: "published",
      chapterCount: 6, readCount: 12, likeCount: 3,
      coverUrl: `https://example.test/${encodeURIComponent(assignments[index].coverPath)}`,
    }),
    ...story.chapters.map(chapter => snap(`${story.id}_chapter_${chapter.order}`, {
      ...chapter, storyId: story.id, status: "published", isPaid: false, price: 0, readCount: 8,
    })),
  ]);
  return { snapshots, assignments };
}

test("balanced collection keeps ten stable book IDs and six chapters each", () => {
  assert.deepEqual(after.map(story => story.id), before.map(story => story.id));
  assert.deepEqual(after.map(story => story.genre), EXPECTED_GENRES);
  const totals = {};
  after.forEach(story => {
    totals[story.genre] = (totals[story.genre] ?? 0) + 1;
    assert.equal(story.chapters.length, 6);
    assert.ok(story.chapters.every(ch => ch.wordCount >= 70));
    assert.ok(!story.id.startsWith("launch_01-"));
  });
  assert.deepEqual(totals, { Fantastik: 2, Gizem: 2, Macera: 2, Romantik: 2, Spor: 2 });
  assert.equal(after.filter(story => story.tags.includes("aşk")).length, 2);
});

test("preflight allows genuine counters but never overwrites an author's changed content", () => {
  const valid = fixture();
  assert.doesNotThrow(() => assertSourceUnchanged(valid.snapshots, before, valid.assignments));
  valid.snapshots[0].data().readCount = 99;
  valid.snapshots[1].data().readCount = 14;
  assert.doesNotThrow(() => assertSourceUnchanged(valid.snapshots, before, valid.assignments));
  const storyEdit = fixture();
  storyEdit.snapshots[0].data().title = "Yazarın yeni başlığı";
  assert.throws(() => assertSourceUnchanged(storyEdit.snapshots, before, storyEdit.assignments), /korunarak/);
  const chapterEdit = fixture();
  chapterEdit.snapshots[1].data().content = "Yazarın sonradan yazdığı bölüm";
  assert.throws(() => assertSourceUnchanged(chapterEdit.snapshots, before, chapterEdit.assignments), /ezilmedi/);
});

test("deleted, unpublished, reassigned or repriced records explicitly stop the update", () => {
  for (const change of [
    f => { f.snapshots[0].exists = false; },
    f => { f.snapshots[0].data().authorId = "another-account"; },
    f => { f.snapshots[0].data().status = "draft"; },
    f => { f.snapshots[1].data().isPaid = true; },
    f => { f.snapshots[1].exists = false; },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => assertSourceUnchanged(f.snapshots, before, f.assignments));
  }
});

test("update patches cannot change ownership, IDs, counters, order or publication state", () => {
  const cover = { path: "new-cover.webp", url: "https://example.test/new-cover.webp" };
  assert.deepEqual(Object.keys(storyChanges(after[0], cover)).sort(), [
    "coverStoragePath", "coverUrl", "genre", "summary", "tags", "title",
  ]);
  assert.deepEqual(Object.keys(chapterChanges(after[0].chapters[0])).sort(), [
    "content", "title", "wordCount",
  ]);
});

test("public book summaries contain neither source nor account-assignment disclaimers", () => {
  after.forEach(story => assert.doesNotMatch(story.summary, /yapay zek[aâ]|hesap sahibinin izni/iu));
});
