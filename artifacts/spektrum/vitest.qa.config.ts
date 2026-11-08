import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", include: ["src/lib/qa-sharing.test.ts"] },
});
