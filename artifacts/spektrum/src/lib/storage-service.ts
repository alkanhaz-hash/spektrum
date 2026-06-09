import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Converts any image file to WebP using canvas API.
 * Falls back to original file if browser doesn't support it.
 */
async function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => { URL.revokeObjectURL(url); resolve(blob || file); },
        "image/webp",
        0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export async function uploadStoryCover(uid: string, storyId: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  // Sahibe göre izole yol — Storage kuralları yalnızca sahibinin yazmasına izin verir.
  const storageRef = ref(storage, `story-covers/${uid}/${storyId}.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

export async function uploadMessageMedia(conversationId: string, file: File): Promise<string> {
  const isGif = file.type === "image/gif";
  const ext = isGif ? "gif" : "webp";
  const uploadBlob: Blob = isGif ? file : await convertToWebP(file);
  // BUG FIX: uploadBlob'un gerçek MIME tipini kullan (WebP dönüşümü sonrası file.type geçersiz olur)
  const contentType = isGif ? "image/gif" : "image/webp";
  const storageRef = ref(storage, `messages/${conversationId}/${Date.now()}.${ext}`);
  await uploadBytes(storageRef, uploadBlob, { contentType });
  return getDownloadURL(storageRef);
}

export async function uploadUserAvatar(uid: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  const storageRef = ref(storage, `avatars/${uid}/avatar.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

export async function uploadUserCover(uid: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  const storageRef = ref(storage, `covers/users/${uid}/cover.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}


export async function uploadTalentWork(userId: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  const storageRef = ref(storage, `talent/${userId}/${Date.now()}.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

/**
 * Firebase Storage download URL'sinden storage path'ini çıkararak dosyayı siler.
 * BUG FIX: refFromURL() modüler SDK'da (v9+) bulunmaz.
 * Download URL formatı: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (!match) return;
    const storagePath = decodeURIComponent(match[1]);
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch {
    // Zaten silinmiş veya bulunamayan dosyalar için sessizce geç
  }
}
