import { getApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  collection, doc, getDocFromServer, getDocs, getFirestore, onSnapshot, query,
  serverTimestamp, updateDoc, where, writeBatch,
  type Firestore, type Timestamp,
} from "firebase/firestore";

export interface AnonymousQuestion {
  id: string;
  targetUid: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  privacyVersion: 2;
  createdAt?: Timestamp;
  answeredAt?: Timestamp;
}

export const QUESTION_MAX_LENGTH = 280;
export const ANSWER_MAX_LENGTH = 1000;

export function isShareableQuestion(q: AnonymousQuestion): boolean {
  return q.privacyVersion === 2 && q.isAnswered === true
    && !!q.targetUid && !q.targetUid.includes("/")
    && !!q.question.trim() && q.question.length <= QUESTION_MAX_LENGTH
    && typeof q.answer === "string" && !!q.answer.trim() && q.answer.length <= ANSWER_MAX_LENGTH;
}
export function publicQuestion(id: string, value: Record<string, unknown>): AnonymousQuestion {
  return {
    id, targetUid: String(value.targetUid ?? ""), question: String(value.question ?? ""),
    ...(typeof value.answer === "string" ? { answer: value.answer } : {}),
    isAnswered: value.isAnswered === true, privacyVersion: 2,
    ...(value.createdAt ? { createdAt: value.createdAt as Timestamp } : {}),
    ...(value.answeredAt ? { answeredAt: value.answeredAt as Timestamp } : {}),
  };
}

export function qaErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  if (code.includes("operation-not-allowed")) return "Misafir soru gönderimi henüz etkin değil. Firebase'de anonim oturum açma etkinleştirilmeli.";
  if (code.includes("permission-denied")) return "İşlem reddedildi. Sorular arasında en az 30 saniye bekle. Sorun sürerse hesap veya Firebase izinleri kontrol edilmeli.";
  if (code.includes("unavailable") || code.includes("network")) return "Bağlantı kurulamadı. İnternet bağlantını kontrol edip yeniden dene.";
  if (code.includes("failed-precondition")) return "Soru listesi için Firebase dizini henüz hazır değil. Lütfen daha sonra tekrar dene.";
  if (code.includes("too-many-requests")) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  return error instanceof Error ? error.message : "İşlem tamamlanamadı. Lütfen yeniden dene.";
}

export function createAnonymousQaService(
  app: FirebaseApp, db: Firestore, auth: Auth,
  moderate: (text: string) => Promise<void>,
  configureGuestApp?: (guestApp: FirebaseApp) => void,
) {
  const questions = (targetUid: string, answered: boolean) => query(
    collection(db, "anonymousQuestionsV2"),
    where("targetUid", "==", targetUid), where("isAnswered", "==", answered),
    where("privacyVersion", "==", 2),
  );
  const readList = async (targetUid: string, answered: boolean) => {
    const result = await getDocs(questions(targetUid, answered));
    return result.docs.map(d => publicQuestion(d.id, d.data())).sort((a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  };
  const listen = (targetUid: string, answered: boolean, cb: (items: AnonymousQuestion[]) => void, onError?: (error: Error) => void) =>
    onSnapshot(questions(targetUid, answered), snapshot => cb(snapshot.docs
      .map(d => publicQuestion(d.id, d.data()))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))),
    error => onError?.(new Error(qaErrorMessage(error))));

  async function sendAnonymousQuestion(targetUid: string, text: string, requestId?: string) {
    const question = text.trim();
    if (!question || question.length > QUESTION_MAX_LENGTH) throw new Error("Soru 1–280 karakter olmalı.");
    if (!targetUid || targetUid.includes("/")) throw new Error("Geçersiz soru bağlantısı.");
    await moderate(question);
    let writerDb = db;
    let sender = auth.currentUser;
    if (!sender) {
      // Separate Firebase Auth instance: guest submission must not change the app's login.
      let guestApp: FirebaseApp;
      try { guestApp = getApp("spektrum-qa-guest"); }
      catch { guestApp = initializeApp(app.options, "spektrum-qa-guest"); }
      configureGuestApp?.(guestApp);
      const guestAuth = getAuth(guestApp);
      await guestAuth.authStateReady();
      sender = guestAuth.currentUser ?? (await signInAnonymously(guestAuth)).user;
      writerDb = getFirestore(guestApp);
    }
    if (sender.uid === targetUid) throw new Error("Kendine anonim soru gönderemezsin.");
    const ref = requestId ? doc(writerDb, "anonymousQuestionsV2", requestId) : doc(collection(writerDb, "anonymousQuestionsV2"));
    const batch = writeBatch(writerDb);
    batch.set(ref, { targetUid, question, isAnswered: false, privacyVersion: 2, createdAt: serverTimestamp() });
    batch.set(doc(writerDb, "anonymousQuestionIdentities", ref.id), {
      senderUid: sender.uid, targetUid, createdAt: serverTimestamp(),
    });
    batch.set(doc(writerDb, "anonymousQuestionLimits", sender.uid), {
      lastSentAt: serverTimestamp(), lastQuestionId: ref.id,
    });
    await batch.commit();
    return ref.id;
  }

  async function answerQuestion(id: string, text: string) {
    const answer = text.trim();
    if (!answer || answer.length > ANSWER_MAX_LENGTH) throw new Error("Cevap 1–1000 karakter olmalı.");
    await moderate(answer);
    await updateDoc(doc(db, "anonymousQuestionsV2", id), { answer, isAnswered: true, answeredAt: serverTimestamp() });
  }

  async function deleteQuestion(id: string) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "anonymousQuestionsV2", id));
    batch.delete(doc(db, "anonymousQuestionIdentities", id));
    await batch.commit();
  }

  async function getPublicAnsweredQuestion(id: string) {
    const result = await getDocFromServer(doc(db, "anonymousQuestionsV2", id));
    if (!result.exists() || result.data().isAnswered !== true || result.data().privacyVersion !== 2) return null;
    const question = publicQuestion(result.id, result.data());
    return isShareableQuestion(question) ? question : null;
  }

  return {
    sendAnonymousQuestion, answerQuestion, deleteQuestion, getPublicAnsweredQuestion,
    getAnsweredQuestions: (uid: string) => readList(uid, true),
    getUnansweredQuestions: (uid: string) => readList(uid, false),
    listenAnsweredQuestions: (uid: string, cb: (q: AnonymousQuestion[]) => void, err?: (e: Error) => void) => listen(uid, true, cb, err),
    listenUnansweredQuestions: (uid: string, cb: (q: AnonymousQuestion[]) => void, err?: (e: Error) => void) => listen(uid, false, cb, err),
  };
}
