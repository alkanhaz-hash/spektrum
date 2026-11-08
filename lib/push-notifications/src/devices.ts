import { createHash, timingSafeEqual } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

export const defaults = { messages: true, newChapters: true, comments: true, qa: true };
export type Preferences = typeof defaults;
export class PushError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function sameSecret(secret: string, stored: unknown): boolean {
  return typeof stored === "string" && stored.length === 64
    && timingSafeEqual(Buffer.from(hash(secret)), Buffer.from(stored));
}
export async function activeAccount(db: Firestore, uid: string) {
  const profile = await db.doc(`users/${uid}`).get();
  const p = profile.data();
  if (!p || p.banned || p.accountFrozen || p.accountDeletionPending) throw new PushError(403, "Bu hesap için bildirimler kullanılamıyor.");
}
export async function deviceState(db: Firestore, uid: string, installationId: string) {
  await activeAccount(db, uid);
  const d = (await db.doc(`pushDevices/${installationId}`).get()).data();
  const enabled = d?.uid === uid && d.expiresAt?.toMillis() > Date.now();
  return { registered: !!enabled, enabled: !!enabled, preferences: enabled ? d.preferences as Preferences : defaults };
}
export async function registerDevice(db: Firestore, uid: string, input: {
  installationId: string; revokeSecret: string; revision: number; token: string; platform: "android"; preferences: Preferences;
}) {
  await activeAccount(db, uid);
  const ref = db.doc(`pushDevices/${input.installationId}`);
  await db.runTransaction(async tx => {
    const [old, devices] = await Promise.all([
      tx.get(ref), tx.get(db.collection("pushDevices").where("uid", "==", uid).limit(21)),
    ]);
    if (old.exists && !sameSecret(input.revokeSecret, old.data()?.revokeHash)) throw new PushError(409, "Cihaz kaydı eşleşmiyor.");
    if ((old.data()?.revision ?? 0) > input.revision) throw new PushError(409, "Daha yeni cihaz ayarı var. Ayarları yenile.");
    if (old.data()?.revision === input.revision) {
      if (old.data()?.uid === uid && old.data()?.token === input.token
        && (Object.keys(defaults) as (keyof Preferences)[]).every(k => old.data()?.preferences?.[k] === input.preferences[k])) return;
      throw new PushError(409, "Bu cihaz isteği artık geçerli değil.");
    }
    if (!devices.docs.some(d => d.id === ref.id) && devices.size >= 20) throw new PushError(429, "En fazla 20 cihaz kullanılabilir.");
    tx.set(ref, {
      uid, token: input.token, revision: input.revision, platform: "android", preferences: input.preferences,
      revokeHash: hash(input.revokeSecret), updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400_000),
    });
  });
  return { registered: true, enabled: true, preferences: input.preferences };
}
export async function revokeDevice(db: Firestore, installationId: string, secret: string, revision: number) {
  const ref = db.doc(`pushDevices/${installationId}`);
  await db.runTransaction(async tx => {
    const d = await tx.get(ref);
    if ((!d.exists || sameSecret(secret, d.data()?.revokeHash)) && (d.data()?.revision ?? 0) < revision) {
      // Keep only a capability hash and fencing revision, not a token/account.
      // A delayed pre-logout registration cannot re-enable this installation.
      tx.set(ref, { revokeHash: hash(secret), revision, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000) });
    }
  });
  return { accepted: true };
}
