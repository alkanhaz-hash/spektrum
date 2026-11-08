// node --test scripts/test-i18n.mjs
// Uses the real web/mobile locale providers and compiler, without Firebase.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const webRequire = createRequire(path.resolve("artifacts/spektrum/package.json"));
const mobileRequire = createRequire(path.resolve("artifacts/spektrum-mobile/package.json"));
const babel = mobileRequire("@babel/core");
const plugin = mobileRequire("../../lib/spektrum-i18n/babel.cjs");
const React = webRequire("react");
const { createRoot } = webRequire("react-dom/client");
const { JSDOM } = webRequire("jsdom");
const { act } = React;
const sharedCache = new Map();

function evaluate(source, filename, dependencies = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name === "@workspace/spektrum-i18n") return shared();
    if (name.startsWith("./")) return loadShared(path.resolve(path.dirname(filename), `${name}.ts`));
    return webRequire(name);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}
function loadShared(filename) {
  if (!sharedCache.has(filename)) sharedCache.set(filename, evaluate(readFileSync(filename, "utf8"), filename));
  return sharedCache.get(filename);
}
function shared() { return loadShared(path.resolve("lib/spektrum-i18n/src/index.ts")); }
function provider(kind, storage) {
  const filename = path.resolve(kind === "web" ? "artifacts/spektrum/src/contexts/LocaleContext.tsx" : "artifacts/spektrum-mobile/contexts/LocaleContext.tsx");
  return evaluate(readFileSync(filename, "utf8"), filename, { "@react-native-async-storage/async-storage": storage });
}
function compile(source, filename = path.resolve("artifacts/spektrum/src/pages/i18n-fixture.tsx")) {
  return babel.transformSync(source, { filename, configFile: false, babelrc: false, parserOpts: { plugins: ["typescript", "jsx"] }, plugins: [plugin] }).code;
}

test("shared copy: whitespace, templates, durations, errors and untouched user names", () => {
  const { translate: t, notificationSummary } = shared();
  assert.equal(t("tr", "Profil"), "Profil");
  assert.equal(t("en", "Profil"), "Profile");
  assert.equal(t("en", "  Hesap\n  Ayarları  "), "  Account settings  ");
  assert.equal(t("en", "2 saat önce"), "2 hours ago");
  assert.equal(t("en", "2dk önce"), "2 minutes ago");
  assert.equal(t("en", "1 dk 20 sn"), "1 min 20 s");
  assert.equal(t("en", "3. bölüm başlığı"), "Chapter 3 title");
  assert.equal(t("en", "Metin boş. Aktarılacak metni ekle."), "Text is empty. Add the text you want to import.");
  assert.equal(t("en", "Bir kullanıcının özgün hikaye metni"), "Bir kullanıcının özgün hikaye metni");
  assert.equal(t("en", "constructor"), "constructor");
  assert.equal(notificationSummary("en", "follow", "Kitap Kurdu"), "Kitap Kurdu started following you.");
  assert.equal(notificationSummary("tr", "follow", "Bookworm"), "Bookworm seni takip etmeye başladı.");
});

test("every screen compiles and all static UI copy has an English entry", () => {
  const missing = new Set();
  const unchanged = new Set([
    "SPEKTRUM", "SPEKTRUM •", "SPEKTRUM ·", "/ 200 KB", "bonus", "bonus)", "ID:",
    "👑 Admin", "Avatar", "Instagram", "🎵 TikTok", "📌 Pinterest", "👻 Snapchat",
    "Website", "A-", "A+", "U", "G", "A", "🛡️ Mod", "Oops!", "(Nickname)", "English",
  ]);
  let count = 0;
  for (const root of ["artifacts/spektrum/src/pages", "artifacts/spektrum/src/components", "artifacts/spektrum-mobile/app", "artifacts/spektrum-mobile/components"]) {
    for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith(".tsx") && !file.startsWith("ui/"))) {
      const filename = path.resolve(root, file);
      const code = compile(readFileSync(filename, "utf8"), filename);
      const tree = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(t|_uiText\d*)$/.test(node.expression.text)) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg) && /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(arg.text) && shared().translate("en", arg.text) === arg.text) {
            const text = arg.text.trim();
            if (!unchanged.has(text) && !/^(?:https?:\/\/|instagram\.com\/|tiktok\.com\/|pinterest\.com\/|snapchat\.com\/|[^ ]+@[^ ]+\.)/.test(text)) missing.add(arg.text);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
      count++;
    }
  }
  assert.ok(count >= 70);
  assert.deepEqual([...missing], []);
});

