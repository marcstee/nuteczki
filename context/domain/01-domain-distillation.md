---
title: "Nuteczki — Domain Distillation"
created: 2026-06-15
type: domain-distillation
---

# Destylacja domeny — Nuteczki

> Mapa domeny, nie kod. Odkryta z dokumentów źródłowych + weryfikacji kodu.
> Każde pojęcie ma cytat ze źródła i lokalizację w kodzie (lub adnotację "BRAK w kodzie").

## KROK 0 — Kontekst projektu

**Dokumenty źródłowe (znalezione):**

- `context/foundation/prd.md` (v1, greenfield, web-app) — główne źródło wizji i wymagań (FR-001…FR-009, US-01/US-02, guardrail, non-goals).
- `context/foundation/roadmap.md` (v4) — kolejność i waga prawdopodobieństwa; wszystkie slice'y (F-01…F-03, S-01…S-07) oznaczone `done`.
- `context/archive/<change-id>/` — 14 zarchiwizowanych slice'ów (plan.md / research.md) jako materiał historyczny.
- `CLAUDE.md` (root) — stack i reguły repo.

**Stack i struktura (ustalone z kodu):** Astro v6 SSR + React 19 islands, Supabase (auth + Postgres + RLS), Cloudflare Workers, TypeScript strict.

Gdzie żyje logika biznesowa:

| Warstwa | Lokalizacja | Rola domenowa |
| --- | --- | --- |
| Domena (czysta, render-free) | `src/components/drill/exercises.ts`, `src/components/staff/pitch.ts`, `src/components/history/sessionSummary.ts` | Jedyne źródło prawdy muzycznej i reguł doboru/oceny |
| API / persystencja | `src/pages/api/sessions.ts` + `supabase/migrations/*.sql` | Zapis sesji, walidacja, RLS, widok adaptacyjny |
| UI (islands) | `DrillSession.tsx`, `NoteToLetterExercise.tsx`, `LetterToNoteExercise.tsx`, `Staff.tsx` | Maszyna stanów drilla, scoring, render pięciolinii |
| SSR (build danych) | `src/pages/drill.astro`, `src/pages/history.astro` | Budowa wag adaptacyjnych i widoku historii server-side |
| Dostęp | `src/middleware.ts` | Strażnik tras chronionych |

**Ograniczenie:** dokumenty wymagań są bogate (PRD + roadmap + archiwum), więc destylacja opiera się głównie na nich; kod weryfikuje egzekwowanie. Brak osobnego `tech-stack.md` w odczycie nie był blokujący — stack wyprowadzony z `CLAUDE.md` i kodu.

