import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/lib/book-import.test.ts", "src/lib/book-import-service.test.ts"],
  },
});
