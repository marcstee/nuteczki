// Risk #7 — Broken assembled session flow (test-plan.md §2 #7, §3 Phase 3).
// Proves a real user can start a drill, advance through every exercise, hit
// auto-finish, see the summary, and have the session persist ("Zapisano") — the
// wired-together flow that green unit/integration suites do not exercise.
//
// Seed/cleanup: via ./supabase-e2e.ts. Auth: storageState from e2e/auth.setup.ts
// (no sign-in here). Run: `npm run test:e2e` with E2E_EMAIL / E2E_PASSWORD set,
// local `supabase start`, and the dev server (auto-started by playwright.config).
//
// Scope guardrails (test-plan §2 #7, plan "What We're NOT Doing"):
//   - Correctness is out of scope (#1/#2/#4): click ANY valid option to advance;
//     never assert an answer was right.
//   - Persistence is out of scope (#3): assert the in-DOM "Zapisano" indicator
//     only; never read /history or the DB back.

import { test, expect, type Page } from "@playwright/test";
import { deleteSession } from "./supabase-e2e";

// Each completed session persists one client-generated row; track its id so
// afterEach removes it and the spec stays independent across re-runs.
const sessionIds = new Set<string>();

test.afterEach(async () => {
  for (const id of sessionIds) {
    await deleteSession(id);
  }
  sessionIds.clear();
});

// Advance the current card: detect its type, click any valid option (correctness
// out of scope), then click the "Dalej" the answer reveals. The loop is uniform —
// the final "Dalej" is what fires auto-finish (DrillSession.tsx handleNext gates
// finish on answers.length >= exerciseCount), so no special-casing of card 5.
async function answerCurrentCard(page: Page) {
  const findNoteCaption = page.getByText("Znajdź tę nutkę");
  const letterButtons = page.getByRole("button", { name: /^[CDEFGAH]$/ });
  await expect(findNoteCaption.or(letterButtons.first())).toBeVisible();

  if (await findNoteCaption.isVisible()) {
    // letter_to_note: the three staff options carry positional "Nutka N" labels
    // (Phase 1 a11y fix) — addressable by role+name without leaking the pitch.
    await page
      .getByRole("button", { name: /^Nutka [123]$/ })
      .first()
      .click();
  } else {
    // note_to_letter: any of the seven letter buttons (C D E F G A H) advances.
    await letterButtons.first().click();
  }

  const next = page.getByRole("button", { name: "Dalej" });
  await expect(next).toBeVisible();
  await next.click();
}

test("a 5-exercise drill can be started, completed, summarised, and saved", async ({ page }) => {
  // The save is fire-and-forget (SessionResults.tsx): the summary renders
  // immediately while POST /api/sessions resolves in the background. Listen for
  // it before navigating so we capture its id (for cleanup) the moment it fires.
  const savePromise = page.waitForResponse(
    (res) => res.url().includes("/api/sessions") && res.request().method() === "POST",
  );

  // Start the shortest session (5 — still mixes both exercise types). The count
  // picker is a React island; a tap before it hydrates is a no-op, so retry until
  // the first exercise appears (only matters on a cold server / CI — deterministic,
  // no fixed wait). Guard the click so we don't tap a button that's already gone.
  await page.goto("/drill");
  const countButton = page.getByRole("button", { name: "5" });
  await expect(async () => {
    if (await countButton.isVisible()) await countButton.click();
    await expect(page.getByText(/Ćwiczenie \d+ z \d+/)).toBeVisible({ timeout: 1500 });
  }).toPass();

  // Advance through all five cards; the 5th "Dalej" auto-finishes into the summary.
  for (let i = 0; i < 5; i++) {
    await answerCurrentCard(page);
  }

  // Register the saved session id for cleanup BEFORE asserting, so afterEach still
  // deletes the row even if a summary assertion below fails.
  const saveResponse = await savePromise;
  const savedId = (saveResponse.request().postDataJSON() as { id: string }).id;
  sessionIds.add(savedId);

  // Summary renders: heading, accuracy %, and BOTH per-type breakdown blocks
  // (note→letter and letter→note are both present in a balanced 5-card deck).
  await expect(page.getByRole("heading", { name: "Koniec sesji!" })).toBeVisible();
  await expect(page.getByText(/\d+%/)).toBeVisible();
  await expect(page.getByText("celność")).toBeVisible();
  await expect(page.getByText("Nuta → litera")).toBeVisible();
  await expect(page.getByText("Litera → nuta")).toBeVisible();

  // The save reached the DB and surfaced "Zapisano" — not merely that the summary
  // appeared. (Persistence depth is §6.2's integration job; we assert the indicator.)
  await expect(page.getByText("Zapisano")).toBeVisible();

  // Exit returns the child to the dashboard.
  await page.getByRole("button", { name: "Gotowe" }).click();
  await page.waitForURL("/dashboard");
});
