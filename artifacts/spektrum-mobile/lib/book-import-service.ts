import * as Crypto from "expo-crypto";
import { createBookImporter } from "@workspace/book-import/firestore";
import { auth, db, qaEmulatorEnabled } from "./firebase";
import { GENRES } from "./firestore-service";

export const importBookDraft = createBookImporter({
  auth, db, genres: GENRES,
  digest: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
  ...(qaEmulatorEnabled ? { emulatorBase: `${window.location.origin}/__qa-firestore` } : {}),
});
