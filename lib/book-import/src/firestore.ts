import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { importSourceId, getImportFingerprint, validateImportPreview, type BookImportPreview } from "./index";
import { commitDraftImport } from "./commit";

interface ImporterOptions {
  db: Firestore;
  auth: { currentUser: { uid: string; getIdToken(): Promise<string> } | null };
  genres: readonly string[];
  digest: (text: string) => Promise<string>;
  emulatorBase?: string;
}
export function createBookImporter({ db, auth, genres, digest, emulatorBase }: ImporterOptions) {
  return async function importBookDraft(input: {
    sourceText: string; preview: BookImportPreview; ownershipConfirmed: boolean;
  }): Promise<{ storyId: string; alreadyImported: boolean }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Kitap aktarmak için giriş yap.");
    if (!input.ownershipConfirmed) throw new Error("Metnin telif hakkına sahip olduğunu açıkça onaylamalısın.");
    const preview = validateImportPreview(input.preview);
    if (!genres.includes(preview.genre)) throw new Error("Geçerli bir hikâye türü seç.");
    const storyId = await importSourceId(user.uid, input.sourceText, digest);
    const fingerprint = await getImportFingerprint(user.uid, preview, digest);
    const previewHash = await digest(JSON.stringify(preview));
    const storyRef = doc(db, "stories", storyId), legacyRef = doc(db, "stories", `import_${fingerprint}`);
    const checkSession = () => {
      if (auth.currentUser?.uid !== user.uid) throw new Error("Oturum değişti. Aynı hesapla giriş yapıp yeniden dene.");
    };
    const existingId = await runTransaction(db, async transaction => {
      checkSession();
      const profile = await transaction.get(doc(db, "users", user.uid));
      const story = await transaction.get(storyRef);
      const legacy = await transaction.get(legacyRef);
      const account = profile.data();
      if (!account || account.banned || account.accountFrozen || account.accountDeletionPending) throw new Error("Hesabın kitap aktarımına uygun değil.");
      if (story.exists()) {
        const data = story.data();
        if (data.authorId !== user.uid || !data.importState) throw new Error("Aktarım kimliği mevcut bir kayıtla çakışıyor.");
        if (data.importState === "complete") return storyId;
        if (data.importState !== "prepared" || data.chapterCount !== 0 || data.status !== "draft"
            || data.title !== preview.title || data.summary !== preview.summary || data.genre !== preview.genre
            || (data.importPreviewHash && data.importPreviewHash !== previewHash)) {
          throw new Error("Başlamış aktarımın önizlemesi değişmiş. Önceki aktarımı veya mevcut taslağı aç.");
        }
        if (!data.importPreviewHash) transaction.update(storyRef, { importPreviewHash: previewHash });
        return null;
      }
      if (legacy.exists() && legacy.data().authorId === user.uid && legacy.data().importFingerprint === fingerprint) {
        if (legacy.data().importState === "complete") return legacyRef.id;
        throw new Error("Bu metnin eski web aktarımı bekliyor. Aynı hesapla web Yaz bölümünden önceki aktarımı tamamla.");
      }
      transaction.set(storyRef, {
        authorId: user.uid, authorName: account.displayName ?? "", authorAvatar: account.avatarUrl ?? "",
        title: preview.title, summary: preview.summary, genre: preview.genre, coverUrl: "", tags: [],
        status: "draft", chapterCount: 0, readCount: 0, likeCount: 0, commentCount: 0,
        importState: "prepared", importPreviewHash: previewHash,
        ownershipConfirmedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      return null;
    });
    checkSession();
    if (existingId) return { storyId: existingId, alreadyImported: true };
    const projectId = db.app.options.projectId;
    if (!projectId) throw new Error("Firebase proje yapılandırması eksik.");
    const alreadyImported = await commitDraftImport({ projectId, uid: user.uid, emulatorBase, getToken: async () => {
      checkSession(); return user.getIdToken();
    } }, storyId, previewHash, preview);
    checkSession();
    return { storyId, alreadyImported };
  };
}
