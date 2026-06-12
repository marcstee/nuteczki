// Runs once before the chromium project. Signs in with E2E_EMAIL / E2E_PASSWORD
// and saves the browser storage state to playwright/.auth/user.json so every
// test inherits an authenticated session without repeating the sign-in flow.

import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const email = process.env.E2E_EMAIL ?? "";
  const password = process.env.E2E_PASSWORD ?? "";

  await page.goto("/auth/signin");

  const emailField = page.getByLabel("E-mail");
  // exact: the sign-in form's show/hide toggle is aria-labelled "Pokaż hasło",
  // which a substring match on "Hasło" would also resolve (strict-mode violation).
  const passwordField = page.getByLabel("Hasło", { exact: true });
  const submit = page.getByRole("button", { name: "Zaloguj się" });

  // The form is a React island. A fill (or submit) that lands before hydration is
  // lost: .fill sets the DOM value but React's onChange isn't wired yet, so the
  // controlled state stays empty and submit fails its required-field validation
  // (intermittent on a cold dev server, and in CI). Retry the whole fill+submit
  // until it actually navigates — deterministic, no fixed wait.
  await expect(async () => {
    await emailField.fill(email);
    await passwordField.fill(password);
    await submit.click();
    await page.waitForURL("/dashboard", { timeout: 3000 });
  }).toPass();

  await expect(page).toHaveURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
