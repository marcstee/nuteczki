---
title: "Nuteczki — Niezmiennik #1 jako agregat-strażnik (plan refaktoru)"
created: 2026-06-15
type: refactor-plan
---

# Niezmiennik #1 jako agregat-strażnik — Nuteczki

> PLAN refaktoru, nie implementacja. Nie modyfikuje kodu produkcyjnego.
> Buduje na [01-domain-distillation.md](01-domain-distillation.md) — ale niezmiennik
> #1 wybrany niezależnie, z weryfikacją cytatów plik:linia w bieżącym kodzie.

---

## KROK 0 — Kontekst (potwierdzony)

**Dokumenty:** `context/foundation/prd.md` (wizja, FR-001…009, guardrail), `roadmap.md`
(waga), `test-plan.md` (dyscyplina testów + Risk Map), `01-domain-distillation.md`.
**Stack:** Astro v6 SSR + React 19 islands, Supabase (Postgres + RLS + auth),
Cloudflare Workers, TypeScript strict. **Runner:** Vitest; integracja na realnym
lokalnym Supabase (`*.integration.test.ts`, `npm run test`).

Gdzie żyje logika oceny odpowiedzi (zweryfikowane):

| Warstwa | Plik | Rola wobec werdyktu |
| --- | --- | --- |
| Domena (prawda muzyczna) | [pitch.ts](src/components/staff/pitch.ts), [exercises.ts](src/components/drill/exercises.ts) | `pitchToLetter` — jedyne źródło mapowania nuta→litera ([exercises.ts:86](src/components/drill/exercises.ts:86)) |
| UI (island) | [DrillSession.tsx](src/components/drill/DrillSession.tsx) | **Liczy `is_correct`** ([:107](src/components/drill/DrillSession.tsx:107), [:118](src/components/drill/DrillSession.tsx:118)) |
| Klient→serwer | [saveSession.ts](src/components/drill/saveSession.ts) | Wysyła `is_correct`, **nie wysyła wyboru** ([:23-28](src/components/drill/saveSession.ts:23)) |
| API / zapis | [sessions.ts](src/pages/api/sessions.ts) | **Ufa** `is_correct`, sprawdza tylko typ boolean ([:15-16](src/pages/api/sessions.ts:15), [:71](src/pages/api/sessions.ts:71)) |
| Schemat | [migration](supabase/migrations/20260528214850_create_session_tables.sql) | `is_correct boolean not null` — brak związku z prawdą ([:18](supabase/migrations/20260528214850_create_session_tables.sql:18)) |

---

## KROK 1 — Niezmienniki biznesowe (lista)

| # | Niezmiennik (MUSI być zawsze prawdziwy) | Źródło |
| --- | --- | --- |
| I-1 | **`is_correct` odpowiedzi = prawda muzyczna**: dla `note_to_letter` `is_correct ⇔ wybór == pitchToLetter(nuta)`; dla `letter_to_note` `is_correct ⇔ pitchToLetter(wybór) == pitchToLetter(nuta-cel)`. Werdykt jest *liczony z jedynego źródła prawdy*, nie deklarowany. | Guardrail "musical accuracy is non-negotiable" (prd.md:43); FR-006 (prd.md:93) |
| I-2 | `answers.note` zawsze jest nutą w zakresie C4–A5 (13 diatonicznych) | non-goal zakresu (prd.md:126); `Pitch`/`PITCHES` ([pitch.ts:16](src/components/staff/pitch.ts:16)) |
| I-3 | Ukończona sesja ma dokładnie `exercise_count` odpowiedzi; `exercise_count ∈ {5,10,20}` | FR-002 (prd.md:77), FR-007 (prd.md:83) |
| I-4 | Zapis sesji jest **atomowy**: sesja + wszystkie jej odpowiedzi powstają razem albo wcale (brak "ukończonej sesji z 0 odpowiedzi") | NFR "no silent data loss" (prd.md:108) |
| I-5 | Sesja i odpowiedzi należą do zalogowanego użytkownika | Access Control (prd.md:120) |
| I-6 | letter→note: dokładnie jedna z 3 opcji ma literę = literze-promptowi | guardrail accuracy (prd.md:43) |
| I-7 | Dobór adaptacyjny: ~70% slotów ważone ku błędom z ≤5 ostatnich ukończonych sesji | Business Logic (prd.md:112-116) |

