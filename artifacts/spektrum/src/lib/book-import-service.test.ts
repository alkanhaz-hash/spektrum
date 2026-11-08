import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const fake = vi.hoisted(() => ({
  documents: new Map<string, Record<string, any>>(),
  user: { uid: "writer" } as { uid: string } | null,
  failCompletion: false,
  loseAcknowledgement: false,
  chain: Promise.resolve(),
}));
vi.mock("./firebase", () => ({
  app: {},
  db: {},
  auth: { get currentUser() { return fake.user; } },
  configureQaGuestApp: () => {},
}));
vi.mock("firebase/firestore", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  serverTimestamp: () => "server-time",
  increment: (amount: number) => ({ delta: amount }),
  // Serialize fake transactions like Firestore retries conflicting snapshots.
  runTransaction: (_db: unknown, action: (transaction: any) => Promise<any>) => {
    const operation = fake.chain.then(async () => {
      const writes: { path: string; value: Record<string, any>; update: boolean }[] = [];
      const result = await action({
        get: async (path: string) => ({
          exists: () => fake.documents.has(path),
          data: () => fake.documents.get(path),
        }),
        set: (path: string, value: Record<string, any>) => writes.push({ path, value, update: false }),
        update: (path: string, value: Record<string, any>) => writes.push({ path, value, update: true }),
      });
      const completion = writes.some(write => write.path.startsWith("chapters/"));
      if (completion && fake.failCompletion) throw new Error("unavailable");
      for (const write of writes) {
        const existing = fake.documents.get(write.path) ?? {};
        const value = Object.fromEntries(Object.entries(write.value).map(([key, field]) =>
          [key, typeof field === "object" && field?.delta ? (existing[key] ?? 0) + field.delta : field]));
        fake.documents.set(write.path, write.update ? { ...existing, ...value } : value);
      }
      if (completion && fake.loseAcknowledgement) { fake.loseAcknowledgement = false; throw new Error("ack-lost"); }
      return result;
    });
    fake.chain = operation.then(() => undefined, () => undefined);
    return operation;
  },
}));
import { GENRES, importBookDraft } from "./firestore-service";
import { getImportFingerprint } from "./book-import";

const input = () => ({
  sourceText: "Bölüm 1\nBirinci bölüm.\nBölüm 2\nİkinci bölüm.",
  preview: {
    title: "Kitabım", summary: "Kitabımın açıklaması", genre: GENRES[0],
    chapters: [{ title: "İlk bölüm", content: "Birinci bölüm." }, { title: "İkinci bölüm", content: "İkinci bölüm." }],
  },
  ownershipConfirmed: true,
});
const list = (collection: string) => [...fake.documents.entries()].filter(([key]) => key.startsWith(`${collection}/`));
beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  fake.documents.clear();
  fake.documents.set("users/writer", { displayName: "Yazar", avatarUrl: "", storyCount: 3 });
  fake.user = { uid: "writer" };
  fake.failCompletion = false;
  fake.loseAcknowledgement = false;
  fake.chain = Promise.resolve();
});
describe("book import atomic retries", () => {
  it("requires ownership, session, valid preview and genre before writing", async () => {
    await expect(importBookDraft({ ...input(), ownershipConfirmed: false })).rejects.toThrow("onay");
    await expect(importBookDraft({ ...input(), preview: { ...input().preview, genre: "invalid" } })).rejects.toThrow("türü");
    fake.user = null;
    await expect(importBookDraft(input())).rejects.toThrow("giriş");
    expect(list("stories")).toHaveLength(0);
  });
  it("creates all sections as drafts in editor order and increments the author only once", async () => {
    const result = await importBookDraft(input());
    expect(result.alreadyImported).toBe(false);
    expect(list("stories")).toHaveLength(1);
    expect(list("stories")[0][1]).toMatchObject({ chapterCount: 2, status: "draft", importState: "complete", ownershipConfirmedAt: "server-time" });
    expect(list("chapters").map(([, chapter]) => [chapter.order, chapter.status, chapter.content])).toEqual([
      [1, "draft", "Birinci bölüm."], [2, "draft", "İkinci bölüm."],
    ]);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(4);
    expect(await importBookDraft(input())).toEqual({ ...result, alreadyImported: true });
    expect(list("chapters")).toHaveLength(2);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(4);
  });
  it("leaves only a resumable shell on failure, without partial chapters or counter changes", async () => {
    fake.failCompletion = true;
    await expect(importBookDraft(input())).rejects.toThrow("unavailable");
    expect(list("stories")[0][1]).toMatchObject({ chapterCount: 0, importState: "prepared", status: "draft" });
    expect(list("chapters")).toHaveLength(0);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(3);
    fake.failCompletion = false;
    await importBookDraft(input());
    expect(list("stories")).toHaveLength(1);
    expect(list("chapters")).toHaveLength(2);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(4);
  });
  it("handles lost success acknowledgement without duplicates or overwriting edited content", async () => {
    fake.loseAcknowledgement = true;
    await expect(importBookDraft(input())).rejects.toThrow("ack-lost");
    const [chapterId, chapter] = list("chapters")[0];
    fake.documents.set(chapterId, { ...chapter, content: "Yazar sonradan düzenledi", status: "published" });
    const retry = input();
    retry.preview.title = "Farklı başlık";
    retry.preview.chapters = [{ title: "Tek bölüm", content: "Değiştirilmiş önizleme" }];
    expect((await importBookDraft(retry)).alreadyImported).toBe(true);
    expect(list("stories")).toHaveLength(1);
    expect(list("chapters")).toHaveLength(2);
    expect(fake.documents.get(chapterId)?.content).toBe("Yazar sonradan düzenledi");
    expect(fake.documents.get("users/writer")?.storyCount).toBe(4);
  });
  it("deduplicates concurrent tabs", async () => {
    const results = await Promise.all([importBookDraft(input()), importBookDraft(input())]);
    expect(results[0].storyId).toBe(results[1].storyId);
    expect(results.map(result => result.alreadyImported).sort()).toEqual([false, true]);
    expect(list("stories")).toHaveLength(1);
    expect(list("chapters")).toHaveLength(2);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(4);
  });
  it("reopens completed legacy imports instead of creating another story", async () => {
    const fingerprint = await getImportFingerprint("writer", input().preview);
    const id = `import_${fingerprint}`;
    fake.documents.set(`stories/${id}`, {
      authorId: "writer", importFingerprint: fingerprint, importState: "complete", chapterCount: 2,
    });
    expect(await importBookDraft(input())).toEqual({ storyId: id, alreadyImported: true });
    expect(list("stories")).toHaveLength(1);
    expect(fake.documents.get("users/writer")?.storyCount).toBe(3);
  });
  it("refuses inactive or missing profiles and preserves modified prepared drafts", async () => {
    for (const field of ["banned", "accountDeletionPending", "accountFrozen"]) {
      fake.documents.set("users/writer", { [field]: true });
      await expect(importBookDraft(input())).rejects.toThrow("Hesabın");
    }
    fake.documents.delete("users/writer");
    await expect(importBookDraft(input())).rejects.toThrow("Hesabın");
    fake.documents.set("users/writer", { storyCount: 0 });
    fake.failCompletion = true;
    await expect(importBookDraft(input())).rejects.toThrow("unavailable");
    const [id, story] = list("stories")[0];
    fake.documents.set(id, { ...story, chapterCount: 1 });
    fake.failCompletion = false;
    await expect(importBookDraft(input())).rejects.toThrow("değiştirilmiş");
    expect(list("chapters")).toHaveLength(0);
  });
});
