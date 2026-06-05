import { Router } from "express";
import { adminAuth, adminDb } from "../lib/firebase-admin";

const router = Router();

// ─── Yardımcı: çağıranın UID'sini token'dan doğrula ──────────────────────────

async function verifyCallerUid(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

// ─── Yardımcı: Firestore'dan rol oku ─────────────────────────────────────────

async function getUserRole(uid: string): Promise<string | null> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  return (snap.data()?.role as string | undefined) ?? "user";
}

// ─── PATCH /api/admin/users/:uid/role ────────────────────────────────────────
// Yalnızca admin rolündeki kullanıcılar başka kullanıcıların rolünü değiştirebilir.
// Firebase Admin SDK ile rules bypass — Firestore kurallarından bağımsız.

router.patch("/users/:uid/role", async (req, res) => {
  const callerUid = await verifyCallerUid(req.headers.authorization);
  if (!callerUid) {
    res.status(401).json({ error: "Geçersiz veya eksik ID token" });
    return;
  }

  const { uid } = req.params;
  const { role } = req.body as { role?: string };

  if (!role || !["user", "moderator"].includes(role)) {
    res.status(400).json({ error: "Geçersiz rol. 'user' veya 'moderator' olmalı." });
    return;
  }

  // Kendi kendini değiştirme yasak
  if (callerUid === uid) {
    res.status(403).json({ error: "Kendi rolünü değiştiremezsin." });
    return;
  }

  try {
    // Çağıranın rolünü doğrula
    const callerRole = await getUserRole(callerUid);
    if (callerRole !== "admin") {
      res.status(403).json({ error: "Bu işlem için admin yetkisi gerekli." });
      return;
    }

    // Hedef kullanıcının admin olup olmadığını kontrol et (admin düşürülemez)
    const targetRole = await getUserRole(uid);
    if (targetRole === "admin") {
      res.status(403).json({ error: "Admin rolündeki kullanıcı değiştirilemez." });
      return;
    }

    // Admin SDK ile rol güncelle (Firestore rules'ı bypass eder)
    await adminDb().doc(`users/${uid}`).update({ role });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Admin rol güncelleme hatası");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─── GET /api/admin/users/search?q=<term> ────────────────────────────────────
// displayName + e-posta araması. Admin SDK Auth + Firestore birleştirir.

router.get("/users/search", async (req, res) => {
  const callerUid = await verifyCallerUid(req.headers.authorization);
  if (!callerUid) {
    res.status(401).json({ error: "Geçersiz veya eksik ID token" });
    return;
  }

  try {
    const callerRole = await getUserRole(callerUid);
    if (callerRole !== "admin") {
      res.status(403).json({ error: "Bu işlem için admin yetkisi gerekli." });
      return;
    }

    const q = String(req.query["q"] ?? "").trim().toLowerCase();
    if (!q || q.length < 2) {
      res.json([]);
      return;
    }

    type RawUser = { uid: string; displayName?: string; avatarUrl?: string; role?: string; [k: string]: unknown };

    // Firestore'da displayName araması (istemci taraflı filtre)
    const snap = await adminDb().collection("users").limit(300).get();
    const byName: RawUser[] = snap.docs
      .map(d => {
        const data = d.data() as Omit<RawUser, "uid">;
        const row: RawUser = { uid: d.id, ...data };
        return row;
      })
      .filter(u => {
        const name = (u.displayName ?? "").toLowerCase();
        return name.includes(q) || u.uid.toLowerCase().includes(q);
      });

    // E-posta ile Firebase Auth araması
    let byEmail: RawUser[] = [];
    if (q.includes("@")) {
      try {
        const authUser = await adminAuth().getUserByEmail(q);
        const fsDoc = await adminDb().doc(`users/${authUser.uid}`).get();
        if (fsDoc.exists) {
          const exists = byName.some(u => u.uid === authUser.uid);
          if (!exists) {
            byEmail = [{ uid: authUser.uid, ...(fsDoc.data() as Omit<RawUser, "uid">) }];
          }
        }
      } catch {
        // Kullanıcı bulunamadı — normal, yoksay
      }
    }

    const combined = [...byEmail, ...byName].slice(0, 20).map(u => ({
      uid: u.uid,
      displayName: u.displayName ?? "",
      avatarUrl: u.avatarUrl ?? "",
      role: u.role ?? "user",
    }));

    res.json(combined);
  } catch (err) {
    req.log.error({ err }, "Kullanıcı arama hatası");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