---

## KROK 2 — Klasyfikacja i wybór #1

Trzy osie: **(a) rdzeniowość** (czy dotyka sensu produktu), **(b) rozsmarowanie**
(w ilu warstwach żyje), **(c) egzekwowanie** (egzekwowany / deklarowany / naruszalny).

| # | (a) Rdzeniowość | (b) Rozsmarowanie | (c) Egzekwowanie | Werdykt |
| --- | --- | --- | --- | --- |
| **I-1** | **Najwyższa** — *to jest* guardrail "non-negotiable" | **5 warstw** (domena/UI/transport/API/DB) | **Naruszalny** — serwer ufa klientowi; payload nie niesie nawet danych do przeliczenia | **#1** |
| I-2 | Wysoka (zła nuta uczy błędu) | 2 warstwy (API `isPitch`, brak w DB) | Częściowo — `isPitch` [sessions.ts:49](src/pages/api/sessions.ts:49); brak DB CHECK [migration:17](supabase/migrations/20260528214850_create_session_tables.sql:17) | #2 (domykany razem) |
| I-3 | Średnia | API + DB | **Egzekwowany** — [sessions.ts:62](src/pages/api/sessions.ts:62), DB CHECK [migration:6](supabase/migrations/20260528214850_create_session_tables.sql:6) | ok |
| I-4 | Wysoka | API + DB | **Naruszalny** — 2 osobne upserty, `ignoreDuplicates`; charakteryzacja udowadnia lukę [sessions.integration.test.ts:180](src/pages/api/sessions.integration.test.ts:180) | #3 (domykany razem) |
| I-5 | Średnia | API + RLS | Egzekwowany — RLS WITH CHECK [migration:33](supabase/migrations/20260528214850_create_session_tables.sql:33) | ok |
| I-6 | Wysoka | domena | Egzekwowany (czysta funkcja) [exercises.ts:220](src/components/drill/exercises.ts:220) | ok |
| I-7 | Najwyższa (*wedge*) | SSR + domena + DB | Egzekwowany (działa); rozjazd obietnicy ≠ luka egzekwowania | osobny temat |

**Wybór #1 — I-1 (prawdziwość werdyktu).** Jest jednocześnie **najbardziej rdzeniowy**
(jest dosłownie guardrailem, którego PRD nazywa "non-negotiable", bo zła ocena uczy
dziecko błędu) **i najsłabiej egzekwowany**: jedynym strażnikiem jest klient
([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107)), a granica zapisu
*deklaruje* zaufanie zamiast chronić ([sessions.ts:15-16](src/pages/api/sessions.ts:15)).
Co gorsza — **serwer nie może dziś przeliczyć werdyktu, nawet gdyby chciał**: payload
nie niesie wyboru dziecka ([saveSession.ts:23-28](src/components/drill/saveSession.ts:23)),
bo `chosenLetter`/`chosenPitch` są z założenia "never persisted"
([exercises.ts:186-200](src/components/drill/exercises.ts:186)). To maksymalna luka
wartość×ryzyko: niezmiennik najbliższy rdzeniowi produktu jest egzekwowany najdalej od
miejsca, gdzie dane trwają. I-2 i I-4 to *ten sam agregat* (Answer wewnątrz Session),
więc domykam je w tym samym refaktorze jako obronę w głąb.

---

## KROK 3 — Diagnoza I-1 (gdzie dziś żyje reguła)

**Pełna ścieżka werdyktu (zweryfikowana):**

1. **Liczony tylko na kliencie.** `note_to_letter`:
   `isCorrect = letter === pitchToLetter(current.pitch)` ([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107)).
   `letter_to_note`: `isCorrect = pitchToLetter(pitch) === current.promptLetter`
   ([DrillSession.tsx:118](src/components/drill/DrillSession.tsx:118)). Logika prawdy
   poprawna, ale **inline w event-handlerze islandu** — nie ma nazwanej, współdzielonej
   funkcji domenowej oceny.

