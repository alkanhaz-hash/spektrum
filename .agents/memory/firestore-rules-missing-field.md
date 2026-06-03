---
name: Firestore rules & missing fields on legacy docs
description: Why direct field-equality checks in security rules silently break updates for legacy documents, and the safe pattern.
---

# Eksik alanlar Firestore kurallarını hataya düşürür

Bir `allow update` kuralında `resource.data.X == request.resource.data.X` gibi doğrudan
alan erişimi, **X alanı belgede yoksa** (eski/legacy belgeler) kural değerlendirmesini
hataya düşürür ve TÜM güncellemeyi reddeder — istemcide genel "kaydedilemedi" hatası
olarak görünür, gerçek sebep gizlenir.

**Why:** SPEKTRUM'da bir güvenlik görevi `users` update kuralına
`request.resource.data.role == resource.data.role` ekledi. `role` alanı eklenmeden önce
oluşturulmuş kullanıcı belgelerinde `role` yoktu → tüm profil güncellemeleri (avatar,
kapak, bio aynı updateDoc'ta) reddedildi. Kullanıcı "fotoğraf/bio kaydedilemiyor" diye
bildirdi; tek satırlık regresyondu.

**How to apply:**
- Yetki/değişmezlik (invariant) kontrolünde her zaman varsayılanlı erişim kullan:
  `request.resource.data.get('role','user') == resource.data.get('role','user')`.
  Bu hem eksik alanı tolere eder hem de yetki yükseltmeyi (user→moderator) engeller.
- Yeni zorunlu alan eklerken eski belgeleri istemci tarafında backfill et
  (`ensureUserProfile` her oturumda eksik alanları patch'liyor).
- İstemci catch bloklarında jenerik mesaj yerine `err.code` göster; rule-reddi
  (`permission-denied`) teşhisi anında belli olur.
