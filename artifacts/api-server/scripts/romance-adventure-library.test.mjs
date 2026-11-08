import test from "node:test";
import assert from "node:assert/strict";
import { loadStoriesFromDirectory } from "./launch-library.mjs";

const stories = await loadStoriesFromDirectory("artifacts/api-server/seed-content-romance");

test("sequel collection has ten separate six-chapter books with substantial chapters", () => {
  assert.equal(stories.length, 10);
  assert.equal(new Set(stories.map(s => s.title)).size, 10);
  assert.equal(new Set(stories.map(s => s.id)).size, 10);
  for (const story of stories) {
    assert.equal(story.chapters.length, 6);
    assert.ok(story.chapters.every(ch => ch.wordCount >= 70), story.title);
    assert.deepEqual(story.chapters.map(ch => ch.order), [1, 2, 3, 4, 5, 6]);
  }
});

// Plot/genre quality requires reading the prose; keyword matching is not a
// semantic test, especially for Turkish inflected forms.
test("every book is tagged for romance and contains unique chapter texts", () => {
  const chapterTexts = stories.flatMap(story => story.chapters.map(ch => ch.content));
  assert.equal(new Set(chapterTexts).size, 60);
  for (const story of stories) {
    assert.ok(story.tags.includes("aşk"), story.title);
  }
});

test("published sequel summaries contain no public AI or account-consent label", () => {
  for (const story of stories) {
    assert.doesNotMatch(story.summary, /yapay zek|hesap sahibinin izni/u, story.title);
  }
});
