// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonymousQuestion } from "@workspace/anonymous-qa";

vi.mock("./anonymous-qa", () => ({ getPublicAnsweredQuestion: vi.fn() }));
import { getPublicAnsweredQuestion } from "./anonymous-qa";
import { createQuestionCard, questionInvitationUrl, shareQuestionCard, shareQuestionInvitation } from "./qa-sharing";

const q: AnonymousQuestion = { id: "q", targetUid: "writer", question: "Soru", answer: "Cevap", isAnswered: true, privacyVersion: 2 };
let drawn: { text: string; y: number }[];
let canvas: HTMLCanvasElement;
let clipboard: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  drawn = [];
  clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
  vi.mocked(getPublicAnsweredQuestion).mockResolvedValue(q);
  const ctx = {
    font: "", fillStyle: "",
    measureText: (text: string) => ({ width: Array.from(text).length * 25 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    fillText: (text: string, _x: number, y: number) => drawn.push({ text, y }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    canvas = this;
    return ctx as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(new Blob(["png"], { type: "image/png" })));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:card") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("public Q&A sharing", () => {
  it("always invites guests to the published ask route, encoding the UID", () => {
    expect(questionInvitationUrl("name/with space")).toBe("https://spektrumapp.com.tr/ask/name%2Fwith%20space");
  });
  it("copies the public link when native sharing is unavailable", async () => {
    await shareQuestionInvitation("writer", "Yazar");
    expect(clipboard).toHaveBeenCalledWith("https://spektrumapp.com.tr/ask/writer");
  });
  it("uses the selected language for invitation copy and preserves the author name", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    await shareQuestionInvitation("writer", "Kitap Kurdu", "en");
    expect(share).toHaveBeenCalledWith({
      title: "Kitap Kurdu — SPEKTRUM",
      text: "Ask me an anonymous question",
      url: "https://spektrumapp.com.tr/ask/writer",
    });
  });
  it("cancellation never copies or downloads unexpectedly", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
    expect(await shareQuestionInvitation("writer", "Yazar")).toBe("");
    expect(clipboard).not.toHaveBeenCalled();
  });
  it("refuses private, empty and legacy cards", async () => {
    for (const invalid of [{ ...q, isAnswered: false }, { ...q, answer: "" }, { ...q, privacyVersion: 1 }]) {
      await expect(createQuestionCard(invalid as AnonymousQuestion, "Yazar")).rejects.toThrow();
    }
    expect(drawn).toHaveLength(0);
  });
  it("renders only public text, never extra sender metadata, with an unclipped footer", async () => {
    await createQuestionCard({ ...q, question: "x".repeat(280), answer: "a\n".repeat(499), senderUid: "SECRET_SENDER" } as AnonymousQuestion, "Uzun yazar adı");
    expect(drawn.map(d => d.text).join("")).not.toContain("SECRET_SENDER");
    expect(drawn.some(d => d.text === "SPEKTRUM")).toBe(true);
    expect(drawn.every(d => d.y > 0 && d.y < canvas.height)).toBe(true);
    const footer = drawn.find(d => d.text === "Sen de bana anonim soru sor")!;
    expect(footer.y).toBeGreaterThan(drawn[drawn.indexOf(footer) - 1].y);
  });
  it("refetches before exporting and refuses a removed answer", async () => {
    vi.mocked(getPublicAnsweredQuestion).mockResolvedValue(null);
    await expect(shareQuestionCard(q, "Yazar")).rejects.toThrow(/herkese açık/);
    expect(drawn).toHaveLength(0);
    expect(click).not.toHaveBeenCalled();
  });
  it("uses the current public answer and downloads a PNG fallback", async () => {
    vi.mocked(getPublicAnsweredQuestion).mockResolvedValue({ ...q, answer: "Güncel cevap" });
    expect(await shareQuestionCard(q, "Yazar")).toContain("PNG indirildi");
    expect(drawn.some(d => d.text === "Güncel cevap")).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
  it("passes only the PNG to the operating system share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    await shareQuestionCard(q, "Yazar");
    expect(share.mock.calls[0][0].files[0].type).toBe("image/png");
    expect(Object.keys(share.mock.calls[0][0]).sort()).toEqual(["files", "title"]);
    expect(click).not.toHaveBeenCalled();
  });
});
