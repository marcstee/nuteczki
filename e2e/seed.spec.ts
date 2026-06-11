// Risk #7: Broken assembled session flow — proves a user can start a drill session,
// advance through every exercise, reach auto-finish, and see the summary screen.
//
// Requires env vars: E2E_EMAIL, E2E_PASSWORD (credentials for a local test account).
// Run after `supabase start` and `npm run dev` (or `wrangler dev`).

import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/auth/signin");
  await page.getByLabel("E-mail").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("Hasło").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("/dashboard");
}

async function answerCurrentExercise(page: Page) {
  // Wait for whichever exercise type is active to be ready:
  //   NoteToLetterExercise — exposes labelled letter buttons (A–G)
  //   LetterToNoteExercise — shows the "Znajdź tę nutkę" caption instead
  const letterABtn = page.getByRole("button", { name: "A" });
  const findNoteCaption = page.getByText("Znajdź tę nutkę");
  await expect(letterABtn.or(findNoteCaption)).toBeVisible();

  if (await letterABtn.isVisible()) {
    // NoteToLetterExercise: any letter is a valid pick for a flow test.
    await letterABtn.click();
  } else {
    // LetterToNoteExercise: the three pitch-option buttons contain only an SVG
    // staff with no accessible name. Click the first card; any option advances
    // the session. TODO: add aria-label={pitch} to option buttons so this can
    // use getByLabel and carry the musical intent.
    await page.getByRole("button").first().click();
  }

  // Both exercise types reveal "Dalej" after an answer is registered.
  await expect(page.getByRole("button", { name: "Dalej" })).toBeVisible();
  await page.getByRole("button", { name: "Dalej" }).click();
}

test("drill session can be started, completed, and summary renders", async ({ page }) => {
  await signIn(page);
  await page.goto("/drill");

  // Setup phase: pick the shortest session (5 exercises) to minimise run time.
  await page.getByRole("button", { name: "5" }).click();

  // Active phase: answer all 5 exercises.
  for (let i = 0; i < 5; i++) {
    await answerCurrentExercise(page);
  }

  // Finished phase: summary must render with the accuracy block.
  await expect(page.getByRole("heading", { name: "Koniec sesji!" })).toBeVisible();
  await expect(page.getByText("celność")).toBeVisible();
});
