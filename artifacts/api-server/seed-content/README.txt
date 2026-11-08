SPEKTRUM BAŞLANGIÇ KÜTÜPHANESİ

Bu klasördeki 10 Markdown dosyası bu proje için hazırlanmış özgün,
yapay zekâ destekli hikâyelerdir. README içerik yükleyiciye dahil edilmez.
10 hesabın tamamına yazar ataması için kullanıcı izin/yetki onayı verdi.
Bu onay erişim kimlik bilgisi değildir; canlı kayıt ayrıca Firebase yetkisi ister.

İçerik kapsamı:
- Her hikâyede en az 6, toplamda 66 bölüm.
- Erotizm, şiddet, intihar, uyuşturucu, sigara, alkol içeren anlatı yok.
- Sahte okunma, beğeni veya yorum eklenmez.
- Açıklamada yalnız hikâyenin özeti gösterilir; kullanıcının isteğiyle
  koleksiyon/izinli atama notu gösterilmez. Kaynak bilgisi yalnız özel
  işlem makbuzunda korunur, halka açık hikâye belgesine eklenmez.
- Hikâyeler yayınlanmış ve ücretsiz bölümlerle kaydedilir.
- Hikâyelerin durumu "published" kalır; "completed" yapılmaz.
  Böylece yazar hesabı web yazma editöründen devam edebilir.
- Mobilde mevcut okuma ekranları kullanılır. Ayrı mobil editör işi kapsam dışıdır.

ÇALIŞTIRMA (proje kökünden)

1. Çevrimdışı kontrol; Firebase erişimi veya yazma yok:
   node artifacts/api-server/scripts/seed-launch-stories.mjs --check

2. Birim testleri; sahte, bellekte veritabanı, canlı Firebase erişimi yok:
   node --test artifacts/api-server/scripts/launch-library.test.mjs

3. İsteğe bağlı çevrimdışı okuma dosyası:
   node artifacts/api-server/scripts/seed-launch-stories.mjs --export=/tmp/spektrum-hikayeler.html
   Var olan dosyanın üzerine yazmaz.

4. Canlı salt-okunur ön kontrol:
   node artifacts/api-server/scripts/seed-launch-stories.mjs

5. Ön kontrol başarılı olduktan sonra açık proje ve yazar onayıyla kayıt:
   node artifacts/api-server/scripts/seed-launch-stories.mjs --apply --confirm-author-consent --confirm-project=FIREBASE_PROJE_KIMLIGI

FIREBASE_SERVICE_ACCOUNT_JSON, mevcut Firebase projesine ait hizmet hesabı
JSON'u olarak yalnızca güvenli Secrets alanında tanımlanmalı. Sohbete,
klasöre veya Git'e konmamalı. Bir hesap şifresi istemez; hesaplara giriş yapmaz.

Hesap eşleştirme:
- Firestore "users" koleksiyonunda tam 10 profil bekler.
- Hepsi Firebase Auth'ta kayıtlı ve etkin olmalı; anonim oturum atanmaz.
- Dondurulmuş, engellenmiş, silinmekte olan veya eksik profil varsa durur.
- Profil belge kimliğine göre kararlı sıralamada, her hesaba bir hikâye atanır.
- Ön kontrol başlık / yazar görünen adı / bölüm sayısı eşleşmesini gösterir.
- Kayıt, users/stories/chapters alanları ve sahiplik ilişkileriyle uyumludur.
  Firebase kuralları gevşetilmez ve kullanıcıların rolleri değiştirilmez.
- Bu işlem, kullanıcının açıkça istediği başlangıç yayını içindir;
  genel kitap aktarım özelliğinin taslak/moderasyon akışını değiştirmez.

Tekrar deneme:
- 10 hikâye, 66 bölüm, 10 sayaç artışı ve özel tamamlanma makbuzu
  tek Firestore transaction içinde yazılır.
- İşlem bitmeden hata olursa hiçbir kısmı yazılmaz.
- Yanıt kaybolursa aynı komut yeniden çalıştırılabilir.
- Tamamlanma makbuzu bulunduğunda yazarların sonraki düzenlemeleri,
  eklediği bölümler veya sildiği hikâyeler yeniden oluşturulmaz/ezilmez.
- Kimlik çakışması ya da içerik dosyalarının sonradan değiştirilmesi
  sessizce üzerine yazmak yerine açık hata verir.
- Makbuz "privateSeedRuns" alanındadır; mevcut varsayılan kapalı
  Firestore kuralları altında yalnız güvenilir Admin SDK erişimi içindir.
- Canlı kayıt sonrası başlıklar, yazarlar, bölüm sayıları sunucudan okunarak
  doğrulanmalı; ana sayfa/keşfet ve yazarın web editöründe görünümü kontrol edilmeli.

DAĞITIM
Yalnız Firebase'e bu içerikleri yazmak için web yayımlama veya yeni APK
gerekmez. Mevcut web ve mobil okuyucular ortak Firestore verisini okur.
Bu kayıt araçları API'de herkese açık bir uç nokta oluşturmaz.
