// Only UI-generated templates are passed here. Captures (names, titles, etc.)
// are inserted unchanged; this is not a content translation service.
const patterns: [RegExp, string][] = [
  [/^Bana anonim soru sor\n([\s\S]*)$/, "Ask me an anonymous question\n$1"],
  [/^(.*?)’[ıi]n SPEKTRUM profilini keşfet([.:][\s\S]*)$/, "Discover $1's SPEKTRUM profile$2"],
  [/^(.*?) için anonim soru sor \| SPEKTRUM$/, "Ask $1 an anonymous question | SPEKTRUM"],
  [/^(\d+)\. bölümü yukarı taşı$/, "Move chapter $1 up"],
  [/^(\d+)\. bölümü aşağı taşı$/, "Move chapter $1 down"],
  [/^(\d+)\. bölüm başlığı$/, "Chapter $1 title"],
  [/^(\d+)\. bölüm metni$/, "Chapter $1 text"],
  [/^(\d+)\. bölüm başlığı 1–200 karakter olmalı\.$/, "Chapter $1 title must be 1–200 characters."],
  [/^(\d+)\. bölüm boş\. Metin ekle veya önceki bölümle birleştir\.$/, "Chapter $1 is empty. Add text or merge it with the previous chapter."],
  [/^(\d+)\. bölüm 200 KB sınırını aşıyor\. Bölümü ayır\.$/, "Chapter $1 exceeds 200 KB. Split it into smaller chapters."],
  [/^En fazla (\d+) bölüm olabilir\.$/, "You can have up to $1 chapters."],
  [/^Bağlantı kurulamadı \((.*?)\)\. Bağlantını kontrol et\.$/, "Could not connect ($1). Check your connection."],
  [/^(.*?) Önizlemen korunuyor; aynı kaynakla yeniden denemek kopya oluşturmaz\.$/s, "$1 Your preview is preserved; retrying the same source does not create duplicates."],
  [/^(.*?) adresine bakın\.$/, "Check $1."],
  [/^(.*?) moderatör yapıldı$/, "$1 is now a moderator"],
  [/^(.*?) rolü kaldırıldı$/, "$1's role was removed"],
  [/^(\d+) kullanıcı bulundu$/, "$1 users found"],
  [/^(\d+) \/ (\d+) kullanıcı$/, "$1 / $2 users"],
  [/^(.*?) askıya alındı$/, "$1 was suspended"],
  [/^(.*?) yasağı kaldırıldı$/, "$1 was unsuspended"],
  [/^(.*?) hesabı askıya alındı\.$/, "$1's account was suspended."],
  [/^(.*?) yazara bildirim gönderildi\.$/, "Notification sent to author $1."],
  [/^(.*?) kullanıcıyı görüntüle$/, "View $1 users"],
  [/^(.*?) engeli kaldırıldı$/, "$1 was unblocked"],
  [/^(.*?) adlı kullanıcının engelini kaldırmak istiyor musun\?$/, "Do you want to unblock $1?"],
  [/^(.*?) jeton hesabına eklendi\.$/, "$1 tokens were added to your account."],
  [/^(.*?) artık sana mesaj gönderebilir ve içeriklerini görebilirsin\.$/, "$1 can now message you, and you can see their content."],
  [/^(.*?) sana mesaj gönderemez ve içeriklerin bu kullanıcıdan gizlenir\.$/, "$1 cannot message you, and your content will be hidden from them."],
  [/^(.*?) hakkında şikayet göndermek istiyor musun\?$/, "Do you want to report $1?"],
  [/^Her (\d+) kelime = 1 jeton \(min\. (\d+) jeton\)$/, "Every $1 words = 1 token (minimum $2 tokens)"],
];

export function translateUiTemplate(source: string): string | undefined {
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(source)) return source.replace(pattern, replacement);
  }
  return undefined;
}
