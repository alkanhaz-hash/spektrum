/**
 * Türkçe kural tabanlı yazım ve noktalama düzeltici.
 * Sıfır maliyet — saf TypeScript, AI yok.
 */

export interface CorrectionResult {
  corrected: string;
  changes: Change[];
}

export interface Change {
  rule: string;
  before: string;
  after: string;
}

// Yaygın Türkçe yazım hataları (küçük → doğru)
const TURKISH_SPELLING: [RegExp, string, string][] = [
  [/\bbirşey\b/gi, "bir şey", "Ayrı yazılır"],
  [/\bhiçbirşey\b/gi, "hiçbir şey", "Ayrı yazılır"],
  [/\bherşey\b/gi, "her şey", "Ayrı yazılır"],
  [/\bbiraz\b/gi, "biraz", "Doğru"],
  [/\bde ki\b/gi, "dedi ki", "Bağlaç hatası"],
  [/\bde(?=\s+[a-züışöçğ])/gi, "de", "Doğru"],
  [/\bki(?=\s)/gi, "ki", "Doğru"],
  [/\bsanki\b/gi, "sanki", "Doğru"],
  [/\böyleki\b/gi, "öyle ki", "Ayrı yazılır"],
  [/\bbahsetmek\b/gi, "bahsetmek", "Doğru"],
  [/\bnasilsa\b/gi, "nasılsa", "Yazım hatası"],
  [/\boyleyse\b/gi, "öyleyse", "Yazım hatası"],
];

function applySpellingFixes(text: string, changes: Change[]): string {
  let result = text;
  for (const [pattern, replacement, rule] of TURKISH_SPELLING) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (before !== result) {
      changes.push({ rule, before: pattern.source, after: replacement });
    }
  }
  return result;
}

function fixDoubleSpaces(text: string, changes: Change[]): string {
  const fixed = text.replace(/[ \t]{2,}/g, " ");
  if (fixed !== text) changes.push({ rule: "Çift boşluk temizlendi", before: "  ", after: " " });
  return fixed;
}

function fixSpaceBeforePunctuation(text: string, changes: Change[]): string {
  // "merhaba ," → "merhaba,"
  const fixed = text.replace(/\s+([,;:!?.])/g, "$1");
  if (fixed !== text) changes.push({ rule: "Noktalama öncesi boşluk kaldırıldı", before: " ,", after: "," });
  return fixed;
}

function fixSpaceAfterPunctuation(text: string, changes: Change[]): string {
  // "merhaba,dünya" → "merhaba, dünya"  (ama sayılar arasında virgül kalmalı: 1,5)
  const fixed = text.replace(/([,;:])([^\s\d"»\)\]\}])/g, "$1 $2");
  if (fixed !== text) changes.push({ rule: "Noktalama sonrasına boşluk eklendi", before: ",kelime", after: ", kelime" });
  return fixed;
}

function fixSpaceAfterSentenceEnd(text: string, changes: Change[]): string {
  // "bitti.Devam" → "bitti. Devam"
  const fixed = text.replace(/([.!?])([A-ZÜĞŞİÖÇa-züğşiöç])/g, "$1 $2");
  if (fixed !== text) changes.push({ rule: "Cümle sonu boşluk eklendi", before: ".Kelime", after: ". Kelime" });
  return fixed;
}

function fixMultiplePunctuation(text: string, changes: Change[]): string {
  // "!!!" → "!" ama "..." kalmalı
  const fixed = text
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/,{2,}/g, ",");
  if (fixed !== text) changes.push({ rule: "Tekrar eden noktalama işareti düzeltildi", before: "!!!", after: "!" });
  return fixed;
}

function fixSentenceCapitalization(text: string, changes: Change[]): string {
  // Paragraf başlarını büyüt
  const paragraphs = text.split(/\n+/);
  let changed = false;
  const fixed = paragraphs.map(para => {
    const trimmed = para.trimStart();
    if (!trimmed) return para;
    const firstChar = trimmed.charAt(0);
    const upper = firstChar.toLocaleUpperCase("tr-TR");
    if (firstChar !== upper) {
      changed = true;
      return para.replace(firstChar, upper);
    }
    return para;
  }).join("\n");

  // Cümle içi büyütme: ". kelime" → ". Kelime"
  const sentenceFixed = fixed.replace(
    /([.!?]\s+)([a-züğşiöç])/g,
    (_, punct, letter) => punct + letter.toLocaleUpperCase("tr-TR")
  );
  if (sentenceFixed !== fixed) changed = true;

  if (changed) changes.push({ rule: "Cümle başı büyük harf uygulandı", before: "küçük", after: "Büyük" });
  return sentenceFixed;
}

function fixQuotes(text: string, changes: Change[]): string {
  // Düz tırnakları Türkçe tırnağa çevir: "..." → "..."
  const fixed = text.replace(/"([^"]+)"/g, "\u201c$1\u201d");
  if (fixed !== text) changes.push({ rule: "Tırnak işaretleri düzeltildi", before: '"metin"', after: '"metin"' });
  return fixed;
}

function fixEllipsis(text: string, changes: Change[]): string {
  // "..." zaten doğru ama 4+ nokta düzelt
  const fixed = text.replace(/\.{4,}/g, "...");
  if (fixed !== text) changes.push({ rule: "Uzun nokta dizisi düzeltildi", before: "....", after: "..." });
  return fixed;
}

function fixTrailingSpaces(text: string, changes: Change[]): string {
  // Satır sonu boşlukları temizle
  const fixed = text.replace(/[ \t]+$/gm, "");
  if (fixed !== text) changes.push({ rule: "Satır sonu boşlukları temizlendi", before: "satır  \n", after: "satır\n" });
  return fixed;
}

function fixOpeningSpaces(text: string, changes: Change[]): string {
  // Cümle başındaki boşlukları temizle (girinti hariç çift boşluk)
  const fixed = text.replace(/^[ \t]+/gm, (match) => (match.includes("\t") ? match : ""));
  if (fixed !== text) changes.push({ rule: "Satır başı gereksiz boşluk kaldırıldı", before: "  metin", after: "metin" });
  return fixed;
}

/**
 * Ana düzeltici fonksiyon.
 * Tüm kuralları sırasıyla uygular ve ne değiştiğini raporlar.
 */
export function correctText(text: string): CorrectionResult {
  const changes: Change[] = [];
  let result = text;

  result = fixDoubleSpaces(result, changes);
  result = fixTrailingSpaces(result, changes);
  result = fixSpaceBeforePunctuation(result, changes);
  result = fixSpaceAfterPunctuation(result, changes);
  result = fixSpaceAfterSentenceEnd(result, changes);
  result = fixMultiplePunctuation(result, changes);
  result = fixEllipsis(result, changes);
  result = applySpellingFixes(result, changes);
  result = fixSentenceCapitalization(result, changes);
  result = fixQuotes(result, changes);
  result = fixOpeningSpaces(result, changes);

  // Benzersiz kuralları döndür
  const uniqueChanges = changes.filter((c, i, arr) => arr.findIndex(x => x.rule === c.rule) === i);

  return { corrected: result, changes: uniqueChanges };
}

/**
 * Kaç karakter değiştiğini hesaplar.
 */
export function countDiff(original: string, corrected: string): number {
  let diff = 0;
  const len = Math.max(original.length, corrected.length);
  for (let i = 0; i < len; i++) {
    if (original[i] !== corrected[i]) diff++;
  }
  return diff;
}
