# Child-Friendly UI Redesign (Polish) Implementation Plan

## Overview

Replace the inherited 10x Astro starter look (cosmic theme + English copy +
leftover marketing content) with a deliberate, child-friendly visual identity
for Nuteczki: a flat dark-navy canvas, a playful blue/purple/pink palette, a
rounded font (Fredoka), an AI-generated mascot, and Polish copy throughout —
single-language, no i18n machinery.

The frame brief (`frame.md`) established that the real problem is not "repaint
each screen" but that **the look lives nowhere**: the design-token layer the
starter shipped is unused (neutral grayscale, never applied), and every screen
hardcodes cosmic utilities, so there is no single source of truth to propagate
from. This plan therefore (1) gives the look a single home — the token/font
layer — then (2) retrofits all 16 cosmic-hardcoded surfaces onto it, screen
cluster by screen cluster, and (3) ends with a cleanup + verification gate that
proves no cosmic utility or target English string survives.

The reference target is already captured: `visual-direction.md` (palette,
mood, constraints) and `public/mascot.webp` (the mascot asset) exist. This plan
consumes them; it does not re-derive the design.

## Current State Analysis

- **Token layer present but unused.** `src/styles/global.css:6-39` defines the
  shadcn neutral-grayscale tokens (`oklch(x 0 0)`); `@theme inline` (`:75-111`)
  maps them to color utilities; `.dark` (`:41-73`) is a second grayscale theme.
  The app never sets `.dark` on `<html>` and never uses `bg-background` /
  `bg-primary`. `@layer base` already applies `bg-background text-foreground` to
  `body` (`:121-123`) — so the body silently follows whatever `:root` defines.
- **Cosmic palette hardcoded across 16 files.** `bg-cosmic` utility lives at
  `global.css:113`; screens stack `from-blue-500`/`to-purple-500` gradients,
  `bg-white/10`, `backdrop-blur-xl`, `text-blue-100/*`, `border-white/10`. Hit
  counts: `history.astro` (16), `Welcome.astro` (10), `SessionResults.tsx` (9),
  `dashboard.astro` (8), the three auth pages (4 each), the two exercise
  components (4 each), `FormField.tsx` (3), `Topbar.astro` (3), `DrillSession.tsx`
  (2). `button.tsx` is the **only** semantic-token consumer, and `SubmitButton`
  overrides it with `bg-purple-600`.
- **Starter content intact.** `Welcome.astro:32-123` renders the "10x Astro
  Starter" hero, "cosmic developer experience" copy, and three English feature
  cards, with cosmic orbs + star field. `index.astro` renders it for everyone.
- **English copy everywhere + wrong lang.** `Layout.astro:14` is
  `<html lang="en">`. UI strings ("Start practising", "How many notes?",
  "✓ Correct!", "Session complete!", "Session history", form labels, validation
  messages, `PasswordToggle` aria-labels) are English. `history.astro:41` formats
  dates with `en-US`. `Banner.astro` copy is *already* Polish ("Uwaga:") but uses
  its own hardcoded hex palette (`:27-41`).
- **Staff constraint is in code.** `Staff.tsx` strokes/fills with `currentColor`
  and is wrapped in white "paper" cards (`NoteToLetterExercise.tsx:39`,
  `LetterToNoteExercise.tsx:80`) so the notation renders black-on-white. This is
  a PRD guardrail (musical accuracy) and must not change.
- **No font infrastructure.** No `@font-face`, no Google Fonts link, no
  `--font-*` token. The mascot asset exists at `public/mascot.webp` (132 KB,
  1024×1024), referenced as `/mascot.webp`.
- **Auth error copy.** `api/auth/signin.ts:11` / `signup.ts:11` hardcode
  `"Supabase is not configured"` (English) and otherwise pass through Supabase's
  own English `error.message`.

## Desired End State

Every screen in the app — landing, dashboard, drill flow, session results,
history, and auth — renders on a flat dark-navy canvas with the playful
blue/purple/pink palette, Fredoka type, the mascot on the three designated
screens, and Polish copy (playful for the child on drills, neutral for the
parent on history/auth). The cosmic theme and all starter content are gone. The
palette, radii, and font are defined once in `src/styles/global.css` and every
screen consumes them through semantic token utilities — no screen hardcodes a
cosmic color. The staff still renders black-on-white inside an intentionally
framed card.