---

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja | Cytat źródłowy | Życie w kodzie |
| --- | --- | --- | --- |
| **Pitch (nuta)** | Jedna z 13 diatonicznych wysokości zakresu początkującego C4→A5 (jedna linia dodana pod do jednej nad pięciolinią) | PRD non-goal: "No notes outside the ledger-line range (first lower to first upper ledger line)" (prd.md:126) | `Pitch` typ + `PITCHES` ([pitch.ts:16](src/components/staff/pitch.ts:16), [pitch.ts:19](src/components/staff/pitch.ts:19)) |
| **Letter (litera)** | Nazwa nuty jako jeden z 7 przycisków odpowiedzi: C, D, E, F, G, A, **H** | FR-004: "pick the correct letter name (C, D, E, F, G, A, H)" (prd.md:87) | `Letter`, `LETTERS` ([exercises.ts:18](src/components/drill/exercises.ts:18), [:21](src/components/drill/exercises.ts:21)) |
| **Konwencja H/B** | Naukowe `B4` etykietowane jako `H` (polski/niemiecki zapis) | FR-004 lista liter zawiera H, nie B (prd.md:87) | `PITCH_LETTER` mapuje `B4→"H"` ([exercises.ts:76](src/components/drill/exercises.ts:76)) |
| **Staff step** | Pozycja nuty na pięciolinii (E4 = 0, +1 na każdy krok diatoniczny w górę) | guardrail: "Notes must display correctly on the staff — musical accuracy is non-negotiable" (prd.md:43) | `STAFF_STEP`, `pitchToStaffStep` ([pitch.ts:27](src/components/staff/pitch.ts:27)) |
| **Exercise (ćwiczenie)** | Pojedyncze zadanie jednego z dwóch typów: `note_to_letter` / `letter_to_note` | FR-004 / FR-005 (prd.md:87, :90) | `Exercise` (dyskryminowany union) ([exercises.ts:171](src/components/drill/exercises.ts:171)); stałe `EXERCISE_TYPE_*` ([:27](src/components/drill/exercises.ts:27), [:34](src/components/drill/exercises.ts:34)) |
| **note→letter** | Dziecko widzi nutę na pięciolinii, wybiera literę z 7 przycisków | FR-004 (prd.md:87) | `NoteToLetterExercise.tsx`; scoring [DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107) |
| **letter→note** | Dziecko widzi literę, wybiera nutę spośród 3 wizualnych opcji | FR-005 (prd.md:90) | `letterToNoteOptions` ([exercises.ts:220](src/components/drill/exercises.ts:220)); scoring [DrillSession.tsx:118](src/components/drill/DrillSession.tsx:118) |
| **Session (sesja)** | Drill o ustalonej liczbie ćwiczeń (5/10/20), auto-kończący się po ostatnim z wyświetleniem statystyk | FR-002 (prd.md:77), FR-007 (prd.md:83) | tabela `sessions` ([migration:3](supabase/migrations/20260528214850_create_session_tables.sql:3)); maszyna stanów `setup→active→finished` ([DrillSession.tsx:25](src/components/drill/DrillSession.tsx:25)) |
| **Answer (odpowiedź)** | Pojedyncza udzielona odpowiedź: typ ćwiczenia, nuta-cel, czy poprawna | US-01 acceptance (prd.md:53-57) | `AnswerRecord` ([exercises.ts:188](src/components/drill/exercises.ts:188)); tabela `answers` ([migration:12](supabase/migrations/20260528214850_create_session_tables.sql:12)) |
| **is_correct (werdykt)** | Czy odpowiedź zgadza się z prawdą muzyczną | FR-006: "showing whether the answer was correct or incorrect" (prd.md:93) | liczone klient-side ([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107), [:118](src/components/drill/DrillSession.tsx:118)); zapisywane jako boolean ([sessions.ts:71](src/pages/api/sessions.ts:71)) |
| **Adaptive selection (dobór adaptacyjny)** | Ważenie ćwiczeń ku nutom najczęściej mylonym w ostatnich sesjach (~70% słabe punkty / 30% losowe) | Business Logic (prd.md:112-116), FR-003 (prd.md:80) | `weightedNextPitch` ([exercises.ts:100](src/components/drill/exercises.ts:100)); `buildSession` 70%-slotów ([exercises.ts:268](src/components/drill/exercises.ts:268)) |
| **NoteWeights / error_count** | Wagi `error_count + 1` per (typ, nuta) biasujące dobór | Business Logic: "weighting notes the child has answered incorrectly most often" (prd.md:112) | `NoteWeights` ([exercises.ts:47](src/components/drill/exercises.ts:47)); kolumna `error_count` widoku ([migration:65](supabase/migrations/20260528214850_create_session_tables.sql:65)) |
| **note_error_stats (historia błędów)** | Widok zliczający błędy per nuta/typ z ostatnich (do) 5 ukończonych sesji | Business Logic: "consumes the child's answer history from the last 3–5 sessions" (prd.md:114) | widok `note_error_stats`, `rn <= 5` ([migration:52](supabase/migrations/20260528214850_create_session_tables.sql:52), [:69](supabase/migrations/20260528214850_create_session_tables.sql:69)) |
| **Brak powtórzeń pod rząd** | Dwie kolejne nuty-cele nie mogą być identyczne | BRAK w PRD (reguła wyłącznie implementacyjna) | wykluczenie `previous` ([exercises.ts:105](src/components/drill/exercises.ts:105)); deck [exercises.ts:276](src/components/drill/exercises.ts:276) |
| **Jedna poprawna opcja (letter→note)** | Dokładnie jedna z 3 opcji ma literę równą literze-promptowi | implikowane przez guardrail accuracy (prd.md:43) | `letterToNoteOptions` distinct-letter distractors ([exercises.ts:220](src/components/drill/exercises.ts:220)) |
| **Session stats / accuracy** | Podsumowanie correct/incorrect + % trafności, z rozbiciem na typy | FR-008 (prd.md:97), FR-009 (prd.md:100) | `summarize`, `summarizeByType` ([exercises.ts:131](src/components/drill/exercises.ts:131), [:149](src/components/drill/exercises.ts:149)); `summarizeSessions` ([sessionSummary.ts:61](src/components/history/sessionSummary.ts:61)) |
| **Session history (historia)** | Lista przeszłych sesji odwrotnie chronologicznie, z paginacją i usuwaniem | US-02 (prd.md:59-68) | `summarizeSessions` ([sessionSummary.ts:61](src/components/history/sessionSummary.ts:61)); DELETE [sessions.ts:140](src/pages/api/sessions.ts:140) |
| **Konto współdzielone** | Jedno logowanie dla rodzica i dziecka; brak ról | Access Control: "Single shared account ... No role separation for MVP" (prd.md:120) | `PROTECTED_ROUTES`, brak ról ([middleware.ts:4](src/middleware.ts:4)) |

