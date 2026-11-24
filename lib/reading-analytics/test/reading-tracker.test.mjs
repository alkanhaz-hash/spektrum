import assert from "node:assert/strict";
import test from "node:test";

import { createReadingTracker } from "../src/index.ts";

test("reading telemetry stays cumulative, bounded, and free of account or text fields", async () => {
  let now = 0;
  const sent = [];
  const tracker = createReadingTracker({
    storyId: "story-public-id",
    chapterId: "chapter-public-id",
    visitId: "anonymous-visit-id",
    now: () => now,
    send: async (observation) => sent.push(observation),
  });

  tracker.interact();
  now = 5_000;
  tracker.tick(true);
  tracker.progress(42);
  now = 10_000;
  tracker.tick(false);
  tracker.progress(20);
  now = 20_000;
  tracker.progress(140);
  await tracker.flush();

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    storyId: "story-public-id",
    chapterId: "chapter-public-id",
    visitId: "anonymous-visit-id",
    progress: 100,
    activeSeconds: 5,
  });
  assert.deepEqual(Object.keys(sent[0]).sort(), [
    "activeSeconds",
    "chapterId",
    "progress",
    "storyId",
    "visitId",
  ]);
  assert.equal("userId" in sent[0], false);
  assert.equal("email" in sent[0], false);
  assert.equal("content" in sent[0], false);
});

test("repeated flushes do not resend unchanged reading progress", async () => {
  let now = 0;
  const sent = [];
  const tracker = createReadingTracker({
    storyId: "story-public-id",
    chapterId: "chapter-public-id",
    visitId: "anonymous-visit-id",
    now: () => now,
    send: async (observation) => sent.push(observation),
  });

  tracker.progress(25);
  await tracker.flush();
  now = 1_000;
  await tracker.flush();

  assert.equal(sent.length, 1);
});
