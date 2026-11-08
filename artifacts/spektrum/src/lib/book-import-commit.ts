import { auth, db } from "./firebase";
import type { BookImportPreview } from "./book-import";

type RestField = { stringValue?: string };
interface RestDocument { updateTime: string; fields: Record<string, RestField> }
function failure(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

/**
 * Atomically create chapters without reading nonexistent private documents.
 * SDK set() has no create-only precondition; REST commit does. This prevents
 * overwriting an edited/orphan chapter and needs no wider Firestore read rule.
 */
export async function commitImportedChapters(storyId: string, fingerprint: string, preview: BookImportPreview, uid: string): Promise<void> {
  const projectId = db.app.options.projectId;
  if (!projectId) throw new Error("Firebase proje yapılandırması eksik.");
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const name = `projects/${projectId}/databases/(default)/documents`;
  const request = async (url: string, body?: unknown) => {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) throw new Error("Oturum değişti. Aynı yazar hesabıyla tekrar giriş yap.");
    const token = await user.getIdToken();
    let response: Response;
    try {
      response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw failure("Bağlantı kesildi. Aynı içerikle yeniden dene.", "unavailable");
    }
    const result = await response.json();
    if (!response.ok) {
      const status = result?.error?.status;
      if (response.status === 403) throw failure("Firebase kayıt izni reddedildi.", "permission-denied");
      if (status === "FAILED_PRECONDITION" || status === "ABORTED") throw failure("Aktarım kaydı değişti.", "import-conflict");
      if (response.status === 404) throw new Error("Aktarım taslağı silinmiş. Yeniden dene.");
      if (response.status >= 500) throw failure("Firebase geçici olarak yanıt vermiyor.", "unavailable");
      if (response.status === 401) throw new Error("Oturumun sona erdi. Yeniden giriş yap.");
      throw new Error("Firebase bölümleri kaydedemedi. Metni değiştirmeden yeniden dene.");
    }
    return result;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const story = await request(`${base}/stories/${storyId}`) as RestDocument;
    if (story.fields.authorId?.stringValue !== uid || story.fields.importFingerprint?.stringValue !== fingerprint) {
      throw new Error("Aktarım kaydı bu yazar veya metinle eşleşmiyor.");
    }
    if (story.fields.importState?.stringValue === "complete") return;
    const writes = preview.chapters.map((chapter, index) => ({
      update: {
        name: `${name}/chapters/${storyId}_${index + 1}`,
        fields: {
          storyId: { stringValue: storyId }, title: { stringValue: chapter.title },
          content: { stringValue: chapter.content }, order: { integerValue: String(index + 1) },
          wordCount: { integerValue: String(chapter.content.split(/\s+/u).filter(Boolean).length) },
          readCount: { integerValue: "0" }, status: { stringValue: "draft" },
          isPaid: { booleanValue: false }, price: { integerValue: "0" },
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
        { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
      ],
    }));
    const completion = {
      update: { name: `${name}/stories/${storyId}`, fields: { importState: { stringValue: "complete" } } },
      updateMask: { fieldPaths: ["importState"] },
      currentDocument: { updateTime: story.updateTime },
      updateTransforms: [
        { fieldPath: "chapterCount", increment: { integerValue: String(preview.chapters.length) } },
        { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
      ],
    };
    try {
      await request(`${base}:commit`, { writes: [...writes, completion] });
      return;
    } catch (error) {
      if ((error as { code?: string })?.code !== "import-conflict") throw error;
      // Another retry may have completed the exact same import. Re-read the
      // marker; never remove creation preconditions or overwrite old chapters.
      if (attempt === 2) {
        const latest = await request(`${base}/stories/${storyId}`) as RestDocument;
        if (latest.fields.importState?.stringValue === "complete") return;
        throw new Error("Taslakta mevcut bölümler veya eşzamanlı değişiklikler var. Hiçbir bölümün üzerine yazılmadı; yazar panelindeki taslağı kontrol et.");
      }
    }
  }
}