---

## KROK 2 — Klasyfikacja subdomen

| Subdomena / obszar | Kategoria | Uzasadnienie (cel produktu) |
| --- | --- | --- |
| **Dobór adaptacyjny ćwiczeń** (`weightedNextPitch`, `note_error_stats`, 70/30) | **Core** | To jest *wedge* produktu: "exercises are adaptively weighted toward the child's recent mistakes ... the one trait that, if removed, makes the product indistinguishable from generic flashcards" (roadmap.md:20). FR-003 nazwany "the core domain rule" (prd.md:81). |
| **Poprawność muzyczna** (pitch→staff step, pitch→letter, jedna poprawna opcja) | **Core** | Guardrail: "musical accuracy is non-negotiable. A wrong note position teaches the child incorrect information" (prd.md:43). Bez tego drill uczy błędów — niszczy sens produktu. |
| **Cykl życia + persystencja sesji** (maszyna stanów, zapis, idempotencja) | **Supporting** | Niezbędne dla "completed session data persists reliably ... no silent data loss" (prd.md:108), ale to wspiera rdzeń, nie jest przewagą samą w sobie. |
| **Historia i statystyki sesji** (agregacja, accuracy, paginacja, delete) | **Supporting** | Realizuje US-02 i "accuracy improves across sessions, visible in the session history" (prd.md:39) — kluczowy widok wartości dla rodzica, ale pochodny od danych rdzenia. |
| **Renderowanie pięciolinii (SVG/geometria)** | **Supporting** | Specjalistyczna praca (top blocker "skills", roadmap.md:91), lecz sama prezentacja — prawda muzyczna (Core) żyje w `pitch.ts`, nie w pikselach. |
| **Uwierzytelnianie** (Supabase auth, signin/signup) | **Generic** | "Simple login (email + password or OAuth)" (prd.md:120); standardowe, kupowane z półki (Supabase). |
| **PWA / instalowalność** | **Generic** | NFR dostarczania (prd.md:106); dobrze udokumentowany wzorzec (roadmap.md:104), bez przewagi domenowej. |
| **Kontrola dostępu / middleware** | **Generic** | Brak ról, jedno konto (prd.md:120) — minimalny strażnik tras. |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

