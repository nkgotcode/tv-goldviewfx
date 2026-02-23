import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: resolve(__dirname, "tests/setup.ts"),
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      thresholds: {
        lines: 55,
        branches: 31,
        functions: 40,
        statements: 52,
      },
      exclude: [
        "**/*.d.ts",
        "**/next-env.d.ts",
        "**/tests/**",
        "src/app/library/page.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
