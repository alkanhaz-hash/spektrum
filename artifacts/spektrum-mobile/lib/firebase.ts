import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  inMemoryPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Explicit browser-only DEV fixture. A production/native build cannot opt in.
if (__DEV__ && Platform.OS === "web" && new URLSearchParams(window.location.search).get("__qa_emulator") === "1") {
  sessionStorage.setItem("spektrum.mobile.qa.emulator", "1");
}
export const qaEmulatorEnabled = __DEV__ && Platform.OS === "web" && typeof sessionStorage !== "undefined"
  && sessionStorage.getItem("spektrum.mobile.qa.emulator") === "1";
const firebaseConfig = qaEmulatorEnabled ? {
  apiKey: "demo-spektrum-qa-key", projectId: "demo-spektrum-qa",
  authDomain: "demo-spektrum-qa.firebaseapp.com", storageBucket: "demo-spektrum-qa.appspot.com", appId: "demo-spektrum-qa",
} : {
  apiKey: "AIzaSyC4Do0gnzDX2fKnePcwjNu5DjWRw0_icDM",
  authDomain: "spektrum-5c7cc.firebaseapp.com",
  projectId: "spektrum-5c7cc",
  storageBucket: "spektrum-5c7cc.firebasestorage.app",
  messagingSenderId: "898562015762",
  appId: "1:898562015762:web:667eb1e607a3aeb2e40ecb",
};

let initError: string | null = null;
let app: any = null;
let authInstance: any = null;
let dbInstance: any = null;
let storageInstance: any = null;

// InitializeApp
if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  initError = "Firebase config eksik: projectId veya apiKey bos";
} else {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e: any) {
    initError = "initializeApp hatasi: " + (e?.message || String(e));
    app = null;
  }
}

// Auth
if (app && !initError) {
  try {
    authInstance = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch (e: any) {
    try {
      authInstance = getAuth(app);
    } catch (e2: any) {
      initError = "Auth init hatasi: " + (e2?.message || String(e2));
    }
  }
}

// Firestore
if (app && !initError) {
  try {
    if (qaEmulatorEnabled) connectAuthEmulator(authInstance, window.location.origin, { disableWarnings: true });
    dbInstance = qaEmulatorEnabled ? initializeFirestore(app, {
      host: `${window.location.host}/__qa-firestore`, ssl: window.location.protocol === "https:",
      experimentalForceLongPolling: true,
    }) : getFirestore(app);
  } catch (e: any) {
    initError = "Firestore init hatasi: " + (e?.message || String(e));
  }
}

// Storage
if (app && !initError) {
  try {
    storageInstance = getStorage(app);
  } catch (e: any) {
    initError = "Storage init hatasi: " + (e?.message || String(e));
  }
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;
export const firebaseReady = !!app && !initError;
export const firebaseInitError = initError;