| Kandydat na agregat | Niezmiennik (MUSI być zawsze prawdziwy) | Cytat źródłowy | Status egzekwowania |
| --- | --- | --- | --- |
| **Session (root) + Answer (encja)** | Sesja ma dokładnie `exercise_count` odpowiedzi; `exercise_count ∈ {5,10,20}` | FR-002 presety (prd.md:77); auto-finish po ostatnim (FR-007, prd.md:83) | **Egzekwuje** — API odrzuca `answers.length !== exercise_count` ([sessions.ts:62](src/pages/api/sessions.ts:62)); DB CHECK na `exercise_count` ([migration:6](supabase/migrations/20260528214850_create_session_tables.sql:6)) |
| **Session — własność** | Sesja i jej odpowiedzi należą do zalogowanego użytkownika | Access Control (prd.md:120) | **Egzekwuje** — RLS `WITH CHECK (user_id = auth.uid())` + `user_id` z `auth.getUser()` ([migration:32](supabase/migrations/20260528214850_create_session_tables.sql:32), [sessions.ts:85](src/pages/api/sessions.ts:85)) |
| **Answer — ważność muzyczna** | `note` zawsze w zakresie C4–A5; `exercise_type` z dozwolonego zbioru | non-goal zakres (prd.md:126); guardrail (prd.md:43) | **Częściowo** — `exercise_type` ma DB CHECK ([migration:16](supabase/migrations/20260528214850_create_session_tables.sql:16)); `note` to zwykły `text` **bez CHECK** ([migration:18](supabase/migrations/20260528214850_create_session_tables.sql:18)). Zakres egzekwowany tylko w API `isPitch` ([sessions.ts:49](src/pages/api/sessions.ts:49)) |
| **Answer — prawdziwość werdyktu** | `is_correct` odzwierciedla prawdę muzyczną odpowiedzi | guardrail "musical accuracy is non-negotiable" (prd.md:43); FR-006 (prd.md:93) | **Ignoruje (na granicy zapisu)** — API jawnie ufa klientowi: "it trusts the client's `is_correct` verdict" ([sessions.ts:16-18](src/pages/api/sessions.ts:16)). Werdykt liczony tylko klient-side ([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107)) |
| **Generated Deck (talia ćwiczeń)** | Brak dwóch identycznych nut-celów pod rząd; w letter→note dokładnie jedna poprawna opcja; zbalansowany podział typów (ceil/floor) | brak powtórzeń/jednoznaczność — implikowane przez guardrail; mix typów z US-01 (prd.md:51) | **Egzekwuje (in-memory)** — `buildSession` / `letterToNoteOptions` ([exercises.ts:254](src/components/drill/exercises.ts:254), [:220](src/components/drill/exercises.ts:220)); czysta funkcja, nie utrwalana |
| **AnswerHistory (note_error_stats)** | `error_count` = liczba błędnych odpowiedzi; tylko z ukończonych sesji; okno ≤ 5 sesji | Business Logic (prd.md:114) | **Egzekwuje** — widok: `count(*) filter (where not a.is_correct)`, `finished_at is not null`, `rn <= 5` ([migration:65](supabase/migrations/20260528214850_create_session_tables.sql:65), [:59](supabase/migrations/20260528214850_create_session_tables.sql:59), [:69](supabase/migrations/20260528214850_create_session_tables.sql:69)) |

---

## KROK 4 — Rozjazdy MODEL vs KOD

| # | Dokument mówi (X) | Kod robi (Y) | Dowód | Ocena |
| --- | --- | --- | --- | --- |
| D-1 | "approximately **70% of exercises target frequently-missed notes**, and 30% are randomly selected" (prd.md:114) | 70% **slotów** dostaje *losowanie ważone* z bazą `error_count + 1`; przy małych/zerowych błędach slot ważony jest niemal jednostajny — więc **nie** gwarantuje, że 70% ćwiczeń trafi w mylone nuty | `weightedCount = Math.round(0.7 * count)` ([exercises.ts:268](src/components/drill/exercises.ts:268)); baza `+1` na całej puli ([exercises.ts:106](src/components/drill/exercises.ts:106)) | Rozsądna interpretacja mechanizmu, ale **obietnica wyniku ≠ implementacja**. Bias jest "miękki" i rozcieńczony bazą +1 |
| D-2 | "randomly selected from 2 types" — typ ćwiczenia dobierany losowo per ćwiczenie (prd.md:51) | Deterministyczny **zbalansowany** podział `ceil(count/2)` note→letter + `floor(count/2)` letter→note, dopiero potem tasowana kolejność | [exercises.ts:259](src/components/drill/exercises.ts:259) | Kod daje *gwarantowany* mix 50/50 zamiast losowego — lepsze dla nauki, ale rozjazd z literą PRD |
| D-3 | "consumes ... the last **3–5 sessions**" (prd.md:114) | Stałe okno **5** sesji (`rn <= 5`); brak dolnego progu/wariantu 3 | [migration:69](supabase/migrations/20260528214850_create_session_tables.sql:69) | Drobny; mieści się w zakresie, ale "3–5" zredukowane do twardej 5 |
| D-4 | Guardrail: "musical accuracy is **non-negotiable**" (prd.md:43) | Werdykt `is_correct` liczony i **ufany** od klienta; serwer go nie przelicza | [sessions.ts:16-18](src/pages/api/sessions.ts:16), [DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107) | Granica zapisu nie chroni "nienegocjowalnej" prawdy — zepsuty/sfałszowany klient może zapisać błędny werdykt |
| D-5 | non-goal: "No notes outside the ledger-line range" (prd.md:126) | Kolumna `answers.note` to wolny `text` bez ograniczenia zakresu; pilnowane tylko w warstwie aplikacji | [migration:18](supabase/migrations/20260528214850_create_session_tables.sql:18) vs `isPitch` [sessions.ts:49](src/pages/api/sessions.ts:49) | Reguła zakresu istnieje w domenie/API, ale **nie w schemacie** — persystencja przyjmie dowolny string |
| D-6 | "weighting notes the child has answered incorrectly" — bez wzmianki o per-typ (prd.md:112) | Wagi liczone i stosowane **per (typ ćwiczenia, nuta)** | `NoteWeights` keyed by type ([exercises.ts:47](src/components/drill/exercises.ts:47)); `group by ... a.exercise_type` ([migration:70](supabase/migrations/20260528214850_create_session_tables.sql:70)) | Wzbogacenie ponad PRD (sensowne — różne umiejętności per typ), nie regres |

