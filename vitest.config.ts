import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { AUTH_SECRET: "test-secret", QUOTES_MOCK: "true", TZ: "UTC" },
    testTimeout: 30_000,
    // the integration tests share one database: run the files one after the other
    fileParallelism: false,
  },
});
