# Firebase Güvenlik Kuralları — Dağıtım

SPEKTRUM'un Firestore ve Storage güvenliği bu repodaki kural dosyalarıyla tanımlanır:

- `firestore.rules` — veritabanı erişim kuralları
- `storage.rules` — dosya yükleme kuralları
- `firebase.json` — Firebase CLI yapılandırması
- `.firebaserc` — proje (`spektrum-5c7cc`)

> **Önemli:** Bu kurallar Replit'ten otomatik dağıtılmaz. Aşağıdaki adımları
> kendi makinenizde bir kez çalıştırmanız gerekir. Kuralları yayınlamadan
> güvenlik **etkin olmaz**.

## Neden gerekli?

Görsel moderasyonu artık yüklemeden önce tarayıcıda (nsfwjs) çalışır ve sıfır
sunucu/AI maliyeti oluşturur. Ancak istemci tarafı her zaman bypass edilebilir;
gerçek koruma (yetki, sahiplik, "yalnızca moderatör yayınlar", yetki yükseltme
engeli) bu Firebase kurallarıyla zorunlu kılınır.

## Adımlar

1. Firebase CLI'yi kurun (bir kez):
   ```bash
   npm install -g firebase-tools
   ```

2. Giriş yapın (bir kez):
   ```bash
   firebase login
   ```

3. Bu klasöre geçip kuralları yayınlayın:
   ```bash
   cd artifacts/spektrum
   firebase deploy --only firestore:rules,storage
   ```

Çıktıda her iki kural setinin de başarıyla yayınlandığını görmelisiniz.

## Moderatör atama

Kurallar, hiçbir kullanıcının kendi `role` alanını değiştiremeyeceğini garanti
eder. Bir kullanıcıyı moderatör yapmak için Firebase Console → Firestore →
`users/{uid}` belgesinde `role` alanını `"moderator"` (veya `"admin"`) olarak
elle güncelleyin.

## Kural özeti

- **users**: profiller herkese açık okunur; kullanıcı yalnızca kendi profilini
  yazar ve **rolünü değiştiremez** (yetki yükseltme engeli).
- **stories**: yalnızca yazar düzenler/siler; diğer kullanıcılar yalnızca
  beğeni/yorum/okunma sayaçlarını güncelleyebilir.
- **chapters**: yalnızca hikaye sahibi (veya moderatör) oluşturur/düzenler/siler;
  diğer kullanıcılar yalnızca okunma sayacını artırabilir.
- **conversations / messages**: yalnızca konuşmanın katılımcıları okur; gönderen
  kendi adına mesaj yazar.
- **storage**: yüklemeler kimlik doğrulamalı, içerik tipi ve boyut sınırlı
  (görseller < 10 MB, ses < 100 MB); DM medyası ve hikaye kapakları yola gömülü
  sahip/katılımcı kontrolüyle izole edilir.
