import type { ReadingObservation } from "@workspace/api-client-react";
export type { ReadingObservation, StoryReadingReport } from "@workspace/api-client-react";

/** Cumulative, monotone telemetry; no account identifiers or text are collected. */
export function createReadingTracker(options: {
  storyId: string; chapterId: string; visitId: string;
  send: (input: ReadingObservation) => Promise<unknown>;
  now?: () => number;
  initial?: { activeSeconds: number; progress: number };
}) {
  const now = options.now ?? Date.now;
  let lastTick = now(), lastInteraction = lastTick;
  let seconds = options.initial?.activeSeconds ?? 0, progress = options.initial?.progress ?? 0;
  let running: Promise<void> | null = null, pending = false;
  let acknowledged = "";
  function tick(active: boolean) {
    const time = now();
    const elapsed = Math.max(0, Math.min(10_000, time - lastTick));
    if (active && time - lastInteraction <= 60_000) seconds += elapsed / 1000;
    lastTick = time;
  }
  function flush(): Promise<void> {
    pending = true;
    if (running) return running;
    running = (async () => {
      while (pending) {
        pending = false;
        const input = {
          storyId: options.storyId, chapterId: options.chapterId, visitId: options.visitId,
          progress, activeSeconds: Math.min(86400, Math.floor(seconds)),
        };
        const key = `${input.progress}:${input.activeSeconds}`;
        if (key !== acknowledged) {
          await options.send(input);
          acknowledged = key;
        }
      }
    })().finally(() => { running = null; });
    return running;
  }
  return {
    tick, flush,
    snapshot: () => ({ activeSeconds: seconds, progress }),
    interact: () => { lastInteraction = now(); },
    progress: (value: number) => {
      if (Number.isFinite(value)) progress = Math.max(progress, Math.min(100, Math.max(0, Math.floor(value))));
      lastInteraction = now();
    },
  };
}
