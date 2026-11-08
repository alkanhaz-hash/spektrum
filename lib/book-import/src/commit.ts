import type { BookImportPreview } from "./index";

export interface ImportCommitContext {
  projectId: string;
  uid: string;
  getToken: () => Promise<string>;
  /** Explicit loopback endpoint only for isolated emulator tests. */
  emulatorBase?: string;
}
const fail = (message: string, code: string) => Object.assign(new Error(message), { code });
export async function commitDraftImport(
  ctx: ImportCommitContext, storyId: string, previewHash: string, preview: BookImportPreview,
): Promise<boolean> {
  if (ctx.emulatorBase) {
    const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(ctx.emulatorBase);
    const proxy = typeof window !== "undefined" && ctx.emulatorBase === `${window.location.origin}/__qa-firestore`;
    if (!ctx.projectId.startsWith("demo-") || (!local && !proxy)) throw new Error("Emülatör adresi geçersiz.");
  }
  const resource = `projects/${ctx.projectId}/databases/(default)/documents`;
  const base = `${ctx.emulatorBase ?? "https://firestore.googleapis.com"}/v1/${resource}`;
  const request = async (url: string, body?: unknown) => {
    const token = await ctx.getToken();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { method: body ? "POST" : "GET", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) {
        if (["FAILED_PRECONDITION", "ABORTED", "ALREADY_EXISTS"].includes(result.error?.status)) throw fail("Aktarım kaydı değişti.", "import-conflict");
        if (response.status === 403) throw fail("Firebase kayıt izni reddedildi. Hiçbir bölüm kısmi kaydedilmedi.", "permission-denied");
        if (response.status === 401) throw new Error("Oturum sona erdi. Aynı hesapla yeniden giriş yap.");
        if (response.status === 404) throw new Error("Aktarım taslağı bulunamadı.");
        throw fail("Sunucu kaydı doğrulayamadı. Aynı metinle tekrar dene.", "unavailable");
      }
      return result;
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error instanceof TypeError)) {
        throw fail("Bağlantı kesildi veya yanıt gecikti. Aynı aktarımı yeniden dene.", "unavailable");
      }
      throw error;
    } finally { clearTimeout(timer); }
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const story = await request(`${base}/stories/${storyId}`);
    const fields = story.fields ?? {};
    if (fields.authorId?.stringValue !== ctx.uid) throw new Error("Aktarım başka bir yazara ait.");
    if (fields.importState?.stringValue === "complete") return true;
    if (fields.importState?.stringValue !== "prepared" || fields.status?.stringValue !== "draft"
        || fields.chapterCount?.integerValue !== "0" || fields.importPreviewHash?.stringValue !== previewHash) {
      throw new Error("Aktarım taslağı değiştirilmiş. Editörden kontrol et; üzerine yazılmadı.");
    }
    const writes = preview.chapters.map((chapter, index) => ({
      update: { name: `${resource}/chapters/${storyId}_${index + 1}`, fields: {
        storyId: { stringValue: storyId }, title: { stringValue: chapter.title }, content: { stringValue: chapter.content },
        order: { integerValue: String(index + 1) }, wordCount: { integerValue: String(chapter.content.split(/\s+/u).filter(Boolean).length) },
        readCount: { integerValue: "0" }, status: { stringValue: "draft" }, isPaid: { booleanValue: false }, price: { integerValue: "0" },
      } },
      currentDocument: { exists: false },
      updateTransforms: ["createdAt", "updatedAt"].map(fieldPath => ({ fieldPath, setToServerValue: "REQUEST_TIME" })),
    }));
    try {
      await request(`${base}:commit`, { writes: [...writes, {
        update: { name: `${resource}/stories/${storyId}`, fields: {
          importState: { stringValue: "complete" }, chapterCount: { integerValue: String(preview.chapters.length) },
        } },
        updateMask: { fieldPaths: ["importState", "chapterCount"] }, currentDocument: { updateTime: story.updateTime },
        updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      }, {
        transform: { document: `${resource}/users/${ctx.uid}`, fieldTransforms: [
          { fieldPath: "storyCount", increment: { integerValue: "1" } },
        ] }, currentDocument: { exists: true },
      }] });
      return false;
    } catch (error) {
      if ((error as { code?: string }).code !== "import-conflict") throw error;
      if (attempt === 2) {
        const latest = await request(`${base}/stories/${storyId}`);
        if (latest.fields?.authorId?.stringValue === ctx.uid && latest.fields.importState?.stringValue === "complete") return true;
        throw new Error("Mevcut bölümler veya eşzamanlı değişiklik var. Hiçbir bölümün üzerine yazılmadı; mevcut taslağı kontrol et.");
      }
    }
  }
  throw new Error("Aktarım tamamlanamadı.");
}
