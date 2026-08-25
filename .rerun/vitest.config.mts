import { defineConfig } from "vitest/config";
import path from "path";
const root = path.resolve(__dirname, "..");
export default defineConfig({
  root,
  resolve: {
    alias: {
      "server-only": path.resolve(root, ".rerun/empty.js"),
      "@": path.resolve(root, "src"),
    },
  },
  test: { include: [".rerun/*.test.ts"], testTimeout: 900_000, hookTimeout: 900_000 },
});
