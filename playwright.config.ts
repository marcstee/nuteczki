import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

// Make `npm run test:e2e` work without manually exporting env. Load the sign-in
// credentials and a LOCAL (never production) Supabase target from the project's
// env files into process.env — without clobbering anything already set, so CI
// secrets always win. E2E creds come from .env; the Supabase vars come from
// .dev.vars so the spec and its dev server hit the local stack, never the prod
// project configured in .env (the spec creates and deletes session rows).
function readEnvFile(file: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (match) out[match[1]] = match[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const dotenv = readEnvFile(".env");
const devVars = readEnvFile(".dev.vars");

function applyEnv(key: string, value: string | undefined) {
  if (value && process.env[key] === undefined) process.env[key] = value;
}

applyEnv("E2E_EMAIL", dotenv.E2E_EMAIL);
applyEnv("E2E_PASSWORD", dotenv.E2E_PASSWORD);
applyEnv("SUPABASE_URL", devVars.SUPABASE_URL);
applyEnv("SUPABASE_KEY", devVars.SUPABASE_KEY);
applyEnv("SUPABASE_SERVICE_ROLE_KEY", devVars.SUPABASE_SERVICE_ROLE_KEY);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    env: {
      // Disable Astro's dev toolbar (see astro.config.mjs) so its floating
      // overlay can't intercept clicks on the drill's full-width buttons.
      ASTRO_DEV_TOOLBAR_DISABLED: "1",
      // Point the dev server at the resolved (local) Supabase, overriding the
      // prod project in .env so the spec never touches production data.
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_KEY: process.env.SUPABASE_KEY ?? "",
    },
  },
});
