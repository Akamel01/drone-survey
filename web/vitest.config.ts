import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component-test runner (M1 owns it): lib/*.test.ts stays on node's runner
// (see `test` script); vitest only takes component suites so the two runners
// never both claim the same file.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["components/**/*.{test,spec}.{ts,tsx}", "app/**/*.{test,spec}.{ts,tsx}"],
  },
});
