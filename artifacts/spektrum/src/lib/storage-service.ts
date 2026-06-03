import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Converts any image file to WebP format and uploads to Firebase Storage.
 * Falls back to original format if browser doesn't support canvas conversion.
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
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        },
        "image/webp",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export async function uploadStoryCover(storyId: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  const storageRef = ref(storage, `covers/${storyId}/cover.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

export async function uploadMessageMedia(conversationId: string, file: File): Promise<string> {
  const ext = file.type.startsWith("image/gif") ? "gif" : "webp";
  let uploadBlob: Blob = file;
  if (ext === "webp") {
    uploadBlob = await convertToWebP(file);
  }
  const storageRef = ref(storage, `messages/${conversationId}/${Date.now()}.${ext}`);
  await uploadBytes(storageRef, uploadBlob, { contentType: file.type });
  return getDownloadURL(storageRef);
}

export async function uploadUserAvatar(uid: string, file: File): Promise<string> {
  const webpBlob = await convertToWebP(file);
  const storageRef = ref(storage, `avatars/${uid}/avatar.webp`);
  await uploadBytes(storageRef, webpBlob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

export async function uploadNarrationAudio(storyId: string, narratorId: string, file: File): Promise<number> {
  // Returns duration in seconds via AudioContext
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(audio.duration) || 0);
    });
    audio.addEventListener("error", () => { URL.revokeObjectURL(url); resolve(0); });
  });
}

export async function uploadNarrationFile(storyId: string, narratorId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `narrations/${storyId}/${narratorId}.mp3`);
  await uploadBytes(storageRef, file, { contentType: "audio/mpeg" });
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

export async function deleteFile(url: string): Promise<void> {
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch {
    // Ignore errors for already-deleted files
  }
}