---

## KROK 5 — Ranking refaktoru

Uszeregowanie wg **wartości** (jak rdzeniowy niezmiennik) × **ryzyka** (jak słabo dziś egzekwowany):

| Ranga | Kandydat | Wartość | Ryzyko (słabość egzekwowania) |
| --- | --- | --- | --- |
| **#1** | **Agregat Session/Answer: ważność muzyczna + prawdziwość werdyktu** (D-4, D-5) | **Najwyższa** — dotyka guardrail "non-negotiable" (prd.md:43), rdzeń sensu produktu | **Najwyższe** — `is_correct` w pełni ufany klientowi (sessions.ts:16), `note` bez DB CHECK (migration:18); invariant rozproszony na 3 warstwy (klient/API/DB), egzekwowany najsłabiej tam gdzie dane trwają |
| **#2** | **Kontrakt doboru adaptacyjnego** (D-1) | **Najwyższa** — to *wedge* produktu (roadmap.md:20) | Średnie — działa jak zaprojektowano, ale realne zachowanie ("70% trafia w błędy") rozjeżdża się z obietnicą; brak testu wiążącego wynik z obietnicą |
| **#3** | **Generated Deck** (brak powtórzeń, jedna poprawna opcja) | Wysoka — accuracy-critical | Niskie — dobrze enkapsulowane w czystych funkcjach (`buildSession`, `letterToNoteOptions`) |
| **#4** | **AnswerHistory (note_error_stats)** | Wspierająca rdzeń | Niskie — niezmienniki egzekwowane w SQL widoku |

**#1 do refaktoru — i dlaczego:** *Session jako agregat-root, który sam egzekwuje ważność i prawdziwość swoich Answers.* Dziś "nienegocjowalna" poprawność muzyczna jest faktem obliczanym i ufanym po stronie klienta ([DrillSession.tsx:107](src/components/drill/DrillSession.tsx:107)), a granica zapisu jedynie *deklaruje* zaufanie ([sessions.ts:16](src/pages/api/sessions.ts:16)) zamiast chronić niezmiennik; do tego schemat nie ogranicza `note` do zakresu C4–A5 ([migration:18](supabase/migrations/20260528214850_create_session_tables.sql:18)). To największa luka wartość×ryzyko: invariant najbliższy rdzeniowi produktu jest egzekwowany najdalej od miejsca, gdzie dane są trwałe. Konsolidacja (DB CHECK na zakresie `note`; opcjonalna serwerowa re-walidacja werdyktu z pojedynczego źródła `pitchToLetter`) domknęłaby guardrail bez naruszania granicy Astro→React.

---

## Negatywna przestrzeń (czego domena świadomie NIE modeluje)

- **Czas trwania nut** — non-goal v1 (prd.md:124); poza modelem.
- **Akordy / interwały** — tylko pojedyncze nuty (prd.md:125).
- **Role rodzic/dziecko** — jedno konto, brak separacji (prd.md:120); brak bytu "User role".
- **Trendy/wykresy** — historia to lista + prosty % accuracy, nie analityka (prd.md:101).