2. **Wybór gubiony na granicy transportu.** `saveSession` mapuje tylko
   `exercise_type`, `note`, `is_correct` ([saveSession.ts:23-28](src/components/drill/saveSession.ts:23)).
   `chosenLetter`/`chosenPitch` zostają w pamięci ([exercises.ts:186-200](src/components/drill/exercises.ts:186)).
   ⇒ **serwer dostaje werdykt bez przesłanek** — nie da się go zweryfikować.

3. **Serwer jawnie ufa.** Docstring: *"it trusts the client's `is_correct` verdict"*
   ([sessions.ts:15-16](src/pages/api/sessions.ts:15)). `parseBody` sprawdza wyłącznie
   `typeof is_correct !== "boolean"` ([sessions.ts:71](src/pages/api/sessions.ts:71))
   i wpisuje wartość 1:1 ([sessions.ts:127](src/pages/api/sessions.ts:127)).

4. **Schemat nie chroni.** `is_correct boolean not null` — brak związku z `note`
   ([migration:18](supabase/migrations/20260528214850_create_session_tables.sql:18)).
   `note text not null` **bez CHECK zakresu** (I-2) ([migration:17](supabase/migrations/20260528214850_create_session_tables.sql:17)).

5. **Skażenie rdzenia.** Widok `note_error_stats` liczy błędy z `not a.is_correct`
   ([migration:65](supabase/migrations/20260528214850_create_session_tables.sql:65)).
   ⇒ fałszywy werdykt **biasuje dobór adaptacyjny** (I-7) — produktowy *wedge* je dane,
   którym nikt nie zaufałby, gdyby je przeliczył.

**Klasyfikacja patologii:**

- **Klient jako jedyny strażnik** — prawda muzyczna liczona wyłącznie front-side.
- **Reguła rozproszona, niespójnie egzekwowana** — 5 warstw dotyka werdyktu/nuty,
  żadna nie jest jego *autorytetem*.
- **Połknięcie zamiast zatrzymania** — zepsuty/sfałszowany/zbugowany klient zapisuje
  `is_correct: true` dla błędnej odpowiedzi i **dostaje 200**; nieprawda trwa cicho.
- **Brak danych do egzekwowania** — luka strukturalna: payload trzeba *rozszerzyć*, nie
  tylko dodać walidację.

---

## KROK 4 — Projekt agregatu-strażnika

Agregat: **`Session` (root) z encjami `Answer`**. Jedyne miejsce, gdzie powstaje werdykt.
Zasada: **klient proponuje wybór, agregat orzeka prawdę.** Feedback <200 ms (NFR
prd.md:105) zostaje na kliencie, ale **autorytet werdyktu przenosi się na serwer.**

### 4.1 Funkcja domenowa oceny (jedyne źródło prawdy)

Wyniesiona z inline'u w DrillSession do `exercises.ts`, współdzielona przez klient
(feedback) i serwer (autorytet):

```ts
// src/components/drill/exercises.ts  (czysta, render-free — tak jak reszta modułu)

/** Wybór dziecka, dyskryminowany typem ćwiczenia. */
export type Choice =
  | { type: typeof EXERCISE_TYPE_NOTE_TO_LETTER; chosenLetter: Letter }
  | { type: typeof EXERCISE_TYPE_LETTER_TO_NOTE; chosenPitch: Pitch };

/**
 * JEDYNE źródło werdyktu. Liczy is_correct z pitchToLetter — nie przyjmuje
 * gotowego is_correct znikąd. note = nuta wyświetlona / nuta-cel.
 */
export function gradeAnswer(note: Pitch, choice: Choice): boolean {
  if (choice.type === EXERCISE_TYPE_NOTE_TO_LETTER)
    return choice.chosenLetter === pitchToLetter(note);
  return pitchToLetter(choice.chosenPitch) === pitchToLetter(note);
}
```

DrillSession.tsx:107/118 zaczyna wołać `gradeAnswer` zamiast inline'u — zero zmiany
zachowania, jeden punkt prawdy.

### 4.2 Agregat-root z preconditions (rzuca, nie loguje)

