import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["lib.js", "context-loader.js", "tool-router.js"],
      exclude: ["index.js"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
