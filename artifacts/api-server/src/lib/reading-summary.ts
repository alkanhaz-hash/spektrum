import type { StoryReadingReport } from "@workspace/api-zod";

export interface ReadingSession {
  chapterId: string; visitId: string; progress: number; activeSeconds: number;
  startedAt: number; updatedAt: number;
}
export interface ReadingChapter { chapterId: string; title: string; order: number }
export const isComplete = (s: ReadingSession) => s.progress >= 90 && s.activeSeconds >= 10;

export function summarizeReading(input: {
  storyId: string; title: string; days: number; now: number; truncated: boolean;
  chapters: ReadingChapter[]; sessions: ReadingSession[];
}): StoryReadingReport {
  const since = input.now - input.days * 86400_000;
  const chapters = [...input.chapters].sort((a, b) => a.order - b.order || a.chapterId.localeCompare(b.chapterId));
  const ids = new Set(chapters.map(c => c.chapterId));
  const sessions = input.sessions.filter(s => ids.has(s.chapterId) && s.startedAt >= since && s.startedAt <= input.now);
  const stale = (s: ReadingSession) => !isComplete(s) && s.updatedAt <= input.now - 86400_000;
  const byVisit = new Map<string, Map<string, ReadingSession>>();
  for (const s of sessions) {
    if (!byVisit.has(s.visitId)) byVisit.set(s.visitId, new Map());
    byVisit.get(s.visitId)!.set(s.chapterId, s);
  }
  return {
    storyId: input.storyId, title: input.title, days: input.days,
    measuredFrom: new Date(since).toISOString(), generatedAt: new Date(input.now).toISOString(),
    sessionCount: sessions.length, visitCount: byVisit.size,
    completedCount: sessions.filter(isComplete).length, staleCount: sessions.filter(stale).length,
    activeSeconds: sessions.reduce((sum, s) => sum + s.activeSeconds, 0), truncated: input.truncated,
    chapters: chapters.map((chapter, index) => {
      const rows = sessions.filter(s => s.chapterId === chapter.chapterId);
      const exits = rows.filter(stale);
      const completed = rows.filter(isComplete).length;
      const next = chapters[index + 1]?.chapterId;
      return {
        ...chapter, sessions: rows.length,
        reached25: rows.filter(s => s.progress >= 25).length,
        reached50: rows.filter(s => s.progress >= 50).length,
        reached75: rows.filter(s => s.progress >= 75).length,
        completed, completionRate: rows.length ? Math.round(completed * 1000 / rows.length) / 10 : 0,
        stale: exits.length, recentUnfinished: rows.filter(s => !isComplete(s) && !stale(s)).length,
        continued: next ? rows.filter(s => {
          const following = byVisit.get(s.visitId)?.get(next);
          return following && following.startedAt >= s.startedAt;
        }).length : 0,
        meanActiveSeconds: rows.length ? Math.round(rows.reduce((sum, s) => sum + s.activeSeconds, 0) / rows.length) : 0,
        exit0to24: exits.filter(s => s.progress < 25).length,
        exit25to49: exits.filter(s => s.progress >= 25 && s.progress < 50).length,
        exit50to74: exits.filter(s => s.progress >= 50 && s.progress < 75).length,
        exit75to100: exits.filter(s => s.progress >= 75).length,
      };
    }),
  };
}