```ts
// src/domain/session.ts  (nowy — czysta domena, bez Supabase/React)

export class InvalidExerciseCount extends Error {}   // count ∉ {5,10,20}
export class AnswerCountMismatch extends Error {}     // answers.length ≠ count
export class NoteOutOfRange extends Error {}          // note ∉ PITCHES   (I-2)
export class InvalidExerciseType extends Error {}     // typ spoza zbioru
export class InvalidChoice extends Error {}           // wybór niespójny z typem

export interface GradedAnswer {
  id: string; exerciseType: ExerciseType; note: Pitch;
  choice: Choice; isCorrect: boolean;   // policzone TU, nie przyjęte
}

export class Session {
  private constructor(
    readonly id: string, readonly userId: string,
    readonly exerciseCount: ExerciseCount, readonly startedAt: string,
    readonly answers: readonly GradedAnswer[],
  ) {}

  /**
   * Jedyny konstruktor ukończonej sesji. Waliduje WSZYSTKIE niezmienniki
   * (I-1..I-3) i SAM liczy is_correct. Nielegalne wejście => named throw,
   * NIGDY cichy zapis częściowy.
   */
  static complete(input: {
    id: string; userId: string; exerciseCount: number;
    startedAt: string; answers: { id: string; note: string; choice: Choice }[];
  }): Session {
    if (!isExerciseCount(input.exerciseCount)) throw new InvalidExerciseCount();      // I-3
    if (input.answers.length !== input.exerciseCount) throw new AnswerCountMismatch(); // I-3
    const graded = input.answers.map((a) => {
      if (!isPitch(a.note)) throw new NoteOutOfRange(a.note);                          // I-2
      if (!isValidChoice(a.choice)) throw new InvalidChoice();                         // typ/wybór
      return { id: a.id, exerciseType: a.choice.type, note: a.note,
               choice: a.choice, isCorrect: gradeAnswer(a.note, a.choice) };           // I-1
    });
    return new Session(input.id, input.userId, input.exerciseCount, input.startedAt, graded);
  }
}
```

Kluczowe: `is_correct` **nie istnieje w wejściu** — nie da się go sfałszować, bo nie da
się go *podać*. Zakres nuty (I-2) jest precondition agregatu, nie tylko CHECK w DB.

### 4.3 Repozytorium ładujące/zapisujące cały agregat (atomowość I-4)

Dziś zapis to dwa osobne upserty z `ignoreDuplicates`
([sessions.ts:104](src/pages/api/sessions.ts:104), [:130](src/pages/api/sessions.ts:130)) —
nietransakcyjny; charakteryzacja dowodzi reprezentowalności "ukończona sesja, 0 odpowiedzi"
([sessions.integration.test.ts:180](src/pages/api/sessions.integration.test.ts:180)).
Agregat wymusza całość-albo-nic. W Supabase atomowość 2 tabel ⇒ **RPC plpgsql** w jednej
transakcji:

```sql
-- nowa migracja: jedna transakcja => I-4 (atomowość)
create function save_completed_session(payload jsonb)
returns void language plpgsql security invoker as $$
begin
  insert into sessions (id, user_id, exercise_count, started_at, finished_at)
  values (...) on conflict (id) do nothing;       -- idempotencja zachowana
  insert into answers (id, session_id, user_id, exercise_type, note, is_correct)
  select ... from jsonb_to_recordset(payload->'answers') ...
  on conflict (id) do nothing;
end $$;   -- funkcja = jedna transakcja: obie wstawki albo żadna
```

```ts
// src/domain/sessionRepository.ts
export async function save(supabase, s: Session): Promise<void> {
  const { error } = await supabase.rpc("save_completed_session", { payload: toJson(s) });
  if (error) throw new SaveFailed(error);    // fail-fast — nie 200
}
```

RLS `WITH CHECK (user_id = auth.uid())` zostaje (I-5) — `security invoker` zachowuje je
w funkcji.

### 4.4 Cienki route: parse → agregat → mapowanie błędu

