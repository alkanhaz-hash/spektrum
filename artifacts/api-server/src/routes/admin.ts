import { Router } from "express";
import { adminAuth, adminDb } from "../lib/firebase-admin";
import { verifyCallerUid } from "../lib/firebase-auth";

const router = Router();

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

// ─── POST /api/admin/users/emails ────────────────────────────────────────────
// E-posta adresleri public Firestore profillerinde tutulmaz. Yalnızca admin,
// ekranda görüntülediği kullanıcılar için Auth'tan toplu olarak isteyebilir.
router.post("/users/emails", async (req, res) => {
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

    const requestedUids: unknown = (req.body as { uids?: unknown } | undefined)?.uids;
    if (
      !Array.isArray(requestedUids)
      || requestedUids.length > 100
      || requestedUids.some(uid => typeof uid !== "string" || uid.length < 1 || uid.length > 128)
    ) {
      res.status(400).json({ error: "En fazla 100 geçerli kullanıcı kimliği gönderilebilir." });
      return;
    }

    const uids = [...new Set(requestedUids as string[])];
    const emails: Record<string, string> = Object.fromEntries(uids.map(uid => [uid, ""]));
    if (uids.length > 0) {
      const result = await adminAuth().getUsers(uids.map(uid => ({ uid })));
      for (const user of result.users) {
        emails[user.uid] = user.email ?? "";
      }
    }

    res.json({ emails });
  } catch (err) {
    req.log.error({ err }, "Yönetici kullanıcı e-postaları alınamadı");
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
    if (q.length > 254) {
      res.status(400).json({ error: "Arama metni çok uzun." });
      return;
    }

    type RawUser = { uid: string; displayName?: string; avatarUrl?: string; role?: string; email?: string };

    if (q.includes("@")) {
      // Privacy: never put Auth email in public Firestore. Resolve exact address
      // through Firebase Auth only after the caller's admin role has been checked.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(q)) {
        res.json([]);
        return;
      }
      try {
        const authUser = await adminAuth().getUserByEmail(q);
        const fsDoc = await adminDb().doc(`users/${authUser.uid}`).get();
        if (!fsDoc.exists) {
          res.json([]);
          return;
        }
        const data = fsDoc.data() ?? {};
        res.json([{
          uid: authUser.uid,
          displayName: typeof data["displayName"] === "string" ? data["displayName"] : "",
          avatarUrl: typeof data["avatarUrl"] === "string" ? data["avatarUrl"] : "",
          role: typeof data["role"] === "string" ? data["role"] : "user",
          email: authUser.email ?? "",
        }]);
      } catch (err) {
        if ((err as { code?: string })?.code === "auth/user-not-found") {
          res.json([]);
          return;
        }
        throw err;
      }
      return;
    }

    // Name/UID search is metadata-only; omit email in every result.
    const snap = await adminDb().collection("users").limit(300).get();
    const matches = snap.docs
      .map(d => ({ ...d.data(), uid: d.id } as RawUser))
      .filter(u => (u.displayName ?? "").toLowerCase().includes(q) || u.uid.toLowerCase().includes(q))
      .slice(0, 20);
    const combined = matches.map(u => ({
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
