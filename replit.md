# SPEKTRUM

Futuristik Türkçe dijital hikaye anlatımı ve yazarlık platformu. Dark mode, neon mor/cyan estetik, Firebase backend, AI içerik moderasyonu, paragraf seviyesinde inline yorumlar, DM mesajlaşma ve yetenek keşfi.

## Run & Operate

- `pnpm --filter @workspace/spektrum run dev` — React frontend (port via $PORT)
- `pnpm --filter @workspace/api-server run dev` — API sunucusu (port 5000)
- `pnpm run typecheck` — tüm paketlerde TypeScript kontrolü
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI'dan hook ve Zod şemaları üret
- `pnpm --filter @workspace/db run push` — DB şema değişikliklerini push et (sadece dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- Backend: Firebase (Auth, Firestore, Storage) — serverless
- API: Express 5 (moderasyon + discover endpoint'leri)
- Animasyon: Framer Motion
- Routing: Wouter
- Form: React Hook Form + Zod
- API codegen: Orval (OpenAPI spec'ten)

## Where things live

- `artifacts/spektrum/` — React frontend uygulaması
  - `src/lib/firebase.ts` — Firebase init (VITE_ env vars)
  - `src/lib/auth-service.ts` — Firebase Auth işlemleri
  - `src/lib/firestore-service.ts` — Tüm Firestore CRUD + veri tipleri (kaynak of truth)
  - `src/lib/storage-service.ts` — Firebase Storage upload (WebP dönüşümü dahil)
  - `src/lib/moderation-service.ts` — Client-side moderasyon API çağrıları
  - `src/contexts/AuthContext.tsx` — Firebase auth state provider
  - `src/pages/` — 10 sayfa: home, auth, discover, story, read, write, chapter-editor, profile, messages, moderator
  - `src/components/layout/AppLayout.tsx` — Navbar + layout wrapper
- `artifacts/api-server/` — Express backend
  - `src/routes/moderation.ts` — Text + media moderasyon (regex tabanlı Türkçe/İngilizce NLP)
  - `src/routes/discover.ts` — Trending hikayeleri endpoint'i
- `lib/api-spec/` — OpenAPI spec + Orval codegen config

## Architecture decisions

- **Firebase-first, serverless**: Replit DB yerine Firebase kullanıldı. 100k kullanıcı ölçeklenebilirlik için serverless Firestore + Firebase Auth.
- **Dark mode varsayılan**: `main.tsx`'te `document.documentElement.classList.add("dark")` ile HTML'e `dark` class ekleniyor; Tailwind `.dark` varyantı devreye giriyor.
- **Moderasyon katmanlı**: Express backend regex/keyword tabanlı NLP filtresi; sonuç `approved | pending_review | rejected`. Yüksek risk kategorileri (child_safety, suicide) direkt reddediliyor.
- **Paragraf inline yorumlar**: Okuma sayfasında her paragraf tıklanabilir; `paragraphIndex` ile Firestore'a kaydedilir.
- **WebP dönüşümü**: Kapak görseli upload öncesi canvas API ile WebP'ye dönüştürülür.
- **Yetenek pazarı**: Hikaye başına çizer/tasarımcı portfolyosu `talent_portfolios` koleksiyonunda tutulur.

## Product

- **Keşfet**: Son 24 saatin trending hikayeleri (engagement score) + tür filtreleme
- **Okuyucu**: Paragraf başına inline yorum, font boyutu ayarı, bölüm navigasyonu
- **Yazar**: Hikaye oluştur, kapak yükle, bölüm yaz, AI moderasyon geçince yayınla
- **Mesajlaşma**: Real-time DM sistemi, emoji picker, resim/GIF gönderme (moderasyonlu)
- **Yetenek keşfi**: Her hikayede kapak tasarımı sunan çizer portfolyoları
- **Moderatör paneli**: Bekleyen bölümleri onayla/reddet

## Firebase Project

- Project ID: `spektrum-5c7cc`
- Storage bucket: `spektrum-5c7cc.firebasestorage.app`
- Auth providers: Email/şifre + Google

## User preferences

- Ajan iletişimi: SADECE Türkçe (kullanıcı İngilizce bilmiyor) — hiç İngilizce kullanma
- Türkçe UI dili
- Dark mode varsayılan (geçiş yok)
- Firebase backend (Replit DB değil)
- Önce web, mobil sonra
- AI moderasyon: cinsellik, şiddet, uyarıcı madde, intihar, silah, çocuk güvenliği

## Gotchas

- `getConversations()` fonksiyonu `async` olmayan — `onSnapshot` döndürür, `async` yaparsan `Promise<Unsubscribe>` olur ve cleanup çalışmaz.
- Chapter status tipi: `"published" | "pending_review" | "draft" | "rejected"` — `"approved"` diye bir değer yok, moderasyon `approved` döndürürse `published`'a map et.
- Vite proxy kullanma, shared proxy `/api` prefix'ini zaten yönlendiriyor.
- `pnpm run dev` workspace root'unda yok; artifact workflow'u kullan.

## Pointers

- `pnpm-workspace` skill — workspace yapısı, TypeScript kurulumu ve paket detayları
- OpenAPI spec: `lib/api-spec/openapi.yaml`
