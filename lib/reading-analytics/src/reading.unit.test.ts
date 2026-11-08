import assert from "node:assert/strict";
import test from "node:test";
import { createReadingTracker } from "./index";
import { summarizeReading, type ReadingSession } from "../../../artifacts/api-server/src/lib/reading-summary";

test("cumulative progress is bounded, monotone and acknowledged snapshots are not resent", async () => {
  let time = 0;
  const sent: any[] = [];
  const tracker = createReadingTracker({ storyId: "book", chapterId: "one", visitId: "visit", now: () => time, send: async x => { sent.push(x); } });
  await tracker.flush();
  time = 5000; tracker.tick(true); tracker.progress(75);
  time = 10000; tracker.tick(true); tracker.progress(20); tracker.progress(NaN);
  await tracker.flush(); await tracker.flush();
  assert.equal(sent.length, 2);
  assert.deepEqual([sent[1].progress, sent[1].activeSeconds], [75, 10]);
  tracker.progress(200); await tracker.flush();
  assert.equal(sent[2].progress, 100);
  assert.ok(!("uid" in sent[2]));
});
test("background time, long suspended ticks and idle time are not counted as reading", () => {
  let time = 0;
  const tracker = createReadingTracker({ storyId: "book", chapterId: "one", visitId: "visit", now: () => time, send: async () => {} });
  for (time = 5000; time <= 65000; time += 5000) tracker.tick(true);
  assert.equal(tracker.snapshot().activeSeconds, 60);
  time += 300000; tracker.tick(false);
  tracker.interact(); time += 5000; tracker.tick(true);
  assert.equal(tracker.snapshot().activeSeconds, 65);
  time += 100000; tracker.interact(); tracker.tick(true);
  assert.equal(tracker.snapshot().activeSeconds, 75); // A delayed timer can add at most 10 seconds.
});
test("a failed upload remains retryable rather than falsely acknowledged", async () => {
  let requests = 0;
  const tracker = createReadingTracker({ storyId: "book", chapterId: "one", visitId: "visit", send: async () => { if (++requests === 1) throw new Error("offline"); } });
  await assert.rejects(tracker.flush(), /offline/);
  await tracker.flush(); await tracker.flush();
  assert.equal(requests, 2);
});
test("updates during a pending upload are serialized and the latest snapshot is sent", async () => {
  let release!: () => void;
  const waiting = new Promise<void>(r => { release = r; });
  const sent: any[] = [];
  const tracker = createReadingTracker({ storyId: "book", chapterId: "one", visitId: "visit", send: async x => { sent.push(x); if (sent.length === 1) await waiting; } });
  const first = tracker.flush();
  tracker.progress(80);
  const second = tracker.flush();
  assert.equal(first, second);
  release(); await first;
  assert.deepEqual(sent.map(x => x.progress), [0, 80]);
});
test("returning to a chapter preserves cumulative active time within the same visit", () => {
  let time = 0;
  const tracker = createReadingTracker({ storyId: "book", chapterId: "one", visitId: "visit", now: () => time, initial: { progress: 50, activeSeconds: 25 }, send: async () => {} });
  time = 5000; tracker.tick(true);
  assert.deepEqual(tracker.snapshot(), { progress: 50, activeSeconds: 30 });
});

const day = 86400_000, now = Date.UTC(2026, 9, 21);
const chapters = [{ chapterId: "c1", title: "Bir", order: 1 }, { chapterId: "c2", title: "İki", order: 2 }];
const row = (chapterId: string, visitId: string, progress: number, activeSeconds: number, age: number): ReadingSession =>
  ({ chapterId, visitId, progress, activeSeconds, startedAt: now - age * day, updatedAt: now - age * day });
const sessions = [row("c1", "v1", 90, 20, 2), row("c2", "v1", 50, 10, .1), row("c1", "v2", 30, 20, 2), row("c1", "v3", 100, 0, 2), row("c2", "v4", 80, 15, 40)];
test("completion requires both progress and active time; stale exits and continuation are separate", () => {
  const report = summarizeReading({ storyId: "book", title: "Kitap", days: 30, now, truncated: false, chapters, sessions });
  assert.deepEqual([report.sessionCount, report.visitCount, report.completedCount, report.staleCount, report.activeSeconds], [4, 3, 1, 2, 50]);
  const c = report.chapters[0];
  assert.deepEqual([c.sessions, c.completed, c.completionRate, c.stale, c.continued, c.meanActiveSeconds], [3, 1, 33.3, 2, 1, 13]);
  assert.equal(c.exit25to49, 1); assert.equal(c.exit75to100, 1);
  assert.equal(report.chapters[1].recentUnfinished, 1);
  assert.ok(!JSON.stringify(report).includes("visitId"));
});
test("rolling windows, unpublished/deleted chapter exclusion, empty values and sample warning are explicit", () => {
  const report = summarizeReading({ storyId: "book", title: "Kitap", days: 90, now, truncated: true, chapters, sessions });
  assert.equal(report.sessionCount, 5); assert.equal(report.truncated, true);
  const empty = summarizeReading({ storyId: "book", title: "Kitap", days: 7, now, truncated: false, chapters, sessions: [row("unknown", "v", 100, 30, 1)] });
  assert.equal(empty.sessionCount, 0);
  assert.equal(empty.chapters[0].completionRate, 0);
  assert.equal(empty.chapters[0].meanActiveSeconds, 0);
});
