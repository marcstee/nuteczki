---
title: "Nuteczki — Warstwa antykorupcyjna dla Supabase (plan refaktoru)"
created: 2026-06-15
type: refactor-plan
---

# Warstwa antykorupcyjna dla Supabase — Nuteczki

> PLAN refaktoru, nie implementacja. Nie modyfikuje kodu produkcyjnego.
> Buduje na [01-domain-distillation.md](01-domain-distillation.md) i
> [02-invariant-aggregate-refactor.md](02-invariant-aggregate-refactor.md), ale
> przeciekającą zależność wybrano niezależnie, z weryfikacją cytatów plik:linia
> w bieżącym kodzie (`grep` + odczyt).

---

## KROK 0 — Kontekst (potwierdzony)

**Dokumenty:** `prd.md` (wizja, FR-001…009), `tech-stack.md` (`has_auth: true`,
Supabase jako jedyna technologicznie wymuszająca funkcja), `infrastructure.md`
(Cloudflare Workers, limity subrequestów do Supabase), `01`/`02` z `context/domain/`.

**Stack (z kodu):** Astro v6 SSR + React 19 islands, **Supabase** w dwóch pakietach
— `@supabase/ssr` (klient serwerowy, cookie-auth) i `@supabase/supabase-js` (typy +
helper testowy), Postgres + RLS, Cloudflare Workers, TypeScript strict.

**Zależności zewnętrzne wciągnięte do kodu aplikacji** (`grep -rn "@supabase" src/`):

| Pakiet | Rola | Pierwszy punkt wejścia |
| --- | --- | --- |
| `@supabase/ssr` | budowa cookie-authed klienta SSR | [supabase.ts:1](src/lib/supabase.ts:1) |
| `@supabase/supabase-js` | typ `User` + klient testowy | [env.d.ts:3](src/env.d.ts:3), [supabase-it.ts:18](src/test/supabase-it.ts:18) |
| `Database` (typy generowane) | kontrakt schematu PostgREST | [database.types.ts](src/db/database.types.ts) |

