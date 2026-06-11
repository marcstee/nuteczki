// Runs once before the chromium project. Signs in with E2E_EMAIL / E2E_PASSWORD
// and saves the browser storage state to playwright/.auth/user.json so every
// test inherits an authenticated session without repeating the sign-in flow.

import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/auth/signin");
  await page.getByLabel("E-mail").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("Hasło").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("/dashboard");

  await expect(page).toHaveURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
