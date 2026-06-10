---
name: Firestore query vs rule mismatch
description: Firestore, collection query'de dönen tüm belgelerin güvenlik kuralını geçeceğini sorgu kısıtlarından anlayamazsa tüm sorguyu reddeder.
---

## Kural

Firestore güvenlik kuralı `allow read: if resource.data.X == 'Y'` ise, bu koleksiyona yapılan LIST sorgusu da `where("X", "==", "Y")` filtresi içermelidir. Aksi hâlde Firestore sorguyu doğrudan reddeder — client-side filter yeterli değildir.

**Why:** Firestore, query iznini değerlendirirken sorgunun döndürebileceği tüm belgeler için kuralın geçip geçmeyeceğini kontrol eder. Filtre yoksa kural garanti edilemez → permission-denied.

**How to apply:** `getChaptersByStory(publishedOnly=true)` gibi kısıtlı okumalar için sorguya Firestore tarafında da aynı filtre eklenmeli:
```ts
where("storyId", "==", storyId), where("status", "==", "published")
```
İki equality filtreli sorgu composite index gerektirmez; Firestore otomatik tek-alan index'leri kullanır.

**Gerçek hata:** Production'da tüm story sayfaları "Hikaye yüklenemedi" veriyordu. Geliştirme ortamında kurallar daha gevşek olduğundan fark edilmemişti.