```ts
// src/pages/api/sessions.ts  (POST — odchudzony)
const user = await requireUser(supabase);                    // 401 jak dziś
const raw = parseBody(await req.json());                     // STRUKTURA: id, count,
if (!raw) return json({ error: "Invalid payload" }, 400);    // started_at, answers[{id,note,choice}]
                                                             // UWAGA: is_correct NIE jest przyjmowane
try {
  const session = Session.complete({ ...raw, userId: user.id });  // serwer ORZEKA werdykt
  await save(supabase, session);                                  // atomowo
  return json({ ok: true }, 200);
} catch (e) {
  if (e instanceof NoteOutOfRange || e instanceof InvalidChoice
   || e instanceof AnswerCountMismatch || e instanceof InvalidExerciseCount)
    return json({ error: e.constructor.name }, 422);   // nielegalna domena => 422, brak zapisu
  if (e instanceof SaveFailed) return json({ error: "Failed to save session" }, 500);
  throw e;
}
```

`parseBody` przestaje czytać `is_correct` ([sessions.ts:67](src/pages/api/sessions.ts:67),
[:71](src/pages/api/sessions.ts:71)); zaczyna walidować `choice`. **Egzekucja przenosi się
z klienta na serwer.**

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before / after (każde dzisiejsze miejsce reguły)

| Miejsce | Before | After |
| --- | --- | --- |
| [DrillSession.tsx:107,118](src/components/drill/DrillSession.tsx:107) | werdykt inline, jedyny autorytet | woła `gradeAnswer` (współdzielona); tylko feedback, nie autorytet |
| [saveSession.ts:23-28](src/components/drill/saveSession.ts:23) | wysyła `is_correct`, gubi wybór | wysyła `choice` (letter/pitch), **nie** wysyła `is_correct` |
| [sessions.ts:15-16,71,127](src/pages/api/sessions.ts:15) | ufa `is_correct`, sprawdza boolean | nie przyjmuje `is_correct`; `Session.complete` liczy go z `gradeAnswer` |
| [sessions.ts:104,130](src/pages/api/sessions.ts:104) | 2 nietransakcyjne upserty | jeden RPC w transakcji (I-4) |
| [migration:17](supabase/migrations/20260528214850_create_session_tables.sql:17) | `note text` bez CHECK | `+ check (note in ('C4',...,'A5'))` (I-2, obrona w głąb) |
| inline w DrillSession | reguła oceny rozproszona | `gradeAnswer` — jeden punkt prawdy |

### 5.2 Plan faz (test-first tam, gdzie projekt to umożliwia)

