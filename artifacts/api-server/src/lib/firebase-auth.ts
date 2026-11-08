import { adminAuth } from "./firebase-admin";

export async function verifyCallerUid(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const decoded = await adminAuth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}