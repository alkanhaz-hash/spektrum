import { useEffect, useRef } from "react";
import { createReadingTracker } from "@workspace/reading-analytics";
import { sendReadingObservation } from "@/lib/reading-analytics";
import { auth } from "@/lib/firebase";

const visits = new Map<string, { id: string; chapters: Map<string, { activeSeconds: number; progress: number }> }>();
export function useReadingAnalytics(storyId: string | undefined, chapterId: string | undefined, enabled: boolean, paused: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!enabled || !storyId || !chapterId) return;
    const key = `${uid ?? "guest"}:${storyId}`;
    if (!visits.has(key)) {
      if (visits.size >= 20) visits.delete(visits.keys().next().value!);
      visits.set(key, { id: crypto.randomUUID(), chapters: new Map() });
    }
    const visit = visits.get(key)!;
    const tracker = createReadingTracker({
      storyId, chapterId, visitId: visit.id, initial: visit.chapters.get(chapterId),
      send: input => auth.currentUser?.uid === uid ? sendReadingObservation(input) : Promise.resolve(),
    });
    let focused = document.visibilityState === "visible" && document.hasFocus();
    const flush = () => { void tracker.flush().catch(() => console.warn("[reading] Ölçüm gönderilemedi; sonraki ölçümde yeniden denenecek.")); };
    const measure = () => {
      if (!focused || pausedRef.current) return;
      const box = contentRef.current?.getBoundingClientRect();
      if (box && box.height > 0) tracker.progress((window.innerHeight - box.top) * 100 / box.height);
    };
    const interact = () => { if (focused && !pausedRef.current) tracker.interact(); };
    const visibility = () => {
      tracker.tick(focused && !pausedRef.current);
      focused = document.visibilityState === "visible" && document.hasFocus();
      if (focused) { tracker.interact(); measure(); }
      flush();
    };
    const scroll = () => { interact(); measure(); };
    const clock = setInterval(() => tracker.tick(focused && !pausedRef.current), 5000);
    const upload = setInterval(flush, 30000);
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (contentRef.current) observer.observe(contentRef.current);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    window.addEventListener("focus", visibility);
    window.addEventListener("blur", visibility);
    window.addEventListener("pagehide", visibility);
    document.addEventListener("visibilitychange", visibility);
    flush();
    return () => {
      tracker.tick(focused && !pausedRef.current);
      visit.chapters.set(chapterId, tracker.snapshot());
      flush();
      clearInterval(clock); clearInterval(upload); cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("scroll", scroll); window.removeEventListener("resize", measure);
      window.removeEventListener("pointerdown", interact); window.removeEventListener("keydown", interact);
      window.removeEventListener("focus", visibility); window.removeEventListener("blur", visibility);
      window.removeEventListener("pagehide", visibility); document.removeEventListener("visibilitychange", visibility);
    };
  }, [storyId, chapterId, uid, enabled]);
  return contentRef;
}
