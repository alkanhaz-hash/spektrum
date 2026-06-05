import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApps()[0]!;
    return _app;
  }

  const serviceAccountJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  const projectId = process.env["VITE_FIREBASE_PROJECT_ID"];

  if (serviceAccountJson) {
    // Tam servis hesabı JSON — üretim ortamı
    try {
      const parsed: object = JSON.parse(
        Buffer.isBuffer(serviceAccountJson)
          ? (serviceAccountJson as unknown as Buffer).toString()
          : serviceAccountJson,
      );
      _app = initializeApp({ credential: cert(parsed as Parameters<typeof cert>[0]) });
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON geçerli JSON değil. " +
        "Firebase Console > Proje Ayarları > Hizmet Hesapları > Yeni Anahtar Oluştur.",
      );
    }
  } else if (projectId) {
    // Yalnızca proje ID'si ile başlat (token doğrulama çalışır ama Firestore Admin erişimi sınırlı)
    // Not: Firestore yazmaları için FIREBASE_SERVICE_ACCOUNT_JSON gereklidir.
    _app = initializeApp({ projectId });
  } else {
    throw new Error(
      "Firebase Admin başlatılamadı: FIREBASE_SERVICE_ACCOUNT_JSON veya VITE_FIREBASE_PROJECT_ID eksik.",
    );
  }

  return _app;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}