**Deklaracja wymienialności (rozjazd intencja↔kod).** `tech-stack.md` pozycjonuje
Supabase jako komponent dobrany pod cztery bramki „agent-friendly" („removing the
need for a separate auth provider or database setup"), a `infrastructure.md`
swobodnie rozważa **wymianę adaptera deploymentu** („No adapter swap…required",
infrastructure.md:17; „swapping the Astro adapter", :38) — czyli zespół myśli
kategoriami wymienialnych warstw infrastrukturalnych. **Mimo to żadna warstwa
antykorupcyjna nad samym Supabase nie istnieje**: SDK jest wołane bezpośrednio w
middleware, API i frontmatterze SSR. Intencja „warstwy się wymienia" nie jest w
kodzie domeny dotrzymana wobec największego dostawcy (auth + dane).

---

## KROK 1 — Identyfikacja przecieków (pełna lista plik:linia)

Supabase przecieka przez **cztery warstwy** kodu. Każdy plik poniżej „zna" dziś
kształt zależności (typ biblioteki, builder zapytań PostgREST lub idiom auth GoTrue):

| # | Plik:linia | Warstwa | Co przecieka |
| --- | --- | --- | --- |
| L1 | [supabase.ts:1](src/lib/supabase.ts:1), [:10](src/lib/supabase.ts:10) | lib/factory | `createServerClient`, `parseCookieHeader`, generyk `<Database>` |
| L2 | [middleware.ts:2](src/middleware.ts:2), [:7](src/middleware.ts:7), [:12](src/middleware.ts:12) | edge / guard | `supabase.auth.getUser()` na każde żądanie |
| L3 | [env.d.ts:3](src/env.d.ts:3) | **typy ambient (app-wide)** | `App.Locals.user: import("@supabase/supabase-js").User` |
| L4 | [api/auth/signin.ts:9](src/pages/api/auth/signin.ts:9), [:13](src/pages/api/auth/signin.ts:13) | API | `supabase.auth.signInWithPassword`, `error.message` |
| L5 | [api/auth/signup.ts:9](src/pages/api/auth/signup.ts:9), [:13](src/pages/api/auth/signup.ts:13) | API | `supabase.auth.signUp` |
| L6 | [api/auth/signout.ts:5](src/pages/api/auth/signout.ts:5), [:7](src/pages/api/auth/signout.ts:7) | API | `supabase.auth.signOut` |
| L7 | [api/sessions.ts:79](src/pages/api/sessions.ts:79), [:86](src/pages/api/sessions.ts:86), [:104](src/pages/api/sessions.ts:104), [:130](src/pages/api/sessions.ts:130), [:141](src/pages/api/sessions.ts:141), [:148](src/pages/api/sessions.ts:148), [:158](src/pages/api/sessions.ts:158) | API | `auth.getUser` + `from("sessions"/"answers").upsert/.delete().eq()` |
| L8 | [drill.astro:27](src/pages/drill.astro:27), [:31](src/pages/drill.astro:31) | SSR (frontmatter) | `from("note_error_stats").select(...)` |
| L9 | [history.astro:28](src/pages/history.astro:28), [:38-41](src/pages/history.astro:38), [:53-58](src/pages/history.astro:53) | SSR (frontmatter) | `from("sessions").select(count/range/embed)` |
| L10 | [supabase-it.ts:18](src/test/supabase-it.ts:18) | test | `createClient` z `@supabase/supabase-js` |
| L11 | [sessions.payload-types.test-d.ts:3](src/test/sessions.payload-types.test-d.ts:3) | test (typy) | asercja, że `supabase.upsert()` pozostaje przypisywalne do typów |

**Dwie osie przecieku w jednym dostawcy:**

- **Auth (GoTrue):** `supabase.auth.*` — L2, L4, L5, L6, L7. Idiom `{ data, error }`,
  typ `User`, `error.message` jako string UI (signin.ts:16).
- **Dane (PostgREST):** `supabase.from(...).select/.upsert/.delete` — L7, L8, L9.
  Builder zapytań, `onConflict`/`ignoreDuplicates`, embed `answers(...)`, kody
  błędów PostgREST (history.astro:36-37 komentuje 416).

**Duplikacja rekonstrukcji.** Wzorzec `createClient(headers, cookies)` →
`if (!supabase)` → `auth.getUser()` jest **odtworzony 8×**: middleware.ts:7-12,
sessions.ts:79-89 i :141-151, signin.ts:9-13, signup.ts:9-13, signout.ts:5-7,
drill.astro:27-30, history.astro:28-34. Każdy z tych ośmiu callerów osobno zna
kontrakt null-when-unconfigured i osobno wywołuje SDK.

---

## KROK 2 — Klasyfikacja i wybór #1

| Oś przecieku | (a) warstwy / pliki | (b) ryzyko wymiany dziś | (c) deklaracja wymienialności |
| --- | --- | --- | --- |
| **Supabase (auth + dane)** | **4 warstwy / 11 plików** | wysokie — builder PostgREST i idiom GoTrue rozsiane po API+SSR+edge | tech-stack traktuje jak prymityw, ale infra myśli „swap" — rozjazd |
| Cloudflare (`astro:env/server`) | 1 plik (supabase.ts:3) | niskie — jeden import | adapter celowo wymienny, ale izolowany |
| Radix / lucide (UI) | tylko `src/components/ui/*` | niskie — czysto prezentacyjne | brak deklaracji |

**Wybór #1: Supabase (oś auth + dane łącznie).** Uzasadnienie:

1. **Zasięg** — jedyna zależność przecinająca cztery warstwy, w tym **ambient typy
   aplikacji** (env.d.ts:3). Każda strona czytająca `Astro.locals.user` jest przez
   to tranzytywnie sprzężona z kształtem `User` z `@supabase/supabase-js`.
2. **Koszt wymiany** — proprietarny builder PostgREST (`.from().upsert({onConflict,
   ignoreDuplicates})`, embed `answers(...)`) i idiomy GoTrue są wplecione w logikę
   API i SSR; wymiana na inny backend dziś dotyka 7 plików produkcyjnych.
3. **Rozjazd intencja↔kod** — najmocniejszy sygnał: dokumenty mówią językiem
   wymienialnych warstw, kod nie ma nad Supabase żadnej granicy.

**Najostrzejszy pojedynczy symptom:** L3 — typ biblioteki w `App.Locals`. To nie
jest lokalny przeciek w jednym handlerze; to **globalny kontrakt ambient**, który
wciąga `@supabase/supabase-js` w każdą wyspę i stronę odczytującą zalogowanego
użytkownika.

**Uczciwa granica zakresu (czego NIE ma):** groźnego przecieku „serwerowa
biblioteka w bundlu klienta" **dziś nie ma** — klient pisze przez `fetch('/api/...')`
([saveSession.ts:30](src/components/drill/saveSession.ts:30),
[DeleteSessionButton.tsx:30](src/components/history/DeleteSessionButton.tsx:30)), a
`supabase.ts` używa `astro:env/server`, więc trafia wyłącznie do middleware/API/SSR.
Przeciek jest **szerokości + vendor-lock + sprzężenia typów**, nie bezpieczeństwa
bundla. L3 to jednak *otwarte drzwi*: nic nie powstrzymuje przyszłej wyspy przed
`import type { User } from "@supabase/supabase-js"`.

---

## KROK 3 — Diagnoza (cytaty)

**Rozjazd deklaracji.** `infrastructure.md:17` — „No adapter swap, no Docker…
required"; `:38` — „swapping the Astro adapter". Zespół projektuje wymienialne
warstwy infrastruktury, ale `supabase.ts` eksportuje **surowy klient SDK**, nie port:

```ts
// supabase.ts:6,10 — fabryka zwraca surowy SupabaseClient<Database>, nie port domenowy
export function createClient(requestHeaders, cookies) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, { cookies: {...} });
}
```

**Typ biblioteki w kontrakcie ambient (najgorszy przeciek):**

```ts
// env.d.ts:3
user: import("@supabase/supabase-js").User | null;
```

**Idiom GoTrue jako string UI** (auth łamie granicę — komunikat dostawcy trafia
wprost do redirectu użytkownika):

```ts
// signin.ts:13,16
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
```

**Builder PostgREST w logice API** (kontrakt persystencji wplótł się w handler):

```ts
// sessions.ts:104,112 — onConflict/ignoreDuplicates to idiom Supabase, nie domeny
await supabase.from("sessions").upsert({...}, { onConflict: "id", ignoreDuplicates: true });
// sessions.ts:158
await supabase.from("sessions").delete().eq("id", id);
```

**Kody błędów dostawcy wyciekają do SSR** — `history.astro:36-37` komentuje, że
„range query…returns a PostgREST 416 error", czyli warstwa widoku zna wewnętrzne
kody PostgREST.

**Duplikacja guardu null** — osiem callerów (KROK 1) powtarza
`createClient(...) → if (!supabase)`. Kontrakt „nieskonfigurowany Supabase" jest
rozmazany po całym kodzie zamiast być jedną decyzją domenową.

---

## KROK 4 — Projekt ACL

Dwa **wąskie porty** (auth i dane), jeden **value object** dla użytkownika, jeden
**adapter** Supabase. Reszta kodu zna wyłącznie porty i typy domenowe.

### 4.1 Value object — `AuthUser` (jedyne miejsce wiedzy o kształcie `User`)

```ts
// src/lib/auth/AuthUser.ts  — czysty, render-free, zero importów @supabase
export interface AuthUser {
  readonly id: string;      // UUID = answers.user_id / sessions.user_id (RLS auth.uid())
  readonly email: string;
}

// JEDYNE miejsce mapujące surowy User z biblioteki → domena.
// Sygnatura przyjmuje minimalny strukturalny kształt, nie importuje typu biblioteki:
export function toAuthUser(raw: { id: string; email?: string | null }): AuthUser {
  return { id: raw.id, email: raw.email ?? "" };
}
```

### 4.2 Port `AuthGateway` (auth — zastępuje `supabase.auth.*`)

```ts
// src/lib/auth/AuthGateway.ts  — interfejs domenowy, zero @supabase
export type AuthOutcome = { ok: true } | { ok: false; message: string };

export interface AuthGateway {
  getCurrentUser(): Promise<AuthUser | null>;          // ⟵ middleware.ts:12
  signUp(email: string, password: string): Promise<AuthOutcome>;        // ⟵ signup.ts:13
  signIn(email: string, password: string): Promise<AuthOutcome>;        // ⟵ signin.ts:13
  signOut(): Promise<void>;                            // ⟵ signout.ts:7
}
```

Kontrakt „nieskonfigurowany" znika z callerów: brak konfiguracji daje
`getCurrentUser() → null` i `signIn → { ok:false, message }`, a nie `null`-klienta.

### 4.3 Port `SessionRepository` (dane — zastępuje `supabase.from(...)`)

```ts
// src/lib/sessions/SessionRepository.ts  — interfejs domenowy, zero PostgREST
export interface SessionRepository {
  // ⟵ sessions.ts:104-132 (oba upserty, idempotencja jako szczegół adaptera)
  saveSession(userId: string, session: SessionAggregate): Promise<AuthOutcome>;
  // ⟵ sessions.ts:158
  deleteSession(userId: string, sessionId: string): Promise<AuthOutcome>;
  // ⟵ history.astro:38-58 (count+clamp+range to szczegół adaptera; zwraca domenę)
  listSessions(userId: string, page: number, size: number):
    Promise<{ summaries: SessionSummary[]; totalPages: number } | null>;
  // ⟵ drill.astro:31 (widok note_error_stats → gotowe wagi domenowe)
  getNoteWeights(userId: string): Promise<NoteWeights>;
}
```

`SessionAggregate`, `SessionSummary` ([sessionSummary.ts](src/components/history/sessionSummary.ts)),
`NoteWeights` ([exercises.ts](src/components/drill/exercises.ts)) — wszystkie już
istnieją jako typy domenowe. Porty zwracają **gotowe dane domenowe**, nie wiersze PostgREST.

### 4.4 Adapter — `SupabaseAdapter` (JEDYNE miejsce z `@supabase`)

```ts
// src/lib/supabase/SupabaseAdapter.ts  — jedyny plik importujący @supabase/* w prod
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { Database } from "@/db/database.types";

// prywatna fabryka (była: publiczne supabase.ts) — niewidoczna poza adapterem
function buildClient(headers: Headers, cookies: AstroCookies) { /* supabase.ts:10-24 */ }

export function createSupabaseGateways(headers, cookies):
    { auth: AuthGateway; sessions: SessionRepository } | null {
  const client = buildClient(headers, cookies);
  if (!client) return null;            // jedyne `if (!supabase)` w całym repo
  return {
    auth: {
      async getCurrentUser() {
        const { data } = await client.auth.getUser();    // getUser, nie getSession (KROK 5.3)
        return data.user ? toAuthUser(data.user) : null;
      },
      async signIn(email, password) {
        const { error } = await client.auth.signInWithPassword({ email, password });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      /* signUp, signOut analogicznie — idiom GoTrue zamknięty tutaj */
    },
    sessions: {
      async saveSession(userId, s) { /* upsert sessions + answers, onConflict/ignoreDuplicates */ },
      async deleteSession(userId, id) { /* .from("sessions").delete().eq("id", id) */ },
      async listSessions(userId, page, size) { /* count→clamp→range→summarizeSessions */ },
      async getNoteWeights(userId) { /* from("note_error_stats")→built NoteWeights */ },
    },
  };
}
```

`env.d.ts` przestaje znać bibliotekę:

```ts
// env.d.ts (po) — import typu DOMENOWEGO, nie @supabase
user: import("@/lib/auth/AuthUser").AuthUser | null;
```

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Dowód: wymiana Supabase dotyka tylko adaptera

| Artefakt | Zmienia się przy wymianie backendu? | Dlaczego |
| --- | --- | --- |
| `src/lib/supabase/SupabaseAdapter.ts` | **TAK** | jedyny implementator portów |
| `src/db/database.types.ts` | tak (regenerowane) | artefakt schematu, nie kod aplikacji |
| Tabele/migracje `supabase/*.sql` | nie | RLS `auth.uid()` + schemat bez zmian |
| API (`sessions.ts`, `auth/*.ts`) | **nie** | znają tylko `AuthGateway`/`SessionRepository` |
| SSR (`drill.astro`, `history.astro`) | **nie** | dostają `NoteWeights` / `SessionSummary[]` |
| `middleware.ts` | **nie** | woła `auth.getCurrentUser()` |
| `env.d.ts`, wyspy React | **nie** | znają `AuthUser`, nie `User` |

### 5.2 Before / after (zduplikowane miejsca)

**Middleware (L2):**
```ts
// PRZED — middleware.ts:7-12: SDK w warstwie edge
const supabase = createClient(context.request.headers, context.cookies);
if (supabase) { const { data: { user } } = await supabase.auth.getUser();
  context.locals.user = user ?? null; } else { context.locals.user = null; }
// PO:
const gw = createSupabaseGateways(context.request.headers, context.cookies);
context.locals.user = gw ? await gw.auth.getCurrentUser() : null;   // AuthUser | null
```

**SSR — UI dostaje dane domenowe, nie surowy obiekt biblioteki (L8):**
```ts
// PRZED — drill.astro:31-45: frontmatter zna PostgREST + składa wagi ręcznie
const { data, error } = await supabase.from("note_error_stats").select(...);
/* 12 linii pętli budującej NoteWeights */
// PO:
const weights = gw ? await gw.sessions.getNoteWeights(user.id) : EMPTY_WEIGHTS;  // NoteWeights
```

**API (L7):**
```ts
// PRZED — sessions.ts:104,158: builder PostgREST w handlerze
await supabase.from("sessions").upsert({...}, { onConflict:"id", ignoreDuplicates:true });
// PO:
await gw.sessions.saveSession(user.id, aggregate);   // AuthOutcome
```

Osiem powtórzeń `createClient → if(!supabase) → auth.getUser` z KROKU 1 zwija się do
jednego wywołania `createSupabaseGateways` per warstwa; guard null żyje raz, w adapterze.

### 5.3 Otwarte pytania kontraktowe — rozstrzygnięte na podstawie dokumentacji Supabase

- **`getUser()` vs `getSession()`** — kod używa `getUser()` (middleware.ts:12,
  sessions.ts:86), które rewaliduje token z serwerem auth (bezpieczne dla guardu).
  Decyzję zakodować w `AuthGateway.getCurrentUser` (adapter), **nie** w API.
- **`error.message` GoTrue jako UI** (signin.ts:16) — surowy komunikat dostawcy.
  Mapowanie na komunikat domenowy/i18n należy do adaptera (`AuthOutcome.message`),
  nie do warstwy API/redirectu.
- **Kod 416 PostgREST** (history.astro:36-37) — clamp strony to szczegół zapytania;
  zamknąć w `listSessions`, by SSR nie znał kodów PostgREST.

---

## KROK 6 — Weryfikacja i plan faz

**Kryterium sukcesu (grep):**
```bash
grep -rn "@supabase" src/ --include=*.ts --include=*.tsx --include=*.astro
```
- **Dziś** zwraca: `env.d.ts`, `lib/supabase.ts`, `test/supabase-it.ts` + (tranzytywnie
  przez `createClient`) middleware, 4 API, 2 strony SSR — **4 warstwy**.
- **Po refaktorze** zwraca wyłącznie: `src/lib/supabase/SupabaseAdapter.ts` oraz
  helper testowy `src/test/supabase-it.ts`. `src/db/database.types.ts` pozostaje
  (artefakt generowany). Żaden plik w `pages/`, `middleware.ts` ani `env.d.ts` nie
  zawiera `@supabase`.

| Plik | Zna `@supabase` dziś | Po refaktorze |
| --- | --- | --- |
| `lib/supabase.ts` → `lib/supabase/SupabaseAdapter.ts` | tak | **tak (jedyny)** |
| `env.d.ts` | tak (typ `User`) | nie (`AuthUser`) |
| `middleware.ts` | tak (tranzytywnie) | nie |
| `pages/api/auth/{signin,signup,signout}.ts` | tak | nie |
| `pages/api/sessions.ts` | tak | nie |
| `pages/drill.astro`, `pages/history.astro` | tak | nie |
| `test/supabase-it.ts` | tak | tak (helper testowy, poza domeną) |

**Plan faz (konwencja repo: łańcuch `/10x-new → /10x-research → /10x-plan → /10x-implement`,
jedna zmiana na slice, `/clear` między handoffami):**

1. **Faza 1 — `AuthUser` + `AuthGateway`** (najostrzejszy symptom L3). Value object,
   port auth, adapter auth; `env.d.ts` i `middleware.ts` przepięte; 4 strony auth.
   Bramka: `grep @supabase` znika z `env.d.ts`, `middleware.ts`, `auth/*.ts`.
2. **Faza 2 — `SessionRepository` (zapis)**. `saveSession`/`deleteSession`;
   `sessions.ts` przepięte na port. Bramka: `sessions.integration.test.ts` zielony
   bez zmian kontraktu wire.
3. **Faza 3 — `SessionRepository` (odczyt SSR)**. `listSessions` + `getNoteWeights`;
   `history.astro`/`drill.astro` przepięte. Bramka: `grep @supabase src/pages` pusty.
4. **Faza 4 — domknięcie**. Usunięcie publicznego `lib/supabase.ts`; aktualizacja
   `test-d` (asercja typów na porcie, nie na `supabase.upsert`); wpis w §6 test-planu
   „jak dodać zależność za portem". Bramka końcowa: grep z kryterium sukcesu.

Każda faza: niezależnie testowalna, zachowuje kontrakty wire (`/api/sessions`) i RLS;
adapter jest jedynym miejscem dotykanym przy ewentualnej wymianie backendu.

---

## Podsumowanie

Przeciekającą zależnością #1 jest **Supabase** (osie auth GoTrue + dane PostgREST),
wybrana ponad Cloudflare i biblioteki UI, bo jako jedyna przecina **cztery warstwy
i jedenaście plików** — w tym ambient kontrakt `App.Locals.user` w
[env.d.ts:3](src/env.d.ts:3), najostrzejszy symptom, sprzęgający każdą stronę i wyspę
z typem `User` z `@supabase/supabase-js`. Dokumenty (`tech-stack.md`,
`infrastructure.md`) myślą kategoriami wymienialnych warstw, ale kod nie ma nad
Supabase żadnej granicy: `supabase.ts` eksportuje surowy `SupabaseClient`, a wzorzec
`createClient → if(!supabase) → auth.getUser` jest odtworzony ośmiokrotnie. Uczciwie:
groźnego przecieku „serwerowy SDK w bundlu klienta" dziś brak (klient idzie przez
`fetch('/api/...')`) — problem to szerokość, vendor-lock i sprzężenie typów. Projekt
ACL wprowadza value object `AuthUser` (jedyne mapowanie z `User`), dwa wąskie porty
`AuthGateway`/`SessionRepository` zwracające gotowe typy domenowe oraz jeden
`SupabaseAdapter` jako jedyne miejsce importu `@supabase`. Dowód izolacji: po
refaktorze `grep -rn "@supabase" src/` zwraca wyłącznie katalog adaptera i helper
testowy, a wymiana backendu nie dotyka tabel, API, SSR ani UI. Plan rozpisano na
cztery fazy zgodne z łańcuchem zmian repo, każda z własną bramką grep/test.
