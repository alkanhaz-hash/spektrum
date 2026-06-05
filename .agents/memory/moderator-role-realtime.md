---
name: Moderator role real-time profile
description: Why getDoc in AuthContext missed role changes and the onSnapshot fix pattern.
---

# Canlı profil aboneliği ile rol değişikliklerini yakalamak

## Sorun
AuthContext oturum açılışında `getDoc` ile profili bir kez yüklüyordu. Firebase
konsolundan `role: "moderator"` yazılınca uygulama bunu almıyordu — kişi
çıkış yapıp tekrar giriş yapmadan "Panel" linki görünmüyordu.

## Çözüm
`ensureUserProfile` ilk girişte (backfill için) bir kez çalışır, ardından
`onSnapshot(doc(db, "users", uid), ...)` ile canlı abonelik başlar.
Konsoldan veya başka bir admin işlemiyle rol değiştirilince React state
anında güncellenir.

**Why:** `getDoc` snapshot'ı tek seferlik okur. Firestore console değişikliği
gerçek zamanlı ama uygulama state'i eskide kalır. `onSnapshot` sunucu
değişikliklerini otomatik push eder; kullanıcı deneyimi sorunsuzlaşır.

**How to apply:**
- Auth-bağlı, sık değişebilen kullanıcı verisi (rol, rozet, sayaç) için
  `getDoc` değil `onSnapshot` tercih et.
- Cleanup fonksiyonunu `useEffect` return'ünde çağır (bellek sızıntısı).
- `ensureUserProfile` (backfill) sadece auth değişikliğinde bir kez,
  snapshot listener ise ayrı bir effect'te uid'e bağlı çalışır.
