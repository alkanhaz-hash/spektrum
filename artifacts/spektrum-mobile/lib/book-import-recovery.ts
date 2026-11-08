import AsyncStorage from "@react-native-async-storage/async-storage";
import { createImportRecovery } from "@workspace/book-import/recovery";
export type { ImportRecovery } from "@workspace/book-import/recovery";

// Chunks avoid Android's per-row SQLite cursor limit for long books.
export const { readImportRecovery, saveImportRecovery, clearImportRecovery } = createImportRecovery(AsyncStorage);
