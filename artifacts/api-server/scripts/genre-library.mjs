import { isDeepStrictEqual } from "node:util";
import { loadStoriesFromDirectory, libraryDigest } from "./launch-library.mjs";

export const SOURCE_ID = "spektrum-romance-adventure-library";
export const REVISION_ID = "spektrum-genre-separated-library";
export const EXPECTED_GENRES = [
  "Fantastik", "Gizem", "Fantastik", "Macera", "Gizem",
  "Macera", "Romantik", "Romantik", "Spor", "Spor",
];

export async function loadGenreLibrary() {
  const before = await loadStoriesFromDirectory("artifacts/api-server/seed-content-romance");
  const after = await loadStoriesFromDirectory("artifacts/api-server/seed-content-diverse");
  after.forEach((story, index) => {
    if (story.id !== before[index].id || story.chapters.length !== 6 ||
        story.genre !== EXPECTED_GENRES[index]) throw new Error("Tür dağılımı veya kalıcı kitap kimliği geçersiz.");
    if (story.genre !== "Romantik" && story.tags.includes("aşk")) {
      throw new Error("Aşk etiketi yalnızca iki romantik kitapta olmalı.");
    }
  });
  return { before, after, sourceDigest: libraryDigest(before), digest: libraryDigest(after) };
}

/** Never overwrite an author's edit, publication change or cover replacement. */
export function assertSourceUnchanged(snapshots, stories, assignments) {
  if (snapshots.length !== 70 || assignments.length !== 10) throw new Error("Kaynak kayıt sayısı eksik.");
  for (let index = 0; index < stories.length; index++) {
    const story = stories[index];
    const assignment = assignments[index];
    const snapshot = snapshots[index * 7];
    const data = snapshot?.data();
    if (!snapshot?.exists || snapshot.id !== story.id || assignment.storyId !== story.id ||
        data.authorId !== assignment.authorId || data.title !== story.title ||
        data.summary !== story.summary || data.genre !== story.genre ||
        !isDeepStrictEqual(data.tags, story.tags) || data.chapterCount !== 6 ||
        data.status !== "published" || typeof data.coverUrl !== "string" ||
        !data.coverUrl.includes(encodeURIComponent(assignment.coverPath))) {
      throw new Error(`${story.title}: yayın sonrası düzenlenmiş veya eksik kitap korunarak işlem durduruldu.`);
    }
    story.chapters.forEach((chapter, chapterIndex) => {
      const saved = snapshots[index * 7 + chapterIndex + 1];
      const body = saved?.data();
      if (!saved?.exists || saved.id !== `${story.id}_chapter_${chapter.order}` ||
          body.storyId !== story.id || body.title !== chapter.title ||
          body.content !== chapter.content || body.order !== chapter.order ||
          body.status !== "published" || body.isPaid !== false || body.price !== 0) {
        throw new Error(`${story.title}: bir bölüm düzenlenmiş veya eksik; yazarın çalışması ezilmedi.`);
      }
    });
  }
}

export function storyChanges(story, cover) {
  return {
    title: story.title, summary: story.summary, genre: story.genre, tags: story.tags,
    coverUrl: cover.url, coverStoragePath: cover.path,
  };
}

export function chapterChanges(chapter) {
  return { title: chapter.title, content: chapter.content, wordCount: chapter.wordCount };
}