Projekt ma dyscyplinę test-first (test-plan.md §1, Vitest, `*.integration.test.ts`).
Risk Map test-planu już nazywa lukę I-4 (Risk #3) — ten refaktor ją domyka.

| Faza | Zakres | Test-first? | Warstwa |
| --- | --- | --- | --- |
| **F-1** | Wynieś `gradeAnswer` + `Choice` do exercises.ts; przełącz DrillSession na nią (bez zmiany zachowania) | **TAK** | unit (Vitest) |
| **F-2** | `src/domain/session.ts`: `Session.complete` + błędy domenowe; testy preconditions | **TAK** | unit |
| **F-3** | Rozszerz payload (`choice`, usuń `is_correct`) w saveSession + parseBody; serwer liczy werdykt | **TAK** | unit + integration |
| **F-4** | DB CHECK zakresu `note` (migracja) + test wymuszonego błędu (wzór [sessions.integration.test.ts:122](src/pages/api/sessions.integration.test.ts:122)) | **TAK** | integration |
| **F-5** | RPC `save_completed_session` (atomowość); **promuj** charakteryzacje I-4 do asercji ([:145](src/pages/api/sessions.integration.test.ts:145), [:180](src/pages/api/sessions.integration.test.ts:180)) | **TAK** | integration |
| **F-6** | Aktualizacja cookbook test-plan §6 + rejestr kontraktów (5.4) | — | docs |

Kolejność krytyczna: **F-3 wymaga F-1+F-2** (musi istnieć współdzielona prawda, zanim
serwer zacznie orzekać). F-4/F-5 to obrona w głąb po przeniesieniu autorytetu.

### 5.3 Przypadki testowe niezmiennika I-1 (legalne i nielegalne)

**Unit — `gradeAnswer` / `Session.complete`:**
- ✅ `note_to_letter`, `note=B4`, `chosenLetter="H"` ⇒ `is_correct=true` (konwencja H/B).
- ✅ `note_to_letter`, `note=C4`, `chosenLetter="D"` ⇒ `false`.
- ✅ `letter_to_note`, `note=C5`, `chosenPitch="C4"` ⇒ `true` (różna oktawa, ta sama litera).
- ✅ `letter_to_note`, `note=E4`, `chosenPitch="F4"` ⇒ `false`.
- ❌ `Session.complete` z `answers.length ≠ exercise_count` ⇒ `AnswerCountMismatch`.
- ❌ `note="H4"` lub `"Z9"` ⇒ `NoteOutOfRange` (I-2), **nie** cichy zapis.
- ❌ `exercise_count=7` ⇒ `InvalidExerciseCount` (I-3).
- ❌ `choice` niespójny z typem ćwiczenia ⇒ `InvalidChoice`.

**Integration (realny Supabase) — autorytet werdyktu:**
- ✅ **Sfałszowany werdykt jest korygowany:** klient *nie* może już podać `is_correct`;
  payload z błędną odpowiedzią (`note_to_letter`, `note=C4`, `chosenLetter="D"`) trafia do
  DB jako `is_correct=false`, niezależnie od intencji klienta. (Dziś: zapisałby `true`.)
- ✅ **Poza-zakresowa nuta odrzucona przy zapisie** ⇒ 422, brak wiersza (CHECK + precondition).
- ✅ **Atomowość:** wymuś błąd wstawki odpowiedzi ⇒ sesja również nie powstaje (I-4);
  promocja charakteryzacji [:180](src/pages/api/sessions.integration.test.ts:180).
- ✅ Idempotencja retry zachowana (ten sam `id` ⇒ no-op) — RPC `on conflict do nothing`.
- ✅ RLS bez regresu: obcy `user_id` odrzucony (I-5), wzór [:205](src/pages/api/sessions.integration.test.ts:205).

### 5.4 Nowe nazwy "load-bearing" do rejestru kontraktów

`gradeAnswer`, `Choice`, `Session` (agregat-root), `Session.complete`, `GradedAnswer`,
`save` (SessionRepository), RPC `save_completed_session`, oraz błędy domenowe:
`InvalidExerciseCount`, `AnswerCountMismatch`, `NoteOutOfRange`, `InvalidExerciseType`,
`InvalidChoice`, `SaveFailed`. Kontrakt nadrzędny: **`is_correct` nie pojawia się w żadnym
wejściu od klienta** — to znika z payloadu i z `parseBody`.

---

## Podsumowanie

Niezmiennikiem #1 jest **prawdziwość werdyktu `is_correct`** (I-1): równość werdyktu z
prawdą muzyczną liczoną z `pitchToLetter`. Wybrałem go, bo jest jednocześnie najbardziej
rdzeniowy — to dosłownie guardrail PRD "musical accuracy is non-negotiable" (prd.md:43) —
i najsłabiej egzekwowany: dziś liczy go i jest mu *ufany* wyłącznie klient
([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107),
[sessions.ts:15-16](src/pages/api/sessions.ts:15)), a payload nie niesie nawet danych do
jego przeliczenia ([saveSession.ts:23-28](src/components/drill/saveSession.ts:23)). Luka jest
strukturalna, nie kosmetyczna — fałszywy werdykt trwa cicho (200 OK) i skaża rdzeniowy dobór
adaptacyjny przez widok `note_error_stats`. Projekt agregatu `Session` przenosi autorytet z
klienta na serwer: nazwana funkcja `gradeAnswer` jako jedyne źródło prawdy, `Session.complete`
z preconditions rzucającymi nazwane błędy domenowe (nigdy cichy zapis), transakcyjne
repozytorium domykające atomowość (I-4) oraz CHECK zakresu nuty (I-2) jako obrona w głąb.
Refaktor idzie test-first w 6 fazach i domyka także Risk #3 z istniejącego test-planu, a
kluczowy nowy kontrakt brzmi: klient proponuje wybór, serwer orzeka prawdę — `is_correct`
przestaje być wejściem.
