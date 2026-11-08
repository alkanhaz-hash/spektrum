import { Router, type IRouter } from "express";
import { AccountDeletionBusyError, deleteAccountData } from "../lib/account-deletion";
import { verifyCallerUid } from "../lib/firebase-auth";

const router: IRouter = Router();

router.delete("/account", async (req, res): Promise<void> => {
  const uid = await verifyCallerUid(req.headers.authorization);
  if (!uid) {
    res.status(401).json({ error: "Geçersiz veya eksik ID token" });
    return;
  }

  try {
    const result = await deleteAccountData(uid);
    req.log.info({ uid, progress: result.progress }, "Hesap ve kullanıcı verileri silindi");
    res.json(result);
  } catch (err) {
    if (err instanceof AccountDeletionBusyError) {
      res.status(409).json({
        error: "Hesap silme işlemi zaten devam ediyor. Birkaç dakika sonra tekrar kontrol et.",
        retryable: true,
      });
      return;
    }
    req.log.error({ err, uid }, "Hesap silme işlemi tamamlanamadı");
    res.status(500).json({
      error: "Hesap silme işlemi tamamlanamadı. Verilerin güvende; tekrar deneyebilirsin.",
      retryable: true,
    });
  }
});

export default router;