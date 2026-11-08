import { isShareableQuestion } from "@workspace/anonymous-qa";
import { getPublicAnsweredQuestion, type AnonymousQuestion } from "./anonymous-qa";
import { translate, type Locale } from "@workspace/spektrum-i18n";

// Verified against published deployment metadata, not the workspace preview.
const PUBLIC_WEBSITE_ORIGIN = "https://spektrumapp.com.tr";

export function questionInvitationUrl(uid: string) {
  return new URL(`/ask/${encodeURIComponent(uid)}`, PUBLIC_WEBSITE_ORIGIN).href;
}

export async function shareQuestionInvitation(uid: string, name: string, locale: Locale = "tr") {
  const url = questionInvitationUrl(uid);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${name} — SPEKTRUM`, text: translate(locale, "Bana anonim soru sor"), url });
      return "Paylaşım açıldı.";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "";
    }
  }
  if (!navigator.clipboard) throw new Error("Bağlantıyı aşağıdaki kutudan seçip kopyalayabilirsin.");
  await navigator.clipboard.writeText(url);
  return "Soru bağlantısı kopyalandı.";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    // Character wrapping also handles long words/URLs and preserves all text.
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line.trimEnd()); line = char.trimStart();
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}

export async function createQuestionCard(q: AnonymousQuestion, name: string, locale: Locale = "tr"): Promise<Blob> {
  if (!isShareableQuestion(q)) throw new Error("Yalnızca cevaplanmış, herkese açık sorular paylaşılabilir.");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bu tarayıcı görsel oluşturmayı desteklemiyor.");
  await document.fonts?.ready;
  const width = 1080, padding = 72, contentWidth = width - padding * 2;
  ctx.font = "bold 48px sans-serif";
  const questionLines = wrap(ctx, q.question, contentWidth);
  ctx.font = "40px sans-serif";
  const answerLines = wrap(ctx, q.answer!, contentWidth);
  ctx.font = "bold 38px sans-serif";
  const nameLines = wrap(ctx, name, contentWidth);
  ctx.font = "24px sans-serif";
  const urlLines = wrap(ctx, questionInvitationUrl(q.targetUid), contentWidth);
  canvas.width = width;
  canvas.height = Math.max(1400, 650 + nameLines.length * 50 + questionLines.length * 66 + answerLines.length * 56 + urlLines.length * 30);
  const background = ctx.createLinearGradient(0, 0, width, canvas.height);
  background.addColorStop(0, "#171329"); background.addColorStop(1, "#352350");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#d6bbff"; ctx.font = "bold 36px sans-serif";
  ctx.fillText("SPEKTRUM", padding, 105);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 38px sans-serif";
  let y = 180;
  for (const line of nameLines) { ctx.fillText(line, padding, y); y += 50; }
  y += 40; ctx.fillStyle = "#d6bbff"; ctx.font = "bold 28px sans-serif";
  ctx.fillText(translate(locale, "ANONİM SORU"), padding, y);
  y += 65; ctx.fillStyle = "#ffffff"; ctx.font = "bold 48px sans-serif";
  for (const line of questionLines) { ctx.fillText(line, padding, y); y += 66; }
  y += 55; ctx.fillStyle = "#d6bbff"; ctx.font = "bold 28px sans-serif";
  ctx.fillText(translate(locale, "CEVAP"), padding, y);
  y += 60; ctx.fillStyle = "#ffffff"; ctx.font = "40px sans-serif";
  for (const line of answerLines) { ctx.fillText(line, padding, y); y += 56; }
  ctx.fillStyle = "#d6bbff"; ctx.font = "30px sans-serif";
  const footerY = canvas.height - 90 - urlLines.length * 30;
  ctx.fillText(translate(locale, "Sen de bana anonim soru sor"), padding, footerY);
  ctx.font = "24px sans-serif";
  for (const [index, line] of urlLines.entries()) {
    ctx.fillText(line, padding, footerY + 50 + index * 30);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Kart oluşturulamadı.")), "image/png"));
}

export async function shareQuestionCard(q: AnonymousQuestion, name: string, locale: Locale = "tr") {
  // A stale owner list must not export a deleted or no-longer-public answer.
  const current = await getPublicAnsweredQuestion(q.id);
  if (!current || current.targetUid !== q.targetUid) {
    throw new Error("Bu soru-cevap artık herkese açık değil; kart paylaşılamadı.");
  }
  const blob = await createQuestionCard(current, name, locale);
  const file = new File([blob], "spektrum-soru-cevap.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: `${name} — SPEKTRUM` }); return "Paylaşım açıldı."; }
    catch (error) { if ((error as Error).name === "AbortError") return ""; }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "PNG indirildi. Instagram veya Snapchat'te görseli seçip soru bağlantını ayrıca ekleyebilirsin.";
}
