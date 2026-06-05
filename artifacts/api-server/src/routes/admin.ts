import { Router } from "express";

const router = Router();

// PATCH /api/admin/users/:uid/role
// Çağıranın Firebase ID token'ı Authorization: Bearer <token> başlığında gönderilmeli.
// Yalnızca admin rolündeki kullanıcılar diğer kullanıcıların rolünü değiştirebilir.
// Admin SDK yerine Firebase REST API kullanılır — servis hesabı gerekmez.
router.patch("/users/:uid/role", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Yetkilendirme başlığı eksik" });
    return;
  }
  const idToken = authHeader.slice(7);

  const { uid } = req.params;
  const { role } = req.body as { role?: string };

  if (!role || !["user", "moderator"].includes(role)) {
    res.status(400).json({ error: "Geçersiz rol. 'user' veya 'moderator' olmalı." });
    return;
  }

  const apiKey = process.env["VITE_FIREBASE_API_KEY"];
  const projectId = process.env["VITE_FIREBASE_PROJECT_ID"];

  if (!apiKey || !projectId) {
    req.log.error("VITE_FIREBASE_API_KEY veya VITE_FIREBASE_PROJECT_ID eksik");
    res.status(503).json({ error: "Sunucu yapılandırması eksik" });
    return;
  }

  try {
    // 1. ID token'ı doğrula ve çağıranın UID'sini al
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );

    if (!lookupRes.ok) {
      res.status(401).json({ error: "Firebase ID token geçersiz" });
      return;
    }

    const lookupData = await lookupRes.json() as { users?: { localId: string }[] };
    const callerUid = lookupData.users?.[0]?.localId;
    if (!callerUid) {
      res.status(401).json({ error: "Token doğrulanamadı" });
      return;
    }

    // 2. Çağıranın Firestore belgesinden rolünü oku
    const callerDocRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${callerUid}`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    );

    if (!callerDocRes.ok) {
      res.status(403).json({ error: "Kullanıcı bilgisi alınamadı" });
      return;
    }

    type FirestoreDoc = { fields?: { role?: { stringValue?: string } } };
    const callerDoc = await callerDocRes.json() as FirestoreDoc;
    const callerRole = callerDoc.fields?.role?.stringValue;

    if (callerRole !== "admin") {
      res.status(403).json({ error: "Bu işlem için admin yetkisi gerekli" });
      return;
    }

    // 3. Hedef kullanıcının rolünü güncelle (Firestore rules burada da devreye girer)
    const updateRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=role`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: { role: { stringValue: role } },
        }),
      },
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.json().catch(() => ({}));
      req.log.error({ errBody, uid, role }, "Firestore rol güncellemesi başarısız");
      res.status(500).json({ error: "Rol güncellenemedi" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Admin rol güncelleme hatası");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
