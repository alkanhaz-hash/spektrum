/**
 * Offline content check/export requires no credentials.
 * Live dry-run requires the existing project's Firebase Admin service account.
 * Live writes additionally require --apply --confirm-author-consent
 * --confirm-project=the-exact-Firebase-project-id.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadStories, libraryHtml, seedLibrary, verifyLibrary } from "./launch-library.mjs";

async function main() {
  const args = process.argv.slice(2);
  const known = arg => ["--check", "--verify", "--apply", "--confirm-author-consent"].includes(arg) ||
    arg.startsWith("--confirm-project=") || arg.startsWith("--export=");
  if (args.some(arg => !known(arg))) throw new Error("Bilinmeyen komut seçeneği.");
  const stories = await loadStories();
  const summary = stories.map(s => ({ title: s.title, chapters: s.chapters.length, words: s.wordCount }));
  console.table(summary);
  if (args.filter(arg => ["--check", "--verify", "--apply"].includes(arg)).length > 1) {
    throw new Error("--check, --verify ve --apply seçeneklerinden yalnızca biri kullanılabilir.");
  }
  const exportArg = args.find(arg => arg.startsWith("--export="));
  if (exportArg) {
    const path = exportArg.slice("--export=".length);
    if (!path.endsWith(".html") || args.includes("--apply")) throw new Error("Dışa aktarım ayrı bir HTML işlemi olmalı.");
    await writeFile(resolve(path), libraryHtml(stories), { flag: "wx" });
    console.log("Okuma dosyası hazır. Firebase'e yazılmadı.");
    return;
  }
  if (args.includes("--check")) {
    console.log(`Doğrulandı: ${stories.length} hikâye, ${stories.reduce((n, s) => n + s.chapters.length, 0)} bölüm. Firebase'e bağlanılmadı.`);
    return;
  }
  if (args.includes("--verify") && !args.includes(`--confirm-project=spektrum-5c7cc`)) {
    throw new Error("Okunacak Firebase projesi doğrulanmalı.");
  }
  const apply = args.includes("--apply");
  if (apply && !args.includes("--confirm-author-consent")) throw new Error("Yazar atama izni açıkça onaylanmalı.");
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON güvenli Secrets alanında tanımlı değil. Firebase'e hiçbir kayıt yazılmadı.");
  let account;
  try { account = JSON.parse(credentialJson); }
  catch { throw new Error("Hizmet hesabı JSON biçimi geçersiz. Gizli değerler gösterilmedi."); }
  if (!account.project_id || !account.client_email || !account.private_key) throw new Error("Firebase hizmet hesabı gerekli alanları içermiyor.");
  const configuredProject = process.env.VITE_FIREBASE_PROJECT_ID;
  if (configuredProject && account.project_id !== configuredProject) {
    throw new Error("Hizmet hesabı uygulamanın Firebase projesine ait değil.");
  }
  if (apply && !args.includes(`--confirm-project=${account.project_id}`)) {
    throw new Error("Yazılacak Firebase projesi açıkça doğrulanmalı.");
  }
  const { initializeApp, cert, deleteApp } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ credential: cert(account), projectId: account.project_id }, "launch-library-operator");
  try {
    const db = getFirestore(app);
    if (args.includes("--verify")) {
      const result = await verifyLibrary(db, stories);
      console.log("Canlı içerik doğrulandı:", result);
      return;
    }
    const result = await seedLibrary(db, stories, {
      apply,
      fields: FieldValue,
      verifyAuthors: async uids => {
        const result = await getAuth(app).getUsers(uids.map(uid => ({ uid })));
        if (result.notFound.length || result.users.length !== 10 ||
            result.users.some(user => user.disabled || !user.providerData.length ||
              user.customClaims?.accountDeletionPending === true)) {
          throw new Error("10 etkin, kayıtlı Firebase hesabı doğrulanamadı. Anonim veya devre dışı hesaplara atama yapılmadı.");
        }
      },
    });
    console.log("Sonuç:", result.status);
    console.table(result.assignments.map(({ title, authorName, chapterCount }) => ({ title, authorName, chapterCount })));
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  // SDK errors can carry request details; expose only SDK code, not raw messages.
  console.error(error?.code
    ? `Firebase işlemi başarısız (${String(error.code)}). Kayıt sonucu doğrulanmadan başarılı sayılmamalı; güvenli yeniden deneme yapılabilir.`
    : error.message);
  process.exitCode = 1;
});
