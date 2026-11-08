import { doc, increment, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { GENRES } from "./firestore-service";
import { getImportFingerprint, validateImportPreview, type BookImportPreview, type BookImportSource } from "./book-import";
import { commitImportedChapters } from "./book-import-commit";

export interface BookImportRequest {
  preview: BookImportPreview;
  source: BookImportSource;
  ownershipConfirmed: boolean;
}

/** The source files stay on-device; only the reviewed plain text is saved. */
export async function saveImportedBook(
  request: BookImportRequest,
  onProgress?: (stage: "preparing" | "saving-chapters" | "complete") => void,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Kitabını aktarmak için giriş yap.");
  if (!request.ownershipConfirmed) throw new Error("Metnin telif hakkının sana ait olduğunu açıkça onaylamalısın.");
  const preview = validateImportPreview(request.preview);
  if (!GENRES.includes(preview.genre)) throw new Error("Geçerli bir kitap türü seç.");
  if (!["txt", "docx", "paste"].includes(request.source)) throw new Error("Aktarım kaynağı geçersiz.");
  const fingerprint = await getImportFingerprint(user.uid, preview);
  const storyId = `import_${fingerprint}`;
  const storyRef = doc(db, "stories", storyId);
  const userRef = doc(db, "users", user.uid);
  const checkSession = () => {
    if (auth.currentUser?.uid !== user.uid) throw new Error("Oturum değişti. Aynı yazar hesabıyla tekrar giriş yap.");
  };
  onProgress?.("preparing");
  // The parent must be committed first: existing chapter rules use get(story),
  // not getAfter(story), when checking author ownership.
  const finished = await runTransaction(db, async (transaction) => {
    checkSession();
    const story = await transaction.get(storyRef);
    if (story.exists()) {
      const data = story.data();
      if (data.authorId !== user.uid || data.importFingerprint !== fingerprint) {
        throw new Error("Aktarım kaydı bu yazar veya bu metinle eşleşmiyor.");
      }
      return data.importState === "complete";
    }
    const profile = await transaction.get(userRef);
    if (!profile.exists()) throw new Error("Yazar profilin bulunamadı. Profilini tamamlayıp tekrar dene.");
    if (profile.data().banned || profile.data().accountFrozen || profile.data().accountDeletionPending) throw new Error("Bu hesapla içerik aktarımı yapılamıyor.");
    transaction.set(storyRef, {
      authorId: user.uid,
      authorName: profile.data().displayName ?? user.displayName ?? "Yazar",
      authorAvatar: profile.data().avatarUrl ?? "",
      title: preview.title, summary: preview.summary, genre: preview.genre, contentLanguage: "tr",
      tags: [], coverUrl: "", status: "draft",
      readCount: 0, likeCount: 0, commentCount: 0, chapterCount: 0,
      importFingerprint: fingerprint, importState: "pending",
      importChapterCount: preview.chapters.length, importSource: request.source,
      ownershipConfirmed: true, ownershipConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    transaction.update(userRef, { storyCount: increment(1) });
    return false;
  });
  if (finished) { onProgress?.("complete"); return storyId; }
  onProgress?.("saving-chapters");
  await commitImportedChapters(storyId, fingerprint, preview, user.uid);
  checkSession();
  onProgress?.("complete");
  return storyId;
}

export function getBookImportError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied") return "Firebase izni nedeniyle kayıt tamamlanamadı. Hesap veya güvenlik kurallarını kontrol et. Aynı içerikle yeniden denemek kopya oluşturmaz.";
  if (code === "unavailable" || code === "deadline-exceeded") return "Bağlantı kesildi. Metni değiştirmeden yeniden dene; aynı aktarım kaldığı kayıttan devam eder.";
  return error instanceof Error ? error.message : "Aktarım tamamlanamadı. Aynı içerikle tekrar dene.";
}
