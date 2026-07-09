import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Route handlers import via the `@/` alias; vitest needs it to resolve those
// modules (and to let tests import them / the shared db mock the same way).
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