**Verification of end state:**
- `grep -rE "bg-cosmic|backdrop-blur|from-blue-5|to-purple-5|text-blue-100|bg-white/1" src` returns **nothing**.
- The `bg-cosmic` utility no longer exists in `global.css`.
- A spot-grep for target English UI strings (e.g. `Sign in`, `Start practising`,
  `Correct`, `How many`, `Session`) returns nothing in `src/components` and
  `src/pages` (excluding code identifiers/comments).
- `npm run lint`, `npx astro check`, and `npm run build` all pass.
- Manual: each screen viewed at 375px width is on-brand, the white staff card
  reads as intentional against the navy, and touch targets stay large.

### Key Discoveries:

- `body` already `@apply bg-background text-foreground` (`global.css:121-123`) —
  redefining `:root` to navy makes the whole app dark for free; screens only need
  their *local* `bg-cosmic`/glass wrappers stripped.
- `button.tsx` already consumes `--primary`/`--ring` etc. — once those tokens
  become the brand palette, `<Button>` and anything using it inherit the look
  with zero edits.
- `Staff.tsx` themes via `currentColor` (`:77`), so the staff color is controlled
  entirely by the parent card's `text-*` class — the redesign touches only the
  card framing, never the renderer.
- Letter names are C/D/E/F/G/A/**H** (`pitchToLetter`) — already correct for
  Polish; copy translation must **not** touch the note letters.

## What We're NOT Doing

- **Not** changing the staff renderer (`Staff.tsx`, `geometry.ts`, `pitch.ts`,
  `treble-clef.ts`) — notation stays black-on-white, musically unchanged.
- **Not** adding i18n machinery — no locale switcher, no string-extraction
  framework. Polish strings are written inline.
- **Not** adding a light theme — the product is single-theme (dark). The `.dark`
  block is removed, not maintained in parallel.
- **Not** mapping Supabase's pass-through auth `error.message` strings to Polish
  (would need an error-code→message map; a separate concern). We translate only
  our own UI strings and the hardcoded `"Supabase is not configured"` message.
- **Not** building a Playwright/visual-regression harness — verification is
  lint/check/build + a grep guard + manual visual review.
- **Not** changing any business logic, data flow, API contracts, routing
  (beyond an index→dashboard redirect for logged-in users), or the adaptive
  selection algorithm.
- **Not** producing multiple mascot poses or motion design — one static asset on
  three screens (per `visual-direction.md`).

## Implementation Approach

Foundation first, then retrofit by screen cluster, then clean up. Phase 1 builds
the single home (tokens + font + global shell) but deliberately **keeps** the
`bg-cosmic` utility so un-retrofitted screens don't break mid-rollout. Phases 2-4
strip each cluster's local cosmic/glass wrappers and swap them for token
utilities + Polish copy + mascot, in descending order of visibility (entry/shell
→ drill flow → history/auth). Phase 5 removes the now-orphaned `bg-cosmic`
utility and runs the grep guard + full-app visual sweep.

Each phase is independently shippable and visually verifiable, so
`/10x-implement ui-redesign phase N` has a clean manual checkpoint.

## Critical Implementation Details

- **`bg-cosmic` removal ordering.** Do not delete the `bg-cosmic` utility from
  `global.css` until Phase 5. Every screen that still references it must be
  retrofitted first, or the page loses its background mid-rollout. Phases 2-4
  replace each screen's `bg-cosmic` wrapper with `bg-background` (or simply drop
  the wrapper's bg, since `body` is already `bg-background`).
- **Single-theme token mechanism (Tailwind v4).** Redefine the `:root` token
  values to the navy palette and delete the `.dark` block — the app has one
  theme. `@theme inline` already exposes the tokens as `--color-*` utilities;
  add `--color-success` for the new success token and set `--font-sans` to
  Fredoka so the default font flows through `body`. Express colors as oklch
  (convert from the draft hex in the palette table below; refine against the
  mascot). Keep token **names** stable so `button.tsx` keeps working.
- **Staff card framing.** The staff stays black-on-white via `currentColor`; the
  parent card must keep a light/white interior and gain intentional framing
  (border/ring/shadow in brand tokens) so the white panel reads as a deliberate
  "paper" element on the navy canvas, not a hole. Never put a `text-*` class on
  the staff that would darken the navy-side; the card interior owns the staff
  color.
- **react-compiler constraint.** The drill components are under enforced
  `react-compiler` rules. The retrofit is className/copy-only — do not introduce
  new render-time mutation, refs, or side effects. Keep edits declarative.

## Phase 1: Design Foundation

### Overview

Establish the single source of truth: redefine the token layer to the navy
brand palette, self-host Fredoka and make it the default font, set the document
language to Polish, and align the standalone Banner palette. After this phase the
base canvas is on-brand; screens still carry local cosmic wrappers (removed in
later phases).

### Changes Required:

#### 1. Token palette + radius (single dark theme)

**File**: `src/styles/global.css`

**Intent**: Replace the unused neutral-grayscale token values with the brand
navy palette so the whole app inherits the look from one place; remove the
parallel `.dark` theme; bump the radius for a softer, more playful feel.

**Contract**: Redefine `:root` token *values* (names unchanged) per the table
below; delete the `.dark` block (`:41-73`); raise `--radius` from `0.625rem` to
`~1rem`. Add a `--success` token. Colors expressed as oklch (converted from the
draft hex). Draft hexes are from `visual-direction.md` and may be fine-tuned
against the mascot during implementation.

| Token | Role | Draft hex |
| --- | --- | --- |
| `--background` | flat navy canvas | `#13243F` |
| `--foreground` | near-white text | `#F2F6FF` |
| `--card` / `--popover` | one-step-lighter surface | `#1E3252` |
| `--card-foreground` / `--popover-foreground` | text on surface | `#F2F6FF` |
| `--primary` | brand sky blue | `#5BC2E7` |
| `--primary-foreground` | text on primary | `#13243F` |
| `--secondary` | playful purple | `#8B7CF0` |
| `--secondary-foreground` | text on secondary | `#F2F6FF` |
| `--accent` | celebration pink | `#F48FB1` |
| `--accent-foreground` | text on accent | `#13243F` |
| `--muted` | muted surface | `#1E3252` |
| `--muted-foreground` | secondary labels | `#A9B6CE` |
| `--success` (new) | correct feedback | `#5BD96A` |
| `--destructive` | error/incorrect | `#FF7A7A` |
| `--border` / `--input` | subtle light border on navy | `oklch(1 0 0 / 12%)` |
| `--ring` | focus ring = primary | `#5BC2E7` |

#### 2. Expose success token + Fredoka as default font

**File**: `src/styles/global.css`

**Intent**: Wire the new success token and the rounded font into Tailwind's
theme so they're available as utilities and as the default body font.

**Contract**: In `@theme inline`, add `--color-success: var(--success);` and set
`--font-sans` to a Fredoka-first stack. Ensure `body` (in `@layer base`) renders
in the sans stack (`@apply font-sans` or `font-family: var(--font-sans)`). Keep
`bg-cosmic` utility in place for now.

#### 3. Self-host Fredoka

**File**: `public/fonts/` (new) + `src/styles/global.css`

**Intent**: Ship Fredoka offline-first (PWA / instant-feel NFR) with no
third-party request.

**Contract**: Add subsetted Fredoka `woff2` file(s) with Latin-Extended coverage
(Polish diacritics ł/ą/ę/ś/ż/ź/ć/ń/ó) to `public/fonts/`. Declare `@font-face`
in `global.css` (or an imported css) referencing `/fonts/...` with
`font-display: swap`. Weights: at least a regular and a bold/semibold for
headings. Optionally add a `<link rel="preload" as="font">` in `Layout.astro`.

#### 4. Document language → Polish

**File**: `src/layouts/Layout.astro`

**Intent**: Correct the document language for the Polish single-language app.

**Contract**: `<html lang="en">` → `<html lang="pl">` (`:14`).

#### 5. Align Banner palette

**File**: `src/components/Banner.astro`

**Intent**: Bring the standalone config banner into the brand palette (copy is
already Polish).

**Contract**: Update the scoped `<style>` hex values (`:27-41`) to read against
the navy canvas — or convert to token classes. No copy change.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type/astro check passes: `npx astro check`
- Build passes: `npm run build`
- Fredoka woff2 exists: `ls public/fonts/*.woff2`
- `.dark` block removed: `grep -c "^.dark" src/styles/global.css` returns `0`

#### Manual Verification:

- Loading any existing screen shows the navy background and Fredoka text (even
  before that screen is retrofitted, the body canvas is navy).
- No FOUT/flash of a fallback font on reload; Polish diacritics render correctly.
- The config Banner (when triggered) is legible against the navy canvas.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Entry & Shell

### Overview

Kill the loudest starter tell. Replace the "10x Astro Starter" marketing page
with a child-friendly Polish home featuring the mascot, and redesign the Topbar
and dashboard onto the token palette (mascot on the dashboard).

### Changes Required:

#### 1. Child-friendly home

**File**: `src/components/Welcome.astro`

**Intent**: Replace all starter content (hero, "cosmic developer experience"
copy, feature cards, orbs, star field) with a warm Polish landing: app name,
the mascot (`/mascot.webp`), a one-line friendly intro, and sign-in / sign-up
CTAs.

**Contract**: Rewrite the component body. Use token utilities (`bg-background`,
`text-foreground`, `bg-primary`, `rounded-*`). Mascot via `<img src="/mascot.webp">`
with descriptive Polish `alt`. Remove the cosmic orb/star-field markup. Polish,
warm/welcoming register.

#### 2. Logged-in redirect on landing

**File**: `src/pages/index.astro`

**Intent**: A logged-in parent hitting `/` should go to the dashboard, not see a
"sign in" CTA.

**Contract**: In frontmatter, if `Astro.locals.user` exists,
`return Astro.redirect("/dashboard")`; otherwise render `<Welcome />`.

#### 3. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Retrofit the account bar onto tokens and Polish.

**Contract**: Replace glass/cosmic classes with token utilities. Polish strings:
e.g. "Panel" (Dashboard), "Wyloguj" (Sign out), "Nie zalogowano" (Not signed
in), "Zaloguj się" / "Zarejestruj się". Neutral parent register.

#### 4. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Retrofit the post-login hub onto tokens, add the mascot, Polish copy.

**Contract**: Replace `bg-cosmic`/glass with token utilities; add
`<img src="/mascot.webp">`. Polish: greeting + "Zacznij ćwiczyć" (Start
practising), "Historia sesji" (Session history), "Wyloguj". Keep the two
navigation links and the sign-out form behavior.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Astro check passes: `npx astro check`
- Build passes: `npm run build`
- No cosmic utilities remain in these files:
  `grep -rE "bg-cosmic|backdrop-blur|from-blue-5|text-blue-100|bg-white/1" src/components/Welcome.astro src/components/Topbar.astro src/pages/dashboard.astro` returns nothing.

#### Manual Verification:

- `/` (logged out) shows the mascot + Polish home; no "10x Astro Starter" text.
- `/` while logged in redirects to `/dashboard`.
- Dashboard shows the mascot, Polish copy, and brand-styled CTAs; sign-out works.
- Topbar links work and read in Polish.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Drill Flow

### Overview

Retrofit the core child experience — count picker, both exercise types, and the
session results screen (with the mascot) — onto the token palette with playful
Polish copy and intentionally framed white staff cards. This is the most
child-facing surface; copy is warm and encouraging.

### Changes Required:

#### 1. Drill page wrapper

**File**: `src/pages/drill.astro`

**Intent**: Strip the cosmic wrapper.

**Contract**: Replace the `bg-cosmic` wrapper class with `bg-background` (or drop
the bg, relying on the body). No logic change to the weights frontmatter.

#### 2. Count picker

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Retrofit the setup screen onto tokens with playful Polish.

**Contract**: Replace the gradient heading + count buttons with token utilities
(`bg-primary`, `text-primary-foreground`, large rounded). Polish: "Ile nutek?"
(How many notes?). Keep the `setup → active → finished` state machine, COUNTS,
and all handlers unchanged. Declarative className-only edits (react-compiler).

#### 3. Note→letter exercise

**File**: `src/components/drill/NoteToLetterExercise.tsx`

**Intent**: Retrofit feedback UI to tokens + Polish + framed staff card.

**Contract**: Keep the white-interior staff card (`Staff` stays `currentColor`),
add brand framing (border/ring/shadow). Answer-button states → token utilities:
correct = `--success`, wrong = `--destructive`, neutral = card/muted. Polish:
"Ćwiczenie {i} z {n}" (Exercise i of total), "✓ Brawo!" (Correct), "✗ To było
{letter}" (It was X), "Dalej" (Next). Do not translate the note letters.

#### 4. Letter→note exercise

**File**: `src/components/drill/LetterToNoteExercise.tsx`

**Intent**: Same retrofit, mirroring the house style.

**Contract**: Token utilities for prompt + option-card states (keep white card
interiors for the staffs). Polish: "Znajdź tę nutkę" (Find this note),
"Ćwiczenie {i} z {n}", "✓ Brawo!" / "✗ Prawie!" (Not quite), "Dalej".

#### 5. Session results

**File**: `src/components/drill/SessionResults.tsx`

**Intent**: Retrofit the results screen onto tokens, add the mascot, Polish copy.

**Contract**: Token utilities for the accuracy block, per-type StatBlocks, and
the save-state indicator (keep the non-blocking error + retry behavior). Add
`<img src="/mascot.webp">` (celebration moment). Polish: "Koniec sesji!"
(Session complete), "celność" (accuracy), per-type labels "Nuta → litera" /
"Litera → nuta", "poprawne" / "błędne" (correct/incorrect), "Jeszcze raz"
(Practice again), "Gotowe" (Done), "Ponów zapis" (Retry save),
"Zapisywanie…" / "Zapisano" (Saving/Saved), and the playful error line.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Astro check passes: `npx astro check`
- Build passes: `npm run build`
- No cosmic utilities remain in the drill cluster:
  `grep -rE "bg-cosmic|from-blue-5|to-purple-5|text-blue-100|bg-white/1" src/pages/drill.astro src/components/drill/*.tsx` returns nothing.

#### Manual Verification:

- A full session (setup → both exercise types → results) runs end-to-end; the
  state machine and scoring are unchanged.
- The white staff card reads as an intentional framed "paper" panel on the navy;
  notes render black-on-white and remain musically correct.
- Correct/incorrect feedback uses the success-green / error-coral tokens; copy is
  Polish and child-warm.
- The mascot appears on the results screen; "Retry save" still works on a forced
  save failure. Touch targets stay large (NFR).

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: History & Auth

### Overview

Retrofit the parent-facing surfaces — session history and the full auth flow
(sign in, sign up, confirm-email, and the shared form components) — onto the
token palette with neutral, informational Polish.

### Changes Required:

#### 1. Session history

**File**: `src/pages/history.astro`

**Intent**: Retrofit the heaviest cosmic file onto tokens, switch the date
locale, neutral Polish copy. Preserve the three render states (error / empty /
list — load-bearing per prior plan-review).

**Contract**: Replace all cosmic/glass utilities with token utilities
(`bg-card`, `border-border`, `bg-primary` for the accuracy bar, `--success` /
`--destructive` for counts). `Intl.DateTimeFormat("en-US", …)` → `"pl-PL"`
(keep `timeZone: "Europe/Warsaw"`). Polish: "Historia sesji", "← Panel", error
copy, empty-state copy + "Zacznij ćwiczyć" CTA, "celność", "Nuta → litera" /
"Litera → nuta", "poprawne" / "błędne".

#### 2. Auth pages

**File**: `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`

**Intent**: Retrofit the auth card shells onto tokens with Polish copy.

**Contract**: Replace `bg-cosmic`/glass card classes with token utilities.
Polish headings + links: "Zaloguj się" / "Zarejestruj się", "Nie masz konta?" /
"Masz już konto?", and the confirm-email states ("Rejestracja zakończona" /
"Sprawdź e-mail" with their descriptions and link text). Keep the
`error` searchParam pass-through and `isAutoConfirmed` branch.

#### 3. Shared auth form components

**File**: `src/components/auth/FormField.tsx`, `SubmitButton.tsx`,
`ServerError.tsx`, `PasswordToggle.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`

**Intent**: Retrofit input/button styling to tokens and translate all
labels, placeholders, validation messages, and aria-labels to Polish.

**Contract**:
- `FormField.tsx`: input base → token utilities (`bg-input`/`bg-card`,
  `border-border`, `text-foreground`, `placeholder` muted, `focus:ring-ring`).
- `SubmitButton.tsx`: drop the `bg-purple-600` override → use the `<Button>`
  default (`bg-primary`).
- `ServerError.tsx`: error styling → `--destructive` tokens.
- `PasswordToggle.tsx`: aria-labels → Polish ("Pokaż hasło" / "Ukryj hasło").
- `SignInForm.tsx` / `SignUpForm.tsx`: Polish labels ("E-mail", "Hasło",
  "Powtórz hasło"), placeholders, validation messages ("Podaj adres e-mail",
  "Hasło jest wymagane", "Hasła nie są takie same", etc.), button + pending text
  ("Zaloguj się" / "Logowanie…", "Utwórz konto" / "Tworzenie konta…"), and the
  password-length hint.

#### 4. Hardcoded auth API message

**File**: `src/pages/api/auth/signin.ts`, `signup.ts`

**Intent**: Translate the one hardcoded user-facing error string.

**Contract**: `"Supabase is not configured"` → Polish (e.g. "Supabase nie jest
skonfigurowany"). Supabase's pass-through `error.message` is left as-is (see
"What We're NOT Doing").

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Astro check passes: `npx astro check`
- Build passes: `npm run build`
- No cosmic utilities remain in history/auth:
  `grep -rE "bg-cosmic|backdrop-blur|from-blue-5|to-purple-5|text-blue-100|bg-white/1" src/pages/history.astro src/pages/auth src/components/auth` returns nothing.

#### Manual Verification:

- History renders all three states correctly; dates are Polish-formatted
  (`pl-PL`, Warsaw tz); copy is neutral Polish.
- Sign-in and sign-up flows work end-to-end (validation, submit, redirect,
  server error display) with Polish copy; password toggle aria-labels are Polish.
- confirm-email page shows the correct Polish state (dev auto-confirm vs prod).

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: Cleanup & Verification

### Overview

Remove the now-orphaned `bg-cosmic` utility and prove the redesign is complete:
no cosmic utility and no target English UI string survives anywhere, and the
whole app is visually on-brand at mobile width.

### Changes Required:

#### 1. Remove the cosmic utility

**File**: `src/styles/global.css`

**Intent**: Delete the dead `bg-cosmic` utility now that no screen uses it.

**Contract**: Remove the `@utility bg-cosmic { … }` block (`:113-115`).

#### 2. Whole-app grep guard

**File**: (verification step — no file change unless a leftover is found)

**Intent**: Catch any leftover cosmic utility or target English string.

**Contract**: Run the guard greps below over `src`. Any hit is a defect to fix in
the owning phase's file. Target English set is the known UI strings (Sign in/up,
Start practising, How many, Correct, Session, accuracy, Dashboard, etc.) —
excluding code identifiers, comments, and the intentional `lang`/`alt` text.

### Success Criteria:

#### Automated Verification:

- `bg-cosmic` gone everywhere:
  `grep -rE "bg-cosmic" src` returns nothing.
- No cosmic palette utilities anywhere:
  `grep -rE "backdrop-blur|from-blue-5|to-purple-5|text-blue-100|bg-white/1[0-9]?" src` returns nothing.
- No target English UI strings:
  `grep -rniE "Sign in|Sign up|Start practising|How many|✓ Correct|Session complete|Session history|Not signed in" src/components src/pages` returns nothing.
- Lint passes: `npm run lint`
- Astro check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Walk every screen (landing, dashboard, drill setup, both exercises, results,
  history empty + populated, signin, signup, confirm-email) at 375px width: each
  is on-brand navy, uses Fredoka, and has no cosmic/English remnant.
- The white staff card reads as intentional on every drill screen.
- The mascot appears on landing, dashboard, and results.
- Touch targets and spacing remain child-appropriate (NFR); feedback still feels
  instant (no added latency).

**Implementation Note**: Pause for final manual confirmation; this closes the
change.

---

## Testing Strategy

### Unit Tests:

- None added — this is a visual/copy redesign with no logic changes, and the repo
  has no test harness (out of scope per decision). Existing pure helpers
  (`exercises.ts`, `sessionSummary.ts`, staff geometry) are untouched.

### Integration Tests:

- None added.

### Manual Testing Steps:

1. Phase 1: load any page → navy canvas + Fredoka; diacritics render; no FOUT.
2. Phase 2: `/` logged out shows mascot home; logged in redirects to dashboard;
   dashboard + topbar on-brand and Polish.
3. Phase 3: run a full drill session both exercise types → results; staff stays
   black-on-white and framed; feedback colors + Polish copy correct; mascot on
   results; retry-save works.
4. Phase 4: history (all three states, `pl-PL` dates); sign in / sign up / confirm
   flows in Polish with working validation + redirects.
5. Phase 5: run all guard greps (expect empty); visual sweep of every screen at
   375px.

## Performance Considerations

- Self-hosted, subsetted Fredoka woff2 with `font-display: swap` avoids a
  render-blocking third-party request and keeps the PWA usable offline — aligned
  with the "instant feel" (200ms) NFR. Preload the primary weight if FOUT is
  noticeable.
- The mascot is already well-sized (132 KB webp); reuse the single asset across
  all three screens (cacheable). No additional image work needed.
- Retrofit is className/copy-only — no new client JS, effects, or render-time
  work; the drill island's behavior and bundle are unchanged.

## Migration Notes

- No data or schema changes. No env/config changes.
- The only routing change is an index→dashboard redirect for logged-in users.
- Token **names** are preserved, so `button.tsx` and any shadcn primitive keep
  working through the palette change with no edits.

## References

- Frame brief: `context/changes/ui-redesign/frame.md`
- Visual direction (captured target): `context/changes/ui-redesign/visual-direction.md`
- Change identity: `context/changes/ui-redesign/change.md`
- Roadmap S-05: `context/foundation/roadmap.md:153-176`
- PRD guardrail (staff accuracy): `context/foundation/prd.md:43`, NFRs `:105-108`
- Token layer: `src/styles/global.css:6` (tokens), `:75` (`@theme inline`), `:113` (`bg-cosmic`)
- Only token consumer: `src/components/ui/button.tsx`
- Mascot asset: `public/mascot.webp` (→ `/mascot.webp`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Design Foundation

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 8429e5e
- [x] 1.2 Astro check passes: `npx astro check` — 8429e5e
- [x] 1.3 Build passes: `npm run build` — 8429e5e
- [x] 1.4 Fredoka woff2 exists: `ls public/fonts/*.woff2` — 8429e5e
- [x] 1.5 `.dark` block removed from global.css — 8429e5e

#### Manual

- [x] 1.6 Any screen shows navy canvas + Fredoka text — 8429e5e
- [x] 1.7 No FOUT on reload; Polish diacritics render correctly — 8429e5e
- [x] 1.8 Config Banner legible against navy — 8429e5e

### Phase 2: Entry & Shell

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — fd011ba
- [x] 2.2 Astro check passes: `npx astro check` — fd011ba
- [x] 2.3 Build passes: `npm run build` — fd011ba
- [x] 2.4 No cosmic utilities in Welcome/Topbar/dashboard (grep empty) — fd011ba

#### Manual

- [x] 2.5 `/` logged out shows mascot + Polish home; no starter text — fd011ba
- [x] 2.6 `/` logged in redirects to /dashboard — fd011ba
- [x] 2.7 Dashboard on-brand + Polish; sign-out works — fd011ba
- [x] 2.8 Topbar links work and read in Polish — fd011ba

### Phase 3: Drill Flow

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 14fda31
- [x] 3.2 Astro check passes: `npx astro check` — 14fda31
- [x] 3.3 Build passes: `npm run build` — 14fda31
- [x] 3.4 No cosmic utilities in drill cluster (grep empty) — 14fda31

#### Manual

- [x] 3.5 Full session runs end-to-end; state machine + scoring unchanged — 14fda31
- [x] 3.6 Staff card framed; notes black-on-white + musically correct — 14fda31
- [x] 3.7 Feedback uses success/error tokens; Polish child-warm copy — 14fda31
- [x] 3.8 Mascot on results; retry-save works; touch targets large — 14fda31

### Phase 4: History & Auth

#### Automated

- [x] 4.1 Lint passes: `npm run lint`
- [x] 4.2 Astro check passes: `npx astro check`
- [x] 4.3 Build passes: `npm run build`
- [x] 4.4 No cosmic utilities in history/auth (grep empty)

#### Manual

- [ ] 4.5 History three states render; pl-PL Warsaw dates; neutral Polish
- [ ] 4.6 Sign-in / sign-up flows work in Polish (validation, redirect, errors)
- [ ] 4.7 confirm-email shows correct Polish state; password toggle aria Polish

### Phase 5: Cleanup & Verification

#### Automated

- [ ] 5.1 `bg-cosmic` gone everywhere (grep empty)
- [ ] 5.2 No cosmic palette utilities anywhere (grep empty)
- [ ] 5.3 No target English UI strings (grep empty)
- [ ] 5.4 Lint passes: `npm run lint`
- [ ] 5.5 Astro check passes: `npx astro check`
- [ ] 5.6 Build passes: `npm run build`

#### Manual

- [ ] 5.7 Every screen on-brand at 375px; no cosmic/English remnant
- [ ] 5.8 Staff card intentional on every drill screen
- [ ] 5.9 Mascot on landing, dashboard, results
- [ ] 5.10 Touch targets child-appropriate; feedback still instant
