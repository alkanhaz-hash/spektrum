/**
 * One-time privacy migration. Defaults to dry run; --apply is explicit.
 * Uses the configured Admin SDK, never logs question text or sender IDs.
 * Never deletes questions; keeps document IDs / answer links unchanged.
 */
import { FieldValue, FieldPath } from "firebase-admin/firestore";
import { adminDb } from "../lib/firebase-admin";

async function main() {
  const db = adminDb();
  const apply = process.argv.includes("--apply");
  let scanned = 0, migrated = 0, withoutIdentity = 0, skippedInvalid = 0, conflicts = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let q = db.collection("anonymousQuestions").orderBy(FieldPath.documentId()).limit(100);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    for (const item of page.docs) {
      scanned++;
      const data = item.data();
      if (data.qaMigrationComplete === true) continue;
      if (typeof data.targetUid !== "string" || typeof data.question !== "string"
          || !data.question.trim() || data.question.length > 280
          || (typeof data.answer === "string" && data.answer.length > 1000)
          || (data.isAnswered === true && (typeof data.answer !== "string" || !data.answer.trim()))) {
        skippedInvalid++; continue;
      }
      if (typeof data.senderUid !== "string" || !data.senderUid) withoutIdentity++;
      if (apply) {
        // Read again inside a transaction so a simultaneous answer isn't lost.
        const saved = await db.runTransaction(async transaction => {
          const latest = await transaction.get(item.ref);
          const publicRef = db.collection("anonymousQuestionsV2").doc(item.id);
          const alreadyMigrated = await transaction.get(publicRef);
          if (!latest.exists) return false;
          const current = latest.data()!;
          if (current.qaMigrationComplete === true) return false;
          if (alreadyMigrated.exists) { conflicts++; return false; }
          if (typeof current.targetUid !== "string" || typeof current.question !== "string"
              || !current.question.trim() || current.question.length > 280
              || (typeof current.answer === "string" && current.answer.length > 1000)
              || (current.isAnswered === true && (typeof current.answer !== "string" || !current.answer.trim()))) {
            skippedInvalid++; return false;
          }
          if (typeof current.senderUid === "string" && current.senderUid) {
            transaction.set(db.collection("anonymousQuestionIdentities").doc(item.id), {
              senderUid: current.senderUid, targetUid: current.targetUid,
              createdAt: current.createdAt ?? FieldValue.serverTimestamp(),
            });
          }
          transaction.set(publicRef, {
            targetUid: current.targetUid, question: current.question,
            isAnswered: current.isAnswered === true, privacyVersion: 2,
            createdAt: current.createdAt ?? FieldValue.serverTimestamp(),
            ...(typeof current.answer === "string" ? { answer: current.answer } : {}),
            ...(current.answeredAt ? { answeredAt: current.answeredAt } : {}),
          });
          // Keep the original for recovery, but remove its sender identifier.
          // The entire legacy collection is denied to all client readers.
          transaction.update(item.ref, {
            senderUid: FieldValue.delete(), qaMigrationComplete: true,
          });
          return true;
        });
        if (saved) migrated++;
      } else {
        migrated++;
      }
    }
    cursor = page.docs.at(-1);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned, migrated, withoutIdentity, skippedInvalid, conflicts }));
  if (skippedInvalid || conflicts) process.exitCode = 1;
}
main().catch(() => {
  console.error("Aktarım tamamlanamadı. Firebase Admin yapılandırmasını ve izinlerini kontrol edin; ayrıntılar kimlik sızdırmamak için yazdırılmadı.");
  process.exitCode = 1;
});
