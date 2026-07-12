import { defineConfig, configDefaults } from "vitest/config";
import { resolve } from "node:path";

// Route handlers import via the `@/` alias; vitest needs it to resolve those
// modules (and to let tests import them / the shared db mock the same way).
export default defineConfig({
  test: {
    // Git worktrees live under .claude/worktrees - their test copies must not
    // run from the main checkout (their @/ alias would resolve to OUR lib).
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
