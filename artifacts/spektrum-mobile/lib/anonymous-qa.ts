import { createAnonymousQaService } from "@workspace/anonymous-qa";
import { firebaseApp, auth, db } from "./firebase";
import { moderateText } from "./moderation-service";

export { qaErrorMessage, QUESTION_MAX_LENGTH, ANSWER_MAX_LENGTH } from "@workspace/anonymous-qa";
export type { AnonymousQuestion } from "@workspace/anonymous-qa";
const service = createAnonymousQaService(firebaseApp, db, auth, async text => {
  const result = await moderateText(text);
  if (result.action === "rejected") throw new Error("Uygunsuz içerik nedeniyle gönderilemedi.");
});
export const {
  sendAnonymousQuestion, answerQuestion, deleteQuestion, getPublicAnsweredQuestion,
  getAnsweredQuestions, getUnansweredQuestions, listenAnsweredQuestions, listenUnansweredQuestions,
} = service;
