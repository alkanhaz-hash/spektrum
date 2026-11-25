---
name: Android fotoğraf erişimi
description: Google Play üretim başvurusunda fotoğraf izinlerinin neden dar tutulması gerektiği.
---
Android'de profil, kitap kapağı, durum ve mesaj için tekil görsel seçimi, geniş galeri erişimi gerektiren bir kullanım değildir. Sistem fotoğraf seçicisini koru; tüm galeriye erişim isteyen izinleri yeniden ekleme.

**Why:** Google Play'in 2026-11-25 üretim ön kontrolü geniş fotoğraf/video izinleri nedeniyle gönderimi engelledi. Test kanalında bulunması üretim politikası uygunluğunu garanti etmiyor.

**How to apply:** Yeni görsel özelliklerinde yalnızca kullanıcının seçtiği dosyaya eriş. Bağımlılıkların manifest üzerinden izin ekleyebileceğini hesaba kat; kaynak ayarı yanında üretilen Android manifestini de kontrol et. Bir kaynak düzeltmesi, daha önce yüklenmiş AAB dosyasını değiştirmez.
