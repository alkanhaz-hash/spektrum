import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
import { isShareableQuestion } from "../../../../lib/anonymous-qa/src/index.ts";

// Mock only the network adapter; execute the real card and URL code.
globalThis.__isShareableQuestion = isShareableQuestion;
async function loadShared(url) {
  const { code } = await transformWithEsbuild(await readFile(url, "utf8"), url.pathname, { loader: "ts", format: "cjs" });
  const dependencies = new Map();
  for (const [, name] of code.matchAll(/require\("(\.[^"]+)"\)/g)) {
    dependencies.set(name, await loadShared(new URL(`${name}.ts`, url)));
  }
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (!dependencies.has(name)) throw new Error(`Unexpected i18n dependency: ${name}`);
    return dependencies.get(name);
  }, module, module.exports);
  return module.exports;
}
globalThis.__qaTranslate = (await loadShared(new URL("../../../../lib/spektrum-i18n/src/index.ts", import.meta.url))).translate;
const source = (await readFile(new URL("./qa-sharing.ts", import.meta.url), "utf8"))
  .replace('import { isShareableQuestion } from "@workspace/anonymous-qa";',
    "const isShareableQuestion = globalThis.__isShareableQuestion;")
  .replace(/import \{ getPublicAnsweredQuestion[^}]*\} from "\.\/anonymous-qa";/,
    "const getPublicAnsweredQuestion = async () => globalThis.__publicQuestion;")
  .replace(/import \{ translate[^}]*\} from "@workspace\/spektrum-i18n";/,
    "const translate = globalThis.__qaTranslate;");
const transformed = await transformWithEsbuild(source, "qa-sharing.ts", { loader: "ts", format: "esm" });
const { questionInvitationUrl, createQuestionCard, shareQuestionCard } =
  await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);

let drawn = [], shared = [];
const question = {
  id: "question-fixture", targetUid: "profile-fixture", question: "Soru?",
  answer: "Güncel cevap", isAnswered: true, privacyVersion: 2,
};
beforeEach(() => {
  drawn = []; shared = [];
  globalThis.__publicQuestion = { ...question };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true, value: {
      canShare: () => true, share: async value => { shared.push(value); },
    },
  });
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({
      getContext: () => ({
        measureText: text => ({ width: text.length * 20 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {}, fillText: text => { drawn.push(text); },
      }),
      toBlob: callback => callback(new Blob(["fixture-png"], { type: "image/png" })),
    }),
  };
});

test("invitation links use the public deployment, with encoded profile ID", () => {
  assert.equal(questionInvitationUrl("a/b"), "https://spektrumapp.com.tr/ask/a%2Fb");
});

test("private/unanswered cards are refused", async () => {
  await assert.rejects(createQuestionCard({ ...question, isAnswered: false }, "Yazar"), /herkese açık/);
  assert.deepEqual(drawn, []);
});

test("deleted or recipient-mismatched questions cannot be shared", async () => {
  globalThis.__publicQuestion = null;
  await assert.rejects(shareQuestionCard(question, "Yazar"), /herkese açık değil/);
  globalThis.__publicQuestion = { ...question, targetUid: "another-profile" };
  await assert.rejects(shareQuestionCard(question, "Yazar"), /herkese açık değil/);
  assert.deepEqual(shared, []);
});

test("PNG uses the fresh public answer, brand and URL, never sender metadata", async () => {
  globalThis.__publicQuestion = { ...question, senderUid: "PRIVATE-SENDER", senderEmail: "PRIVATE-EMAIL" };
  await shareQuestionCard({ ...question, answer: "Eski cevap" }, "Yazar");
  assert.ok(drawn.includes("SPEKTRUM"));
  assert.ok(drawn.includes("Güncel cevap"));
  assert.ok(!drawn.includes("Eski cevap"));
  assert.ok(!drawn.join("").includes("PRIVATE-"));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].type, "image/png");
  assert.equal(shared[0].files[0].name, "spektrum-soru-cevap.png");
  assert.ok(drawn.join("").includes("spektrumapp.com.tr"));
});

test("English cards translate UI labels but preserve Turkish public content", async () => {
  await createQuestionCard(question, "Kitap Kurdu", "en");
  assert.ok(drawn.includes("ANONYMOUS QUESTION"));
  assert.ok(drawn.includes("ANSWER"));
  assert.ok(drawn.includes("Kitap Kurdu"));
  assert.ok(drawn.includes("Soru?"));
  assert.ok(drawn.includes("Güncel cevap"));
  assert.ok(!drawn.includes("ANONİM SORU"));
});
