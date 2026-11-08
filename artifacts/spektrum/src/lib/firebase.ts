import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Explicit per-browser DEV opt-in. Production builds cannot enable this mode.
// The demo project and loopback-only Vite proxies never touch customer data.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("__qa_emulator") === "1") {
  sessionStorage.setItem("spektrum.qa.emulator", "1");
}
export const qaEmulatorEnabled = import.meta.env.DEV && sessionStorage.getItem("spektrum.qa.emulator") === "1";
const firebaseConfig = qaEmulatorEnabled ? {
  apiKey: "demo-spektrum-qa-key",
  projectId: "demo-spektrum-qa",
  authDomain: "demo-spektrum-qa.firebaseapp.com",
  storageBucket: "demo-spektrum-qa.appspot.com",
  appId: "demo-spektrum-qa",
} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export function configureQaGuestApp(guestApp: FirebaseApp) {
  if (!qaEmulatorEnabled) return;
  const guestAuth = getAuth(guestApp);
  if (!guestAuth.emulatorConfig) {
    connectAuthEmulator(guestAuth, window.location.origin, { disableWarnings: true });
  }
  initializeFirestore(guestApp, {
    host: `${window.location.host}${import.meta.env.BASE_URL}__qa-firestore`,
    ssl: window.location.protocol === "https:",
    experimentalForceLongPolling: true,
  });
}
configureQaGuestApp(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
