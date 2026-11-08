import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { fanout, deliver, type Job } from "./delivery";

initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 5, concurrency: 20, timeoutSeconds: 300 });
const db = getFirestore();
// Event-driven functions continue independently of the mobile app and the web/API host.
export const pushMessage = onDocumentCreated({ document: "messages/{id}", retry: true }, async e => {
  if (e.data) await fanout(db, "messages", e.params.id, Date.parse(e.time));
});
export const pushComment = onDocumentCreated({ document: "inlineComments/{id}", retry: true }, async e => {
  if (e.data) await fanout(db, "inlineComments", e.params.id, Date.parse(e.time));
});
export const pushChapter = onDocumentWritten({ document: "chapters/{id}", retry: true }, async e => {
  if (e.data?.after.data()?.status === "published" && e.data.before.data()?.status !== "published") {
    await fanout(db, "chapters", e.params.id, Date.parse(e.time));
  }
});
export const pushQuestion = onDocumentWritten({ document: "anonymousQuestionsV2/{id}", retry: true }, async e => {
  const after = e.data?.after.data(), before = e.data?.before.data();
  if (!before && after?.privacyVersion === 2 && after.isAnswered === false) {
    await fanout(db, "anonymousQuestionsV2", e.params.id, Date.parse(e.time));
  } else if (before?.isAnswered === false && after?.isAnswered === true) {
    await fanout(db, "anonymousQuestionsV2", e.params.id, Date.parse(e.time), true);
  }
});
export const sendQueuedPush = onDocumentCreated({ document: "pushQueue/{id}", retry: true }, async e => {
  if (e.data) await deliver(db, getMessaging(), e.params.id, e.data.data() as Job);
});
