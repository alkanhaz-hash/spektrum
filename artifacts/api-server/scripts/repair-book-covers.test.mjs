import test from "node:test";
import assert from "node:assert/strict";
import { coverChanges, assertCoverUnchanged } from "./repair-book-covers.mjs";

const plan = { title: "Kitap", authorId: "authorized-owner", oldUrl: "old-cover", oldStoragePath: null };
const current = { title: "Kitap", authorId: "authorized-owner", coverUrl: "old-cover", summary: "Yazarın metni", readCount: 25 };

test("only image fields are writable; manuscripts, counts and authors are excluded", () => {
  assert.deepEqual(coverChanges({ url: "new-cover", path: "new-path", title: "other" }), {
    coverUrl: "new-cover", coverStoragePath: "new-path",
  });
});

test("legacy covers without a storage-path field and concurrent text/counter changes are allowed", () => {
  assert.doesNotThrow(() => assertCoverUnchanged(current, plan));
  assert.doesNotThrow(() => assertCoverUnchanged({ ...current, summary: "Yeni metin", readCount: 30 }, plan));
});

test("deleted books, ownership changes and author-replaced covers stop the repair", () => {
  for (const changed of [
    undefined, { ...current, authorId: "someone-else" },
    { ...current, coverUrl: "author-cover" }, { ...current, title: "Yeni başlık" },
    { ...current, coverStoragePath: "author-path" },
  ]) assert.throws(() => assertCoverUnchanged(changed, plan), /korumak/);
});