test("web and mobile defaults, opt-in, persistence and late-storage race", async () => {
  const dom = new JSDOM("<!doctype html><html><head></head><body><div id='root'></div></body></html>", { url: "https://test.invalid", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(dom.window.navigator, "language", { value: "en-US" });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.getElementById("root");
  const fixture = compile(`
    import React, { useState } from "react";
    const options = [{ id: "saved", label: "Kaydedilenler", onClick: () => {} }];
    export function Screen({ story, user, message, signedIn }) {
      const [draft, setDraft] = useState("Kullanıcı metni");
      return <main>
        <h1>Profil</h1><p>{signedIn ? "Hesap Ayarları" : "Giriş Yap"}</p>
        <input placeholder="E-posta" value={draft} onChange={e => setDraft(e.target.value)} />
        <div data-testid="story">{story.title}</div><div data-testid="bio">{user.bio}</div>
        <div data-testid="message">{message.text}</div>
        {options.map(option => <button data-id={option.id} key={option.id}>{option.label}</button>)}
        <div>{["Gizlilik", "Yardım"].map(label => <span key={label}>{label}</span>)}</div>
      </main>;
    }`);
  for (const kind of ["web", "mobile"]) {
    window.localStorage.clear();
    const saved = new Map();
    const storage = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => { saved.set(key, value); } };
    const context = provider(kind, storage);
    let control;
    function Probe() { control = context.useLocale(); return null; }
    const { Screen } = evaluate(fixture, "/fixture.tsx", { "@/contexts/LocaleContext": context });
    const props = { story: { title: "Profil" }, user: { bio: "Kaydedilenler" }, message: { text: "Hesap Ayarları" } };
    const tree = signedIn => React.createElement(context.LocaleProvider, null, React.createElement(Probe), React.createElement(Screen, { ...props, signedIn }));
    let root = createRoot(element);
    await act(async () => root.render(tree(false)));
    assert.equal(control.locale, "tr", `${kind}: English device must start in Turkish`);
    assert.equal(element.querySelector("h1").textContent, "Profil");
    const input = element.querySelector("input");
    await act(async () => { await control.setLocale("en"); });
    assert.equal(element.querySelector("h1").textContent, "Profile");
    assert.equal(element.querySelector("button").textContent, "Saved");
    assert.equal(element.querySelector("button").dataset.id, "saved");
    assert.equal(element.querySelector("[data-testid=story]").textContent, "Profil");
    assert.equal(element.querySelector("[data-testid=bio]").textContent, "Kaydedilenler");
    assert.equal(element.querySelector("[data-testid=message]").textContent, "Hesap Ayarları");
    assert.equal(element.querySelector("input"), input, "language changes must not remount forms");
    assert.equal(input.value, "Kullanıcı metni");
    await act(async () => root.render(tree(true)));
    assert.equal(element.querySelector("p").textContent, "Account settings");
    assert.equal(control.locale, "en", "session transition must not reset locale");
    await act(async () => root.unmount());
    root = createRoot(element);
    await act(async () => root.render(tree(true)));
    assert.equal(control.locale, "en", `${kind}: preference survives restart`);
    await act(async () => { await control.setLocale("tr"); });
    assert.equal(element.querySelector("h1").textContent, "Profil");
    await act(async () => root.unmount());
  }
  let finishRead;
  const context = provider("mobile", { getItem: () => new Promise(resolve => { finishRead = resolve; }), setItem: async () => {} });
  let control;
  function Probe() { control = context.useLocale(); return null; }
  const root = createRoot(element);
  await act(async () => root.render(React.createElement(context.LocaleProvider, null, React.createElement(Probe))));
  await act(async () => { await control.setLocale("en"); });
  await act(async () => finishRead("tr"));
  assert.equal(control.locale, "en", "a delayed storage read must not overwrite a fresh selection");
  await act(async () => root.unmount());
  dom.window.close();
});
