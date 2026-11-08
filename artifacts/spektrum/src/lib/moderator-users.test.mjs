import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

const profiles = Array.from({ length: 205 }, (_, i) => ({
  uid: `profile-${i}`, displayName: `Yazar ${String(i).padStart(3, "0")}`, avatarUrl: "", role: "user",
}));
async function compile(source, jsx = false) {
  const result = await transformWithEsbuild(source, jsx ? "fixture.tsx" : "fixture.ts", {
    loader: jsx ? "tsx" : "ts", format: "esm",
    jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`);
}

for (const [name, path] of [
  ["web", "./firestore-service.ts"],
  ["mobile", "../../../spektrum-mobile/lib/firestore-service.ts"],
]) {
  test(`${name}: directory includes users beyond the old 200-user cap`, async () => {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const fn = source.slice(source.indexOf("export async function getAllUsersForMod("),
      source.indexOf("export async function searchUsersForMod("));
    globalThis.__directoryDocs = profiles.map(p => ({ id: p.uid, data: () => ({ ...p, uid: "untrusted-field" }) }));
    const module = await compile(`const db = {}; const collection = (_, name) => {
      if (name !== "users") throw new Error("Wrong collection"); return name;
    }; const getDocs = async () => ({docs: globalThis.__directoryDocs}); ${fn}`);
    const result = await module.getAllUsersForMod();
    assert.equal(result.length, 205);
    assert.equal(result[204].uid, "profile-204");
    assert.ok(!result.some(p => p.uid === "untrusted-field"));
  });
}

// Exercise the real UsersTab markup/effect with isolated hooks and SDK adapter.
// This does not authenticate or modify any real Firebase account.
const page = await readFile(new URL("../pages/moderator.tsx", import.meta.url), "utf8");
const section = page.slice(page.indexOf("const ROLE_LABELS"), page.indexOf("// ─── Kullanıcı Askıya Alma"))
  .replace("function UsersTab(", "export function UsersTab(");
globalThis.__directoryReact = React;
const { UsersTab } = await compile(`
  const React = globalThis.__directoryReact;
  const useState = initial => globalThis.__directoryHooks.state(initial);
  const useEffect = callback => globalThis.__directoryHooks.effects.push(callback);
  const useToast = () => ({toast() {}});
  const getAllUsersForMod = () => globalThis.__directoryHooks.load();
  const setUserRole = async () => { throw new Error("Read-only test: role writes forbidden"); };
  const Skeleton = () => React.createElement("span", null, "Yükleniyor");
  const Search = () => null;
  const Link = ({href, children, ...props}) => React.createElement("a", {...props, href}, children);
  ${section}
`, true);

function fixture({ failure = false, users = profiles } = {}) {
  const hooks = {
    values: [], cursor: 0, effects: [], calls: 0,
    state(initial) {
      const i = this.cursor++;
      if (!(i in this.values)) this.values[i] = initial;
      return [this.values[i], value => { this.values[i] = typeof value === "function" ? value(this.values[i]) : value; }];
    },
    async load() { this.calls++; if (failure) throw new Error("denied"); return users; },
  };
  globalThis.__directoryReact = React;
  globalThis.__directoryHooks = hooks;
  return {
    hooks,
    render() { hooks.cursor = 0; return renderToStaticMarkup(React.createElement(UsersTab, { currentUid: "admin-fixture" })); },
    async mount() {
      this.render();
      hooks.effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
      return this.render();
    },
  };
}

test("opening the tab fetches users without typing and renders 50 with load-more", async () => {
  const f = fixture();
  const html = await f.mount();
  assert.equal(f.hooks.calls, 1);
  assert.equal((html.match(/Profili aç/g) ?? []).length, 50);
  assert.match(html, /Daha fazla göster \(155\)/);
  assert.match(html, /205 \/ 205 kullanıcı/);
});

test("search finds a user beyond the initially visible rows", async () => {
  const f = fixture(); await f.mount();
  f.hooks.values[0] = "Yazar 204";
  const html = f.render();
  assert.match(html, /Yazar 204/);
  assert.match(html, /\/profile\/profile-204/);
  assert.equal((html.match(/Profili aç/g) ?? []).length, 1);
});

test("load failure is explicit and retry remains available", async () => {
  const f = fixture({ failure: true });
  const html = await f.mount();
  assert.match(html, /role="alert"/);
  assert.match(html, /Kullanıcılar yüklenemedi/);
  assert.match(html, /Yenile/);
  assert.doesNotMatch(html, /Henüz kayıtlı kullanıcı yok/);
});

test("empty directory has a distinct empty state", async () => {
  const f = fixture({ users: [] });
  assert.match(await f.mount(), /Henüz kayıtlı kullanıcı yok/);
});

const firestoreService = await readFile(new URL("./firestore-service.ts", import.meta.url), "utf8");
const emailSearchSource = firestoreService.slice(
  firestoreService.indexOf("export async function findAdminUserByEmail("),
  firestoreService.indexOf("export interface PlatformStats"),
);

test("email lookup uses the signed-in user's token and returns only an exact email match", async () => {
  globalThis.__adminEmailFetchCalls = [];
  globalThis.__adminEmailFetch = async (url, options) => {
    globalThis.__adminEmailFetchCalls.push({ url, options });
    return {
      ok: true,
      json: async () => [
        { uid: "matched", displayName: "Matched", email: "reader@example.com", role: "user" },
        { uid: "wrong", displayName: "Wrong", email: "reader@example.net", role: "user" },
        { uid: "no-email", displayName: "No email", role: "user" },
      ],
    };
  };
  const module = await compile(`
    const auth = { currentUser: { getIdToken: async () => "fixture-admin-token" } };
    const fetch = (...args) => globalThis.__adminEmailFetch(...args);
    ${emailSearchSource}
  `);
  const result = await module.findAdminUserByEmail(" Reader@Example.com ");
  assert.equal(result.length, 1);
  assert.equal(result[0].uid, "matched");
  assert.equal(result[0].email, "reader@example.com");
  assert.equal(globalThis.__adminEmailFetchCalls[0].url, "/api/admin/users/search?q=reader%40example.com");
  assert.equal(globalThis.__adminEmailFetchCalls[0].options.headers.Authorization, "Bearer fixture-admin-token");
});

test("email lookup validates full addresses and refuses non-admin API responses", async () => {
  globalThis.__adminEmailFetchCalls = [];
  globalThis.__adminEmailFetch = async () => {
    globalThis.__adminEmailFetchCalls.push(true);
    return { ok: false, status: 403, json: async () => ({}) };
  };
  const module = await compile(`
    const auth = { currentUser: { getIdToken: async () => "fixture-token" } };
    const fetch = (...args) => globalThis.__adminEmailFetch(...args);
    ${emailSearchSource}
  `);
  await assert.rejects(module.findAdminUserByEmail("reader@"), /adresin tamamını yaz/);
  assert.equal(globalThis.__adminEmailFetchCalls.length, 0);
  await assert.rejects(module.findAdminUserByEmail("reader@example.com"), /yalnızca yetkili adminlere/);
});

test("web user directory opens only through the admin user-count card", async () => {
  assert.match(page, /onClick=\{\(\) => setUsersOpen\(true\)\}/);
  assert.match(page, /<Dialog open=\{usersOpen\} onOpenChange=\{setUsersOpen\}>/);
  assert.match(page, /\{usersOpen && isAdmin && user && <UsersTab/);
  assert.doesNotMatch(page, /tab === "users"|setTab\("users"\)/);
  assert.match(page, /İsim, kullanıcı kimliği veya tam e-posta ara/);
});
