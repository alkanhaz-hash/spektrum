import { useCallback, useEffect, useRef } from "react";
import { AppState, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { createReadingTracker } from "@workspace/reading-analytics";
import { sendReadingObservation } from "@/lib/reading-analytics";
import { auth } from "@/lib/firebase";

const visits = new Map<string, { id: string; chapters: Map<string, { activeSeconds: number; progress: number }> }>();
export function useReadingAnalytics(storyId: string | undefined, chapterId: string | undefined, enabled: boolean, paused: boolean) {
  const controller = useRef<ReturnType<typeof createReadingTracker> | null>(null);
  const focused = useRef(false), pausedRef = useRef(paused);
  const currentChapter = useRef(chapterId);
  const metrics = useRef({ chapterId, offset: 0, height: 0, viewport: 0 });
  if (metrics.current.chapterId !== chapterId) metrics.current = { chapterId, offset: 0, height: 0, viewport: 0 };
  currentChapter.current = chapterId;
  pausedRef.current = paused;
  const uid = auth.currentUser?.uid;
  const active = () => focused.current && AppState.currentState === "active" && !pausedRef.current;
  const flush = () => { void controller.current?.flush().catch(() => console.warn("[reading] Ölçüm gönderilemedi; sonraki ölçümde yeniden denenecek.")); };
  const measure = () => {
    if (currentChapter.current !== chapterId || !active()) return;
    const m = metrics.current;
    // Pixel depth also works for a chapter containing a single very long paragraph.
    if (m.height > 0 && m.viewport > 0) controller.current?.progress((m.offset + m.viewport) * 100 / m.height);
  };
  useFocusEffect(useCallback(() => {
    focused.current = true;
    controller.current?.tick(false); controller.current?.interact();
    return () => { controller.current?.tick(active()); focused.current = false; flush(); };
  }, []));
  useEffect(() => {
    if (!enabled || !storyId || !chapterId) return;
    const key = `${uid ?? "guest"}:${storyId}`;
    if (!visits.has(key)) {
      if (visits.size >= 20) visits.delete(visits.keys().next().value!);
      visits.set(key, { id: Crypto.randomUUID(), chapters: new Map() });
    }
    const visit = visits.get(key)!;
    const tracker = createReadingTracker({
      storyId, chapterId, visitId: visit.id, initial: visit.chapters.get(chapterId),
      send: input => auth.currentUser?.uid === uid ? sendReadingObservation(input) : Promise.resolve(),
    });
    controller.current = tracker;
    measure();
    flush();
    const clock = setInterval(() => tracker.tick(active()), 5000);
    const upload = setInterval(flush, 30000);
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", state => {
      tracker.tick(focused.current && previousState === "active" && !pausedRef.current);
      previousState = state;
      tracker.interact();
      flush();
    });
    return () => {
      tracker.tick(active()); visit.chapters.set(chapterId, tracker.snapshot()); flush(); controller.current = null;
      clearInterval(clock); clearInterval(upload); subscription.remove();
    };
  }, [storyId, chapterId, uid, enabled]);
  return {
    scrollEventThrottle: 200,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (currentChapter.current !== chapterId) return;
      const e = event.nativeEvent;
      metrics.current.offset = e.contentOffset.y;
      metrics.current.height = e.contentSize.height;
      metrics.current.viewport = e.layoutMeasurement.height;
      if (active()) { controller.current?.interact(); measure(); }
    },
    onLayout: (event: LayoutChangeEvent) => {
      if (currentChapter.current !== chapterId) return;
      metrics.current.viewport = event.nativeEvent.layout.height;
      measure();
    },
    onContentSizeChange: (_width: number, height: number) => {
      if (currentChapter.current !== chapterId) return;
      metrics.current.height = height;
      measure();
    },
    onTouchStart: () => { if (active()) controller.current?.interact(); },
  };
}
