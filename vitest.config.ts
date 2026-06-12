import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";
import { parseDevVars } from "./src/test/supabase-it";

export default getViteConfig({
  test: {
    environment: "node",
    env: parseDevVars(),
    // Keep Vitest scoped to src/ unit+integration specs. The Playwright e2e
    // suite lives in e2e/ and runs via `npm run test:e2e`; globbing it here
    // drags in playwright-core/chromium-bidi and breaks dep optimization.
    include: ["src/**/*.{test,spec}.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", "playwright/**"],
  },
});
