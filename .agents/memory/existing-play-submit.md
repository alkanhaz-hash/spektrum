---
name: Mevcut Play uygulamasına gönderim
description: EAS submit sırasında doğru Android hedefinin ayrıca seçilmesi gerektiği.
---
EAS submit, seçilen build profilinin ortam değerlerini otomatik devralmaz. Mevcut Play uygulamasına gönderirken dinamik config'in hedef seçimini submit işlemine de sağla.

**Why:** Doğru uygulama için üretilmiş bir AAB'nin kimlik bilgisi araması, submit varsayılan config ile çalışırsa farklı paket kimliğine gidebilir.

**How to apply:** Submit öncesi çözümlenen paket kimliğini doğrula; build sırasında kullanılan mevcut Play hedefini submit ortamında da seç. Firebase servis hesabını Google Play gönderim anahtarı olarak varsayma.
