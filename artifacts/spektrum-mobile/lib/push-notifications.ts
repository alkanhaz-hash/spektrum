import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { setBaseUrl, setAuthTokenGetter, getPushDevice, registerPushDevice, disablePushDevice, testPushDevice, type PushPreferences } from "@workspace/api-client-react";
import { auth } from "./firebase";

export type { PushPreferences };
export const defaultPushPreferences: PushPreferences = { messages: true, newChapters: true, comments: true, qa: true };
type Choice = { enabled: boolean; preferences: PushPreferences };
export type PushSettings = Choice & { supported: boolean; reason: string; permissionGranted: boolean; canAskAgain: boolean };
const INSTALL = "spektrum.push.installation.v1", OWNER = "spektrum.push.owner.v1";
const key = (uid: string) => `spektrum.push.preferences.v1:${uid}`;
let installationPromise: Promise<{ installationId: string; revokeSecret: string; revision: number }> | undefined;
let chain: Promise<unknown> = Promise.resolve();
export function pushSupport() {
  if (Platform.OS !== "android") return { supported: false, reason: "Telefon bildirimleri bu sürümde Android uygulamasında kullanılabilir." };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return { supported: false, reason: "Push bildirimleri Expo Go’da çalışmaz. Güncel SPEKTRUM Android sürümünü kurmalısın." };
  if (!Device.isDevice) return { supported: false, reason: "Push bildirimlerini gerçek bir Android telefonda açabilirsin." };
  if (Application.applicationId !== "com.alkanhaz.spektrum") return { supported: false, reason: "Push bildirimleri mevcut Play Store SPEKTRUM uygulaması için yapılandırıldı. İkinci test paketi desteklenmiyor." };
  return { supported: true, reason: "" };
}
export const nativeNotifications = () => import("expo-notifications");
function configureApi() {
  const base = process.env.EXPO_PUBLIC_API_BASE?.trim();
  if (!base) throw new Error("Bildirim sunucusu yapılandırılmamış. Güncel Android sürümü gerekli.");
  setBaseUrl(base);
  setAuthTokenGetter(() => auth.currentUser?.getIdToken() ?? Promise.resolve(null));
}
async function request<T>(run: (options: RequestInit) => Promise<T>, anonymous = false) {
  configureApi();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try { return await run({ signal: controller.signal, ...(anonymous ? { headers: { Authorization: "" } } : {}) }); }
  catch (e) {
    const value = e as { name?: string; data?: { error?: string } };
    if (value.name === "AbortError") throw new Error("Bildirim sunucusu yanıt vermedi. Bağlantını kontrol edip yeniden dene.");
    throw new Error(value.data?.error || (e instanceof Error ? e.message : "Bildirim ayarı kaydedilemedi."));
  } finally { clearTimeout(timer); }
}
export function getInstallation() {
  if (!installationPromise) installationPromise = (async () => {
    const saved = await AsyncStorage.getItem(INSTALL);
    if (saved) {
      const d = JSON.parse(saved);
      if (/^[a-f0-9]{32}$/.test(d.installationId) && /^[a-f0-9]{64}$/.test(d.revokeSecret)) return { ...d, revision: d.revision ?? 0 };
      throw new Error("Cihaz bildirim kaydı okunamadı.");
    }
    const d = { installationId: Crypto.randomUUID().replace(/-/g, ""), revokeSecret: Crypto.randomUUID().replace(/-/g, "") + Crypto.randomUUID().replace(/-/g, ""), revision: 0 };
    await AsyncStorage.setItem(INSTALL, JSON.stringify(d)); return d;
  })().catch(e => { installationPromise = undefined; throw e; });
  return installationPromise;
}
async function nextInstallation() {
  const d = await getInstallation();
  d.revision = Math.max(Date.now(), d.revision + 1);
  await AsyncStorage.setItem(INSTALL, JSON.stringify(d));
  return { ...d };
}
async function choice(uid: string): Promise<Choice> {
  const saved = await AsyncStorage.getItem(key(uid));
  if (!saved) return { enabled: false, preferences: defaultPushPreferences };
  const d = JSON.parse(saved);
  return { enabled: d.enabled === true, preferences: { ...defaultPushPreferences, ...d.preferences } };
}
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.catch(() => {}).then(work); chain = next; return next;
}
async function revoke() {
  const installation = await nextInstallation();
  await request(options => disablePushDevice(installation, options), true);
  await AsyncStorage.removeItem(OWNER);
}
async function reconcile() {
  if (!pushSupport().supported) return;
  const user = auth.currentUser, previous = await AsyncStorage.getItem(OWNER);
  const selected = user ? await choice(user.uid) : null;
  if (previous && (previous !== user?.uid || !selected?.enabled)) {
    try { await (await nativeNotifications()).unregisterForNotificationsAsync(); } catch { /* server revocation still runs */ }
    await revoke();
  }
  if (!user || !selected?.enabled) return;
  const notifications = await nativeNotifications();
  const permission = await notifications.getPermissionsAsync();
  if (!permission.granted) { await revoke(); return; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deviceToken = await Promise.race([
    notifications.getDevicePushTokenAsync(),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Telefonun bildirim anahtarı alınamadı. İnternet ve Google Play hizmetlerini kontrol et.")), 15000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  const token = deviceToken.data;
  if (typeof token !== "string") throw new Error("Android bildirim anahtarı alınamadı.");
  const installation = await nextInstallation(), capturedUid = user.uid;
  const bearer = await user.getIdToken();
  // Persist before sending, so a lost HTTP response can still be revoked after logout.
  await AsyncStorage.setItem(OWNER, capturedUid);
  await request(options => registerPushDevice({
    ...installation, token, platform: "android", preferences: selected.preferences,
  }, { ...options, headers: { Authorization: `Bearer ${bearer}` } }));
  if (auth.currentUser?.uid !== capturedUid) await revoke();
}
export const syncPushRegistration = () => serial(reconcile);
export async function loadPushSettings(): Promise<PushSettings> {
  const support = pushSupport(), user = auth.currentUser;
  const selected = user ? await choice(user.uid) : { enabled: false, preferences: defaultPushPreferences };
  if (!support.supported) return { ...selected, ...support, permissionGranted: false, canAskAgain: false };
  if (!user) throw new Error("Bildirim ayarları için giriş yapmalısın.");
  const permission = await (await nativeNotifications()).getPermissionsAsync();
  const install = await getInstallation();
  const server = await request(options => getPushDevice({ installationId: install.installationId }, options));
  return { ...support, enabled: selected.enabled && server.enabled && permission.granted, preferences: server.registered ? server.preferences : selected.preferences,
    permissionGranted: permission.granted, canAskAgain: permission.canAskAgain };
}
export function savePushSettings(enabled: boolean, preferences: PushPreferences): Promise<PushSettings> {
  return serial(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Bildirim ayarları için giriş yapmalısın.");
    const support = pushSupport();
    if (!support.supported) throw new Error(support.reason);
    const before = await choice(user.uid), notifications = await nativeNotifications();
    if (enabled) {
      await notifications.setNotificationChannelAsync("spektrum-updates", { name: "SPEKTRUM güncellemeleri", importance: notifications.AndroidImportance.DEFAULT, lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE });
      let p = await notifications.getPermissionsAsync();
      if (!p.granted && p.canAskAgain) p = await notifications.requestPermissionsAsync();
      if (!p.granted) throw new Error("Bildirim izni verilmedi. Telefon ayarlarından SPEKTRUM bildirimlerini açabilirsin.");
    }
    await AsyncStorage.setItem(key(user.uid), JSON.stringify({ enabled, preferences }));
    try {
      if (!enabled) {
        try { await notifications.unregisterForNotificationsAsync(); } catch { /* still revoke remotely */ }
        await revoke();
      } else await reconcile();
    } catch (e) {
      // OFF remains OFF locally and its pending revocation is retried on foreground.
      if (enabled) await AsyncStorage.setItem(key(user.uid), JSON.stringify(before));
      throw e;
    }
    return loadPushSettings();
  });
}
export async function sendPushTest() {
  const state = await loadPushSettings();
  if (!state.enabled) throw new Error("Önce bu telefonda bildirimleri aç.");
  const installation = await getInstallation();
  await request(options => testPushDevice({ installationId: installation.installationId }, options));
}
// Logout must remain possible offline. Retained installation capability retries server revocation later.
export async function suspendPushForLogout() {
  if (!pushSupport().supported) return;
  await serial(async () => {
    try { await (await nativeNotifications()).unregisterForNotificationsAsync(); } catch { /* best effort */ }
    try { await revoke(); } catch { /* OWNER is retained for the next foreground */ }
  });
}
