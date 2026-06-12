# Testing Architecture Implementation Tickets

Denne fil omsaetter QA- og arkitekturauditten til selvstaendige implementation tickets. Hvert ticket kan laeses og implementeres isoleret af en anden AI-model uden adgang til den oprindelige audit-samtale.

Projektregler der gaelder for alle tickets:

- Brug `bun test`, `bunx tsc --noEmit`, `bunx eslint .` og `bun run build` som endelig verifikation, medmindre ticketet er dokumentation-only.
- Brug `bun:test`, ikke Vitest.
- Brug Datafordeler som compliance-kilde. DAWA/Dataforsyningen REST maa ikke bruges til compliance/registerdata.
- Server-side Datafordeler- og Supabase-kode maa kun kaldes fra `createServerFn` eller server-only moduler, og route-filer maa ikke importere server-only klienter paa top-level.
- `src/routeTree.gen.ts` og `vite.config.ts` maa ikke redigeres.
- Ved aendringer i `src/lib/project-store.ts`, `src/lib/analysis-orchestrator.ts`, `src/lib/pre-check-adresse.ts`, `src/lib/reactive-compliance.ts`, `src/integrations/supabase/project-persistence.ts`, `package.json` eller nye `createServerFn`-moenstre: marker PR med `🔒 Rører beskyttet fil — kræver review`.

---

## Ticket 1

### 1. TITEL

Fjern global mock-laekage fra `useCockpitRestore.test.ts`

### 2. MAAL

`bun test` skal kunne koere hele test-suiten uden at `useCockpitRestore.test.ts` forurener efterfoelgende tests. Den konkrete fejl, der skal fjernes, er at `project-store.test.ts` fejler i fuld suite med:

```text
TypeError: useProject.getState().reset is not a function
```

`project-store.test.ts` passer allerede alene, saa problemet er test-isolation og global module mocking.

### 3. KONTEKST & REGLER

Aktuel problemkode i `src/hooks/useCockpitRestore.test.ts`:

```ts
mock.module("@/lib/project-store", () => ({
  useProject: Object.assign(
    (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
}));

import { routeMatchesAddress, objectField } from "./useCockpitRestore";
```

Aktuel real store i `src/lib/project-store.ts` indeholder `reset`:

```ts
type State = {
  // ...
  reset: () => void;
};

export const useProject = create<State>((set) => ({
  // ...
  reset: () =>
    set({
      address: null,
      bbrData: null,
      complianceDone: false,
      // ...
    }),
}));
```

Regel: Testfiler maa ikke efterlade `mock.module("@/lib/project-store", ...)` globalt, fordi Bun's module cache kan paavirke senere testfiler.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Opret en ny fil:

   `src/hooks/cockpit-restore-utils.ts`

2. Flyt de rene helper-funktioner ud af `src/hooks/useCockpitRestore.ts`.

   Foer:

   ```ts
   function routeMatchesAddress(
     currentAddress: { adresseid?: string | null; adgangsadresseid?: string | null } | null,
     routeAddressId: string,
   ) {
     return (
       !!currentAddress &&
       (currentAddress.adresseid === routeAddressId ||
         currentAddress.adgangsadresseid === routeAddressId)
     );
   }

   function objectField<T>(value: unknown, key: string): T | null {
     if (typeof value !== "object" || value === null) return null;
     const field = (value as Record<string, unknown>)[key];
     return typeof field === "object" && field !== null ? (field as T) : null;
   }

   export { routeMatchesAddress, objectField };
   ```

   Efter i `src/hooks/cockpit-restore-utils.ts`:

   ```ts
   export function routeMatchesAddress(
     currentAddress: { adresseid?: string | null; adgangsadresseid?: string | null } | null,
     routeAddressId: string,
   ): boolean {
     return (
       !!currentAddress &&
       (currentAddress.adresseid === routeAddressId ||
         currentAddress.adgangsadresseid === routeAddressId)
     );
   }

   export function objectField<T>(value: unknown, key: string): T | null {
     if (typeof value !== "object" || value === null) return null;
     const field = (value as Record<string, unknown>)[key];
     return typeof field === "object" && field !== null ? (field as T) : null;
   }
   ```

3. Opdater `src/hooks/useCockpitRestore.ts` til at importere helpers:

   ```ts
   import { objectField, routeMatchesAddress } from "@/hooks/cockpit-restore-utils";
   ```

4. Fjern de lokale helper-definitioner og `export { routeMatchesAddress, objectField }` fra `useCockpitRestore.ts`.

5. Omdob `src/hooks/useCockpitRestore.test.ts` til:

   `src/hooks/cockpit-restore-utils.test.ts`

6. Opdater testen til kun at importere den nye helper-fil. Den maa ikke mocke `@/lib/project-store` eller `@/lib/project-sync`.

   Efter:

   ```ts
   import { describe, expect, it } from "bun:test";
   import { objectField, routeMatchesAddress } from "./cockpit-restore-utils";

   describe("routeMatchesAddress", () => {
     it("returns false when address is null", () => {
       expect(routeMatchesAddress(null, "addr-1")).toBe(false);
     });
   });
   ```

7. Hvis der stadig er behov for en egentlig hook-test senere, opret den i et separat ticket med en React test harness. Dette ticket maa kun loese mock-laekagen.

### 5. DEFINITION OF DONE

- `src/hooks/useCockpitRestore.test.ts` eksisterer ikke laengere eller indeholder ingen `mock.module("@/lib/project-store", ...)`.
- `src/hooks/cockpit-restore-utils.ts` findes og eksporteres fra helper-filen.
- `useCockpitRestore.ts` bruger helper-importen.
- `bun test src/hooks/cockpit-restore-utils.test.ts src/lib/project-store.test.ts` passer.
- `bun test` passer for hele suiten eller fejler kun paa kendte, ikke-relaterede tests dokumenteret i PR'en.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/hooks/cockpit-restore-utils.test.ts
bun test src/lib/project-store.test.ts
bun test
bunx tsc --noEmit
```

Verificer manuelt i test-output, at `project-store.test.ts` ikke laengere modtager en mocked `useProject`.

---

## Ticket 2

### 1. TITEL

Adskil unit tests fra live Supabase integration tests

### 2. MAAL

Normal `bun test` og CI unit-job maa aldrig ramme live Supabase, service-role credentials eller ekstern database-state. Live Supabase roundtrip-tests skal flyttes til en eksplicit live-test kommando, der kun koerer naar en udvikler eller CI-job bevidst aktiverer den.

### 3. KONTEKST & REGLER

Aktuel problemkode i `src/integrations/cache/client.test.ts`:

```ts
// Integration test — kræver live Supabase-forbindelse (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Springes automatisk over i CI/lokal test uden env vars.
describe("setCachedSourceResult + getCachedSourceResult", () => {
  it("roundtrips a mock result", async () => {
    if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return;
    }
    const testAddress = `test-arch239-${Date.now()}`;
    await setCachedSourceResult(testAddress, "dkjord", result, 1);
    const cached = await getCachedSourceResult(testAddress, "dkjord");
    expect(cached).not.toBeNull();
  });
});
```

Aktuel CI giver secrets til `bun test`:

```yaml
- name: Test
  run: bun test
  env:
    DATAFORDELER_API_KEY: ${{ secrets.DATAFORDELER_API_KEY }}
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
```

Regler:

- Unit tests maa ikke kraeve netvaerk.
- Integration tests med Supabase skal have eksplicit opt-in via env flag, fx `RUN_LIVE_SUPABASE_TESTS=true`.
- Service-role credentials maa ikke gives til unit-test-jobbet.
- `package.json` og CI-workflows kan redigeres i dette ticket. `package.json` er beskyttet og PR skal markeres med `🔒 Rører beskyttet fil — kræver review`.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Opret mappe:

   `tests/live/`

2. Flyt live Supabase-testen fra:

   `src/integrations/cache/client.test.ts`

   til:

   `tests/live/supabase-cache.live.test.ts`

3. Lad `src/integrations/cache/client.test.ts` kun indeholde unit tests af pure decoders eller fjern filen, hvis den kun bestaar af live tests.

4. I `tests/live/supabase-cache.live.test.ts`, brug `describe.skipIf` eller tidlig guard paa filniveau.

   Efter:

   ```ts
   import { describe, expect, it } from "bun:test";
   import { getCachedSourceResult, setCachedSourceResult } from "@/integrations/cache/client";
   import { makeMockResult } from "@/lib/source-result";

   const LIVE =
     process.env.RUN_LIVE_SUPABASE_TESTS === "true" &&
     !!process.env.SUPABASE_URL &&
     !!process.env.SUPABASE_SERVICE_ROLE_KEY;

   describe.skipIf(!LIVE)("live Supabase cache integration", () => {
     it("roundtrips a source result through address_source_results", async () => {
       const testAddress = `test-cache-${crypto.randomUUID()}`;
       const result = makeMockResult(
         { v1Kortlagt: false, v2Kortlagt: null },
         { kilde: "dkjord", sourceUrl: "https://dkjord.mst.dk/wfs", rawFeatureCount: 0 },
       );

       await setCachedSourceResult(testAddress, "dkjord", result, 1);
       const cached = await getCachedSourceResult(testAddress, "dkjord");

       expect(cached).toMatchObject({
         status: "mock",
         isMock: true,
         data: { v1Kortlagt: false, v2Kortlagt: null },
       });
     });
   });
   ```

5. Opdater `package.json` scripts.

   Foer:

   ```json
   {
     "scripts": {
       "build": "vite build",
       "lint": "eslint .",
       "format": "prettier --write .",
       "evals": "bun run evals/runner.ts"
     }
   }
   ```

   Efter:

   ```json
   {
     "scripts": {
       "build": "vite build",
       "build:dev": "vite build --mode development",
       "preview": "vite preview",
       "lint": "eslint .",
       "format": "prettier --write .",
       "evals": "bun run evals/runner.ts",
       "test": "bun test src",
       "test:live": "RUN_LIVE_SUPABASE_TESTS=true bun test tests/live",
       "check": "bunx tsc --noEmit && bunx eslint . && bun test src && bun run build"
     }
   }
   ```

   Windows note: hvis shell-kompatibilitet er et problem, brug CI direkte med env i workflow og hold scriptet simpelt:

   ```json
   "test:live": "bun test tests/live"
   ```

6. Opdater `.github/workflows/ci.yml`.

   Foer:

   ```yaml
   - name: Test
     run: bun test
     env:
       SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
       SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
   ```

   Efter:

   ```yaml
   - name: Unit tests
     run: bun test src
   ```

7. Tilfoej et separat live integration job, hvis teamet vil koere live checks i CI:

   ```yaml
   live-integration:
     name: Live Supabase Integration
     runs-on: ubuntu-latest
     if: github.event_name == 'workflow_dispatch'
     steps:
       - uses: actions/checkout@v4
       - uses: oven-sh/setup-bun@v2
         with:
           bun-version: 1.3.13
       - run: bun install --frozen-lockfile
       - name: Live Supabase tests
         run: bun test tests/live
         env:
           RUN_LIVE_SUPABASE_TESTS: "true"
           SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
           SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
           SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
   ```

### 5. DEFINITION OF DONE

- `bun test src` koerer uden Supabase secrets og uden live Supabase kald.
- Live Supabase tests ligger under `tests/live`.
- CI unit-test-job eksponerer ikke `SUPABASE_SERVICE_ROLE_KEY`.
- Live integration tests kan koeres eksplicit med `RUN_LIVE_SUPABASE_TESTS=true`.
- PR markerer `🔒 Rører beskyttet fil — kræver review`, fordi `package.json` er aendret.

### 6. TEST STRATEGI

Koer lokalt uden secrets:

```bash
bun test src
bunx tsc --noEmit
```

Koer live-test eksplicit kun med korrekt env:

```bash
RUN_LIVE_SUPABASE_TESTS=true bun test tests/live
```

I CI skal unit-job passere uden Supabase env vars. Live-job maa kun koere ved manuel workflow dispatch eller andet bevidst opt-in.

---

## Ticket 3

### 1. TITEL

Tilfoej unit tests for Supabase persistence-derivations

### 2. MAAL

De rene domæne-derivations i Supabase persistence-laget skal have direkte unit tests, saa kritisk compliance-data ikke kun beskyttes indirekte via UI eller orchestrator tests.

Omfang:

- `deriveSiteConstraintsPatch`
- `deriveSoilContaminationStatus`
- `deriveAutoTasks`

Dette ticket maa ikke teste live Supabase writes. Det er kun pure function coverage.

### 3. KONTEKST & REGLER

Aktuel kode i `src/integrations/supabase/repositories/site-constraints.repository.ts`:

```ts
export function deriveSoilContaminationStatus(
  dkjord: DkJordResultat | null | undefined,
): "clean" | "registered" | "contaminated" | "unknown" | null {
  if (!dkjord) return null;
  if (dkjord.v2Kortlagt === null || dkjord.v1Kortlagt === null) return "unknown";
  if (dkjord.v2Kortlagt === true) return "contaminated";
  if (dkjord.v1Kortlagt === true) return "registered";
  return "clean";
}

export function deriveSiteConstraintsPatch(
  addressId: string | null,
  patch: ProjectPatch,
  update: ProjectUpdate,
): SiteConstraintsUpsert | null {
  if (!addressId) return null;
  const sitePatch: SiteConstraintsUpsert = {
    address_id: addressId,
    confidence: "confirmed",
    extracted_at: new Date().toISOString(),
  };
  // ...
}
```

Aktuel kode i `src/integrations/supabase/repositories/building-tasks.repository.ts`:

```ts
export function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] {
  const tasks: BuildingTaskInsert[] = [];

  const { violations } = evaluateHardStop({
    saveValue: t.saveValue,
    isFredet: t.isFredet,
    strandbeskyttelse: t.strandbeskyttelse,
    fredskov: t.fredskov,
    klitfredning: t.klitfredning,
    projectType: "demolition_and_new",
  });

  const violationRules = new Set(violations.map((v) => v.rule));
  // pushes building_tasks rows
  return tasks;
}
```

Regler:

- Hard Stop thresholds maa kun evalueres via `evaluateHardStop`.
- Testene maa ikke importere `supabaseAdmin` direkte.
- Hvis import af repository-filer tvinger `supabaseAdmin` ind i unit tests, skal filerne opdeles i `*.derivation.ts` og repository wrappers.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Proev foerst at oprette:
   - `src/integrations/supabase/repositories/site-constraints.repository.test.ts`
   - `src/integrations/supabase/repositories/building-tasks.repository.test.ts`

2. Hvis test-importen fejler pga. server-only Supabase env, refaktorer:

   Foer:

   ```ts
   // site-constraints.repository.ts
   import { supabaseAdmin } from "@/integrations/supabase/client.server";

   export function deriveSiteConstraintsPatch(...) { ... }
   export async function syncSiteConstraints(...) { ... supabaseAdmin.from("site_constraints") ... }
   ```

   Efter:

   ```ts
   // site-constraints.derivation.ts
   export function deriveSoilContaminationStatus(...) { ... }
   export function deriveSiteConstraintsPatch(...) { ... }

   // site-constraints.repository.ts
   import { supabaseAdmin } from "@/integrations/supabase/client.server";
   export { deriveSoilContaminationStatus, deriveSiteConstraintsPatch } from "./site-constraints.derivation";
   export async function syncSiteConstraints(...) { ... }
   ```

   Gennemfoer samme split for `deriveAutoTasks`, hvis noedvendigt:

   ```ts
   // building-tasks.derivation.ts
   export function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] { ... }
   ```

3. Test `deriveSoilContaminationStatus` med disse cases:
   - `undefined` -> `null`
   - `null` -> `null`
   - `{ v1Kortlagt: false, v2Kortlagt: false }` -> `"clean"`
   - `{ v1Kortlagt: true, v2Kortlagt: false }` -> `"registered"`
   - `{ v1Kortlagt: false, v2Kortlagt: true }` -> `"contaminated"`
   - `{ v1Kortlagt: null, v2Kortlagt: false }` -> `"unknown"`
   - `{ v1Kortlagt: false, v2Kortlagt: null }` -> `"unknown"`

4. Test `deriveSiteConstraintsPatch` med:
   - `addressId=null` returnerer `null`.
   - `kommuneplanramme` mapper `max_bebyggelsesprocent`, `max_etager`, `max_height_m`, `source_kommuneplan_id`.
   - `lokalplaner` mapper `source_lokalplan_id` via `selectPrimaryLokalplanForPdf`.
   - `fbbData` mapper `save_value`.
   - `bbrData` mapper `strandbeskyttelse`, `fredskov`, `klitfredning`.
   - `dkjord` mapper jordforurening fields.

5. Test `deriveAutoTasks` med:
   - SAVE 3 -> task key `SAVE_DISPENSATION`, status `blocked`.
   - SAVE 4 -> task key `SAVE_4_PARAGRAPH14`, status `pending`.
   - `isFredet=true` -> task key `FREDNING_JURIDISK`, status `blocked`.
   - `strandbeskyttelse=true` -> task key `STRANDBESKYTTELSE_DISPENSATION`.
   - `jordforureningV2=true` -> task key `JORDFORURENING_V2_UNDERSOEGELSE`.
   - clean triggers -> empty array.

6. Brug minimal fixtures i testfilen. Eksempel:

   ```ts
   const baseTriggers = {
     projectId: "project-1",
     saveValue: null,
     isFredet: null,
     strandbeskyttelse: null,
     fredskov: null,
     klitfredning: null,
     soilContamination: null,
     jordforureningV1: null,
     jordforureningV2: null,
     omraadeklassificering: null,
   } satisfies ComplianceTriggers;
   ```

### 5. DEFINITION OF DONE

- Der findes direkte unit tests for alle tre derivation functions.
- Tests koerer uden Supabase env vars.
- Ingen live DB-kald foretages.
- Hvis der blev lavet `*.derivation.ts`, importerer repository-filerne stadig de samme public function names, saa eksisterende imports ikke bryder.
- `bun test src/integrations/supabase/repositories` passer.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/integrations/supabase/repositories
bun test src/lib/project-update-builder.test.ts
bunx tsc --noEmit
```

Lav en negativ verifikation ved at koere uden `SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY`. Unit tests maa stadig passere.

---

## Ticket 4

### 1. TITEL

Goer `analysis-orchestrator` testbar med dependency injection

### 2. MAAL

Reducer test-kompleksiteten omkring `analyseAddress` ved at flytte orchestration dependencies ind i en eksplicit dependency object. Det skal blive muligt at teste cache-hit, cache-miss, DAR enrichment, Layer 4 skip og cache-write failure uden globale `mock.module` hooks.

### 3. KONTEKST & REGLER

Aktuel kode i `src/lib/analysis-orchestrator.ts` har top-level env validation og mange direkte imports/dynamic imports:

```ts
import { validateEnv } from "@/lib/env";
validateEnv();

import { fetchBbrWithMat, fetchPlandata, fetchVurViaEbr } from "@/lib/compliance-layer1";
import {
  getCachedCompliance,
  setCachedCompliance,
  getCachedLokalplan,
  setCachedLokalplan,
  getCachedServitut,
  setCachedServitut,
} from "@/integrations/cache/client";

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  const startedAt = Date.now();
  const trace = await startAnalysisRun(...);
  try {
    const result = await analyseAddressWithTrace(input, trace);
    await finishAnalysisRun(trace, "done", startedAt);
    return { ...result, analysisRunId: trace.runId };
  } catch (e) {
    await finishAnalysisRun(trace, "failed", startedAt, e);
    throw e;
  }
}
```

Aktuel test bruger globale module mocks:

```ts
mock.module("@/integrations/cache/client", () => ({
  getCachedCompliance: getCacheMock,
  setCachedCompliance: setCacheMock,
  // ...
}));

mock.module("@/lib/compliance-layer1", () => ({
  fetchBbrWithMat: fetchBbrMock,
  fetchPlandata: fetchPlandataMock,
  fetchVurViaEbr: fetchVurMock,
}));

const { analyseAddress } = await import("./analysis-orchestrator");
```

Regler:

- Public API `analyseAddress(input)` skal bevares.
- Ny testbar API maa eksporteres som `createAnalysisOrchestrator(deps)`.
- Produktions-default dependencies maa stadig bruge eksisterende services.
- Ingen route-fil maa importere Datafordeler/Supabase klienter direkte.
- Dette ticket roerer `src/lib/analysis-orchestrator.ts`, som er beskyttet. PR skal markeres `🔒 Rører beskyttet fil — kræver review`.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Tilfoej dependency typer i `src/lib/analysis-orchestrator.ts` eller en ny fil `src/lib/analysis-orchestrator.deps.ts`.

   Eksempel:

   ```ts
   export type AnalysisOrchestratorDeps = {
     now: () => Date;
     startAnalysisRun: typeof startAnalysisRun;
     finishAnalysisRun: typeof finishAnalysisRun;
     recordAnalysisEvent: typeof recordAnalysisEvent;
     traceStep: typeof traceStep;
     getCachedCompliance: typeof getCachedCompliance;
     setCachedCompliance: typeof setCachedCompliance;
     getCachedLokalplan: typeof getCachedLokalplan;
     setCachedLokalplan: typeof setCachedLokalplan;
     getCachedServitut: typeof getCachedServitut;
     setCachedServitut: typeof setCachedServitut;
     fetchBbrWithMat: typeof fetchBbrWithMat;
     fetchPlandata: typeof fetchPlandata;
     fetchVurViaEbr: typeof fetchVurViaEbr;
     getDarAddressDetails: (
       addressId: string,
       trace: AnalysisTraceContext,
     ) => Promise<{
       adgangsadresseid: string;
       grundareal: number | null;
       ejerlavskode: number | null;
       matrikelnummer: string | null;
     }>;
     logServerEvent: typeof logServerEvent;
   };
   ```

2. Opret default deps:

   ```ts
   const defaultDeps: AnalysisOrchestratorDeps = {
     now: () => new Date(),
     startAnalysisRun,
     finishAnalysisRun,
     recordAnalysisEvent,
     traceStep,
     getCachedCompliance,
     setCachedCompliance,
     getCachedLokalplan,
     setCachedLokalplan,
     getCachedServitut,
     setCachedServitut,
     fetchBbrWithMat,
     fetchPlandata,
     fetchVurViaEbr,
     getDarAddressDetails: async (addressId, trace) => {
       const { DarService } = await import("@/integrations/dar/client");
       return DarService.getAddressDetails(addressId, undefined, trace);
     },
     logServerEvent,
   };
   ```

3. Tilfoej factory:

   ```ts
   export function createAnalysisOrchestrator(deps: AnalysisOrchestratorDeps) {
     return {
       analyseAddress: (input: AnalysisInput) => analyseAddressWithDeps(input, deps),
     };
   }
   ```

4. Flyt logikken fra `analyseAddress` og `analyseAddressWithTrace` til interne functions, der tager `deps`.

   Foer:

   ```ts
   const trace = await startAnalysisRun(...);
   const cached = await traceStep(trace, meta, () => getCachedCompliance(addressId));
   const [bbrResult, plandataResult, vurderingResult] = await Promise.all([
     fetchBbrWithMat(...),
     fetchPlandata(...),
     fetchVurViaEbr(...),
   ]);
   analysedAt: new Date().toISOString(),
   ```

   Efter:

   ```ts
   const trace = await deps.startAnalysisRun(...);
   const cached = await deps.traceStep(trace, meta, () => deps.getCachedCompliance(addressId));
   const [bbrResult, plandataResult, vurderingResult] = await Promise.all([
     deps.fetchBbrWithMat(...),
     deps.fetchPlandata(...),
     deps.fetchVurViaEbr(...),
   ]);
   analysedAt: deps.now().toISOString(),
   ```

5. Bevar public wrapper:

   ```ts
   export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
     return createAnalysisOrchestrator(defaultDeps).analyseAddress(input);
   }
   ```

6. Omskriv `src/lib/analysis-orchestrator.test.ts`, saa den ikke bruger `mock.module`. Brug lokale fake deps:

   ```ts
   function makeDeps(overrides: Partial<AnalysisOrchestratorDeps> = {}): AnalysisOrchestratorDeps {
     return {
       now: () => new Date("2026-05-21T00:00:00.000Z"),
       startAnalysisRun: mock(async () => ({ runId: "test-run", sessionId: null })),
       finishAnalysisRun: mock(async () => {}),
       traceStep: mock(async (_trace, _meta, fn) => fn()),
       recordAnalysisEvent: mock(async () => {}),
       getCachedCompliance: mock(async () => null),
       setCachedCompliance: mock(async () => {}),
       // ...
       ...overrides,
     };
   }
   ```

7. Tilfoej tests for branch, der tidligere blev undgaaet:
   - Manglende `adgangsadresseid` udloeser `getDarAddressDetails`.
   - Cache hit undgaar `fetchBbrWithMat`.
   - Stale cache med `grundareal=null` bypasser cache.
   - Cache write exception returnerer stadig resultat.
   - `now()` styrer `analysedAt`, saa testen er deterministisk.

### 5. DEFINITION OF DONE

- `analyseAddress(input)` virker uændret for eksisterende callers.
- `createAnalysisOrchestrator(deps)` findes og bruges i tests.
- `analysis-orchestrator.test.ts` bruger ikke `mock.module`.
- DAR enrichment branch har test coverage.
- `analysedAt` er deterministisk i tests.
- PR markerer `🔒 Rører beskyttet fil — kræver review`.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/lib/analysis-orchestrator.test.ts
bun test src/integrations/datafordeler/regression.test.ts
bunx tsc --noEmit
```

Efter refaktor skal hele suiten koeres:

```bash
bun test
```

---

## Ticket 5

### 1. TITEL

Opgrader Playwright E2E fra dev-smoke til stabile acceptance tests

### 2. MAAL

E2E-suiten skal validere rigtige brugerrejser uden no-op assertions og uden udelukkende at bero paa `DEV:` shortcuts. Playwright skal kunne koeres mod production build/preview i CI.

### 3. KONTEKST & REGLER

Aktuel Playwright config:

```ts
webServer: {
  command: "bun run dev -- --host 127.0.0.1 --port 8080",
  url: "http://127.0.0.1:8080",
  reuseExistingServer: true,
  timeout: 120_000,
},

projects: [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
],
```

Aktuel test med conditional no-op:

```ts
const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
if (await ejendomTab.isVisible({ timeout: 2000 }).catch(() => false)) {
  await ejendomTab.click();
}

const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
if (await datakildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  await datakildBtn.click();
  const firstRow = page.locator('[data-testid^="datarow-"]').first();
  await expect(firstRow).toBeVisible({ timeout: 5000 });
}
```

Det betyder, at testen kan passere uden faktisk at kontrollere `Datakildeoversigt`.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Opdater `playwright.config.ts`, saa CI koerer mod production build.

   Efter:

   ```ts
   webServer: {
     command: "bun run build && bun run preview -- --host 127.0.0.1 --port 8080",
     url: "http://127.0.0.1:8080",
     reuseExistingServer: !process.env.CI,
     timeout: 120_000,
   },
   ```

   Hvis TanStack/Cloudflare preview kraever en anden kommando i dette repo, brug den etablerede preview-kommando, men den skal bruge build output, ikke Vite dev server.

2. Udvid projects:

   ```ts
   projects: [
     { name: "chromium", use: { ...devices["Desktop Chrome"] } },
     { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
   ],
   ```

   Hvis mobile flager for eksisterende layout, maa mobile projektet midlertidigt kun koere et subset via `testMatch`, men det skal dokumenteres.

3. Refaktorer gentagen setup til helper:

   Opret `tests/helpers/session.ts`:

   ```ts
   import type { Page } from "@playwright/test";

   export async function clearBrowserState(page: Page) {
     await page.addInitScript(() => {
       window.localStorage.clear();
       window.sessionStorage.clear();
     });
   }

   export async function enterCockpitWithMockAddress(page: Page) {
     await clearBrowserState(page);
     await page.goto("/projekt/adresse");
     await page.getByRole("button", { name: /DEV: Brug mock-adresse/i }).click();
     await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15_000 });
   }
   ```

4. Fjern conditional no-op assertions.

   Foer:

   ```ts
   if (await datakildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
     await datakildBtn.click();
     await expect(firstRow).toBeVisible({ timeout: 5000 });
   }
   ```

   Efter:

   ```ts
   await expect(datakildBtn).toBeVisible({ timeout: 5000 });
   await datakildBtn.click();
   await expect(page.locator('[data-testid^="datarow-"]').first()).toBeVisible({
     timeout: 5000,
   });
   ```

5. Tilfoej en hard-stop acceptance spec:

   `tests/hard-stop-gate.spec.ts`

   Maal: A hard-stop project must show `HARD STOP` banner before AI design generation is available.

   Hvis der ikke findes en deterministisk seeded hard-stop route, opret foerst en test-only fixture path under eksisterende dev/mock mekanisme. Den maa ikke bruge DAWA compliance data.

6. Tilfoej en production smoke spec:

   ```ts
   test("production build renders project start", async ({ page }) => {
     await page.goto("/projekt/start");
     await expect(page.getByRole("link", { name: /Start med en adresse/i })).toBeVisible();
   });
   ```

7. Opdater CI E2E job, hvis noedvendigt, saa build step ikke dublerer unødigt. Hvis webServer allerede koerer build, behold CI simpelt:

   ```yaml
   - name: Run Playwright tests
     run: bunx playwright test
   ```

### 5. DEFINITION OF DONE

- Ingen Playwright assertions er pakket i `if (isVisible().catch(...))` paa en maade, hvor testen kan passere uden assertion.
- Playwright koerer mod production preview eller dokumenteret build-output.
- Desktop Chrome og mindst en mobile profile er konfigureret.
- Der findes en acceptance test for hard-stop gate eller en eksplicit TODO med blokerende manglende fixture.
- E2E helper reducerer gentagen localStorage/sessionStorage setup.

### 6. TEST STRATEGI

Koer:

```bash
bunx playwright test
```

Ved fejl:

```bash
bunx playwright test --debug
```

Verificer, at testene fejler, hvis `Datakildeoversigt` fjernes fra UI. Det kan goeres midlertidigt lokalt ved at aendre selector/navn og se testen fail, derefter revert.

---

## Ticket 6

### 1. TITEL

Tilfoej React hook/component test harness for Cockpit restore og UI panels

### 2. MAAL

Projektet skal have en egentlig React test harness, saa kritisk UI-state og hook behavior kan testes uden Playwright og uden globale store mocks. Foerste coverage skal daekke `useCockpitRestore` restore-flow og mindst en Cockpit panel/stripe, der viser `hard_stop`.

### 3. KONTEKST & REGLER

Aktuelt findes der ingen React Testing Library dependency i `package.json`. Tests er primært pure `bun:test` og Playwright.

Eksempel paa hook behavior i `src/hooks/useCockpitRestore.ts`:

```ts
export function useCockpitRestore(params: {
  adresseId: string;
  searchProjectId: string | undefined;
  onSnapshotRestored: (snapshot: Partial<AnalysisSnapshot>) => void;
}): { restorePhase: RestorePhase } {
  const address = useProject((s) => s.address);
  const [restorePhase, setRestorePhase] = useState<RestorePhase>(
    routeMatchesAddress(address, adresseId) ? "checked" : "pending",
  );

  useEffect(() => {
    if (routeMatchesAddress(address, adresseId)) {
      setRestorePhase("checked");
      return;
    }
    // restoreProject -> set store fields
  }, []);
}
```

Eksempel paa hard-stop UI i `src/components/cockpit/StatusStripe.tsx`:

```tsx
const { complianceFlags, hard_stop, hard_stop_reason } = useProject();

{
  hard_stop && hard_stop_reason && <div>{hard_stop_reason}</div>;
}
```

Regler:

- `package.json` er beskyttet. PR skal markeres `🔒 Rører beskyttet fil — kræver review`.
- Undgaa at teste implementation details som CSS-klasser, medmindre der ikke er semantisk alternativ.
- Brug `data-testid` kun hvor UI ikke har naturlig role/text.
- Store state skal resettes via real `useProject.getState().reset()`, ikke mocked store.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Tilfoej dev dependencies:

   ```bash
   bun add -d @testing-library/react @testing-library/jest-dom happy-dom
   ```

   Hvis projektet foretraekker en anden DOM runtime, vaelg den mindste Bun-kompatible loesning og dokumenter valget i PR.

2. Opret test setup:

   `src/testing/react-test-setup.ts`

   ```ts
   import "@testing-library/jest-dom";
   import { GlobalRegistrator } from "@happy-dom/global-registrator";

   GlobalRegistrator.register();
   ```

   Hvis `happy-dom` API er anderledes i installeret version, brug officiel setup for versionen.

3. Opret helper:

   `src/testing/render-with-project.tsx`

   ```tsx
   import { render } from "@testing-library/react";
   import type { ReactElement } from "react";
   import { useProject } from "@/lib/project-store";

   export function resetProjectStore() {
     useProject.getState().reset();
   }

   export function renderWithProject(ui: ReactElement) {
     resetProjectStore();
     return render(ui);
   }
   ```

4. Opret `src/components/cockpit/StatusStripe.test.tsx`.

   Eksempel:

   ```tsx
   import "@/testing/react-test-setup";
   import { describe, expect, it, beforeEach } from "bun:test";
   import { screen } from "@testing-library/react";
   import { StatusStripe } from "./StatusStripe";
   import { renderWithProject, resetProjectStore } from "@/testing/render-with-project";
   import { useProject } from "@/lib/project-store";

   describe("StatusStripe", () => {
     beforeEach(() => resetProjectStore());

     it("viser hard stop reason fra project store", () => {
       useProject.getState().setHardStop(true, "Strandbeskyttelseslinje");

       renderWithProject(<StatusStripe />);

       expect(screen.getByText(/Strandbeskyttelseslinje/i)).toBeVisible();
     });
   });
   ```

5. Opret en hook-test for restore-flow:

   `src/hooks/useCockpitRestore.react.test.tsx`

   Dette maa mocke `restoreProject`, men maa ikke mocke `@/lib/project-store`.

   Foer-problem der skal undgaas:

   ```ts
   mock.module("@/lib/project-store", () => ({ useProject: fakeStore }));
   ```

   Efter:

   ```tsx
   import "@/testing/react-test-setup";
   import { describe, expect, it, mock, beforeEach } from "bun:test";
   import { render, waitFor } from "@testing-library/react";
   import { useCockpitRestore } from "./useCockpitRestore";
   import { useProject } from "@/lib/project-store";

   const restoreProjectMock = mock(async () => ({
     id: "project-1",
     address_full: "Hasselvej 48, 2830 Virum",
     address_adresseid: "addr-1",
     address_bbr: "adg-1",
     address_postnr: "2830",
     address_postnrnavn: "Virum",
     address_kommune: "Lyngby-Taarbæk",
     address_matrikel: "5fo",
     address_koordinater: { lat: 55.7, lng: 12.5 },
     address_ejerlavskode: 12352,
     address_matrikelnummer: "5fo",
     compliance_data: null,
     compliance_done: false,
     heritage_save_value: null,
     is_fredet: null,
     grundareal_m2: 441,
     bebygget_areal_m2: 120,
     hard_stop: false,
     hard_stop_reason: null,
     budget_estimate: null,
     bfe_nr: null,
     billedanalyse: null,
     hus_dna: null,
     updated_at: "2026-05-21T00:00:00.000Z",
   }));

   mock.module("@/lib/project-sync", () => ({
     restoreProject: restoreProjectMock,
   }));

   function Harness() {
     useCockpitRestore({
       adresseId: "addr-1",
       searchProjectId: undefined,
       onSnapshotRestored: mock(() => {}),
     });
     return null;
   }

   describe("useCockpitRestore", () => {
     beforeEach(() => {
       useProject.getState().reset();
       restoreProjectMock.mockClear();
     });

     it("restorer project address into the real project store", async () => {
       render(<Harness />);

       await waitFor(() => {
         expect(useProject.getState().address?.adresseid).toBe("addr-1");
       });
     });
   });
   ```

6. Hvis Bun ikke kan koere React Testing Library stabilt med `happy-dom`, dokumenter fejlen og fald tilbage til et mindre scope: component pure render med React DOM server. Men maalet er RTL.

### 5. DEFINITION OF DONE

- React test dependencies er installeret.
- Der findes en faelles React test setup.
- Mindst en component test bruger real Zustand store.
- Mindst en hook test bruger real Zustand store og mocked `restoreProject`.
- Ingen ny test mocker `@/lib/project-store`.
- PR markerer `🔒 Rører beskyttet fil — kræver review`.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/components/cockpit/StatusStripe.test.tsx
bun test src/hooks/useCockpitRestore.react.test.tsx
bun test src/lib/project-store.test.ts
bunx tsc --noEmit
```

Koer derefter fuld suite:

```bash
bun test
```

---

## Ticket 7

### 1. TITEL

Refaktorer server functions til testbare handler functions

### 2. MAAL

Server functions i Cockpit skal have testbare handler functions under `src/lib`, saa auth, input validation og compliance-gate behavior kan verificeres uden at teste TanStack `createServerFn` direkte.

Primaert scope:

- `src/lib/cockpit.functions.ts`
- Den duplikerede server function kode i `src/routes/projekt.$id.cockpit.tsx`

### 3. KONTEKST & REGLER

Der findes to lignende implementationer.

I `src/lib/cockpit.functions.ts`:

```ts
export const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    return withAuth(data.token, async (userId) => {
      const { token: _token, ...analysisInput } = data;
      const { analyseAddress } = await import("@/lib/analysis-orchestrator");
      return analyseAddress({ ...analysisInput, userId });
    });
  });
```

I `src/routes/projekt.$id.cockpit.tsx`:

```ts
const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    return withAuth(data.token, async (userId) => {
      const { token: _token, ...analysisInput } = data;
      const { analyseAddress } = await import("@/lib/analysis-orchestrator");
      return analyseAddress({ ...analysisInput, userId });
    });
  });
```

Regler:

- Route-filen maa ikke eje duplicate server logic.
- `createServerFn` skal vaere tynd wrapper.
- Server-side compliance gate maa ikke stole paa klientens `hasHardStop`.
- Nye server function moenstre er beskyttet. PR skal markeres `🔒 Rører beskyttet fil — kræver review`.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. I `src/lib/cockpit.functions.ts`, eksportér schema input type:

   ```ts
   export const analysisInputSchema = z.object({ ... });
   export type AnalysisInputWithToken = z.infer<typeof analysisInputSchema>;
   ```

2. Opret testbare handler functions:

   ```ts
   export type CockpitServerDeps = {
     withAuth: typeof withAuth;
     analyseAddress: (
       input: Omit<AnalysisInputWithToken, "token"> & { userId: string },
     ) => Promise<ComplianceResult>;
     byggeanalyse: (
       input: ByggeanalyseInput & { ruleEngineResult?: RuleEngineResult },
     ) => Promise<ByggeanalyseResultat>;
     assembleRuleEngineInput: typeof assembleRuleEngineInput;
     runRuleEngine: typeof runRuleEngine;
     loggerWarn: (message: string, detail?: string) => void;
   };
   ```

3. Implementér:

   ```ts
   export async function handleFetchCompliance(
     rawData: unknown,
     deps: Pick<CockpitServerDeps, "withAuth" | "analyseAddress">,
   ): Promise<ComplianceResult> {
     const data = analysisInputSchema.parse(rawData);
     return deps.withAuth(data.token, async (userId) => {
       const { token: _token, ...analysisInput } = data;
       return deps.analyseAddress({ ...analysisInput, userId });
     });
   }
   ```

4. Implementér tilsvarende `handleRunByggeanalyse(rawData, deps)`.

   Den skal:
   - validere token.
   - assemble `RuleEngineInput`.
   - koere `runRuleEngine`.
   - sende `ruleEngineResult` ind i `ByggeanalyseService.analyse`.
   - ikke acceptere et klient-sendt hard-stop gate signal som autoritet.

5. Opdater `createServerFn` wrappers til at bruge handlers:

   ```ts
   export const fetchCompliance = createServerFn({ method: "POST" })
     .inputValidator((data: unknown) => analysisInputSchema.parse(data))
     .handler(async ({ data }) => {
       const { analyseAddress } = await import("@/lib/analysis-orchestrator");
       return handleFetchCompliance(data, { withAuth, analyseAddress });
     });
   ```

6. Fjern duplicate `createServerFn` declarations fra `src/routes/projekt.$id.cockpit.tsx`.

   Foer:

   ```ts
   const fetchCompliance = createServerFn(...);
   const runByggeanalyse = createServerFn(...);
   ```

   Efter:

   ```ts
   import { fetchCompliance, runByggeanalyse } from "@/lib/cockpit.functions";
   ```

7. Opret `src/lib/cockpit.functions.test.ts`.

   Test cases:
   - `handleFetchCompliance` parser valid input og kalder `analyseAddress` med `userId`.
   - Invalid coordinates eller tom token afvises.
   - `handleRunByggeanalyse` koerer `runRuleEngine` foer AI service.
   - Hvis rule engine throws, logger handleren warning og kalder stadig AI service med `ruleEngineResult` undefined, hvis det er den nuvaerende fail-open kontrakt.
   - Klientfelt som `hasHardStop` ignoreres, hvis det findes i raw payload.

### 5. DEFINITION OF DONE

- Route-filen importerer server functions fra `src/lib/cockpit.functions.ts` i stedet for at definere duplicate logic.
- Handler functions er testet uden TanStack runtime.
- Tests viser, at klient-sendt hard-stop gate signal ikke bruges.
- `bun test src/lib/cockpit.functions.test.ts` passer.
- PR markerer `🔒 Rører beskyttet fil — kræver review`.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/lib/cockpit.functions.test.ts
bun test src/lib/ai-design.functions.test.ts
bunx tsc --noEmit
bunx eslint .
```

Koer Playwright smoke bagefter, fordi route imports aendres:

```bash
bunx playwright test tests/cockpit-data.spec.ts
```

---

## Ticket 8

### 1. TITEL

Ryd op i lint, test scripts og testdokumentation

### 2. MAAL

Projektets quality gates skal vaere professionelle og entydige:

- README maa ikke sige Vitest, naar projektet bruger Bun test.
- `package.json` skal have klare scripts for unit/live/e2e/check.
- `bunx eslint .` skal passere med 0 errors.
- Warnings skal enten reduceres eller dokumenteres som eksisterende tech debt.

### 3. KONTEKST & REGLER

Aktuel README siger:

```md
| Tests | Vitest (unit) + Playwright (E2E) + eval-framework |
```

Aktuel `package.json` mangler `test` script:

```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "build:dev": "vite build --mode development",
  "preview": "vite preview",
  "lint": "eslint .",
  "format": "prettier --write .",
  "evals": "bun run evals/runner.ts"
}
```

Aktuel lint fejler bl.a. pga. Prettier errors i:

- `src/components/cockpit/EjendomPanel.tsx`
- `src/hooks/useCockpitAnalysis.ts`
- `src/hooks/useCockpitRestore.test.ts`
- `src/hooks/useCockpitRestore.ts`

Regler:

- `package.json` er beskyttet. PR skal markeres `🔒 Rører beskyttet fil — kræver review`.
- Brug ikke bred formatering af hele repoet, hvis det skaber unødvendig churn. Formatér kun filer med lint errors, medmindre teamet eksplicit beder om `bunx prettier --write .`.
- Skeln mellem errors og warnings. Definition of done kraever 0 errors; warnings kan dokumenteres, hvis de er eksisterende og ikke del af ticketets scope.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Opdater README testlinje.

   Foer:

   ```md
   | Tests | Vitest (unit) + Playwright (E2E) + eval-framework |
   ```

   Efter:

   ```md
   | Tests | Bun test (unit/integration) + Playwright (E2E) + eval-framework |
   ```

2. Opdater README commands.

   Foer:

   ```md
   bun test # Unit tests
   bun run evals # AI eval-suite (mock mode)
   ```

   Efter:

   ```md
   bun test # Unit tests
   bun run test:live # Explicit live integration tests (requires env)
   bunx playwright test # E2E tests
   bun run evals # AI eval-suite (mock mode)
   ```

3. Opdater `package.json` scripts, koordineret med Ticket 2 hvis det er implementeret.

   Efter anbefalet baseline:

   ```json
   "scripts": {
     "dev": "vite dev",
     "build": "vite build",
     "build:dev": "vite build --mode development",
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
     "evals": "bun run evals/runner.ts",
     "test": "bun test src",
     "test:e2e": "bunx playwright test",
     "test:live": "bun test tests/live",
     "check": "bunx tsc --noEmit && bunx eslint . && bun test src && bun run build"
   }
   ```

4. Fix Prettier errors med targeted command:

   ```bash
   bunx prettier --write src/components/cockpit/EjendomPanel.tsx src/hooks/useCockpitAnalysis.ts src/hooks/useCockpitRestore.ts
   ```

   Hvis Ticket 1 er implementeret, formatter den nye fil:

   ```bash
   bunx prettier --write src/hooks/cockpit-restore-utils.ts src/hooks/cockpit-restore-utils.test.ts
   ```

5. Koer lint:

   ```bash
   bunx eslint .
   ```

6. Hvis lint stadig har warnings, opret `docs/lint-warning-backlog.md` med grupper:
   - `no-console` i `agent/`, `scripts/`, `evals/`
   - `@typescript-eslint/no-explicit-any` i integrationsklienter/tests
   - `react-refresh/only-export-components` i UI primitives
   - React hook dependency warnings i `MatrikelMap`

   Dokumentet skal ikke undskylde warnings; det skal eje dem som backlog med konkrete filer.

### 5. DEFINITION OF DONE

- README siger Bun test, ikke Vitest.
- `package.json` har `test`, `test:e2e`, `test:live` og `check` scripts.
- `bunx eslint .` har 0 errors.
- Eksisterende warnings er enten reduceret eller dokumenteret i `docs/lint-warning-backlog.md`.
- PR markerer `🔒 Rører beskyttet fil — kræver review`.

### 6. TEST STRATEGI

Koer:

```bash
bunx eslint .
bun run check
```

Hvis `bun run check` er for tungt under implementation, koer minimum:

```bash
bunx tsc --noEmit
bun test src
bun run build
```

---

## Ticket 9

### 1. TITEL

Erstat auto-committede AI-test skeletons med reviewable test suggestions

### 2. MAAL

CI maa ikke automatisk committe AI-genererede tests til PR branches uden at koere dem og uden human review. Workflowet skal i stedet producere en artifact eller PR-kommentar med forslag, som udvikleren kan kopiere/implementere bevidst.

### 3. KONTEKST & REGLER

Aktuel workflow i `.github/workflows/generate-tests.yml` genererer tests via Anthropic og committer dem:

```yaml
- name: Commit genererede tests
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add 'src/**/*.test.ts' 2>/dev/null || git add $(find src -name "*.test.ts" 2>/dev/null) || true
    if git diff --cached --quiet; then
      echo "Ingen nye tests genereret"
    else
      git commit -m "test: auto-generer test-skeletons [skip ci]"
      git push
    fi
```

Workflow prompt truncater store filer:

```py
if len(lines) > 200:
    content = "\n".join(lines[:200]) + "\n// ... (truncated)"
```

Regler:

- AI-genererede tests maa gerne bruges som forslag.
- De maa ikke auto-committes til protected/active PR uden review.
- Hvis workflowet laver artifacts, skal det ikke kraeve write permission.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Aendr workflow permissions:

   Foer:

   ```yaml
   permissions:
     contents: write
   ```

   Efter:

   ```yaml
   permissions:
     contents: read
     pull-requests: write
   ```

   Hvis PR-kommentar ikke bruges, kan `pull-requests: write` udelades.

2. Aendr generatoren til at skrive output i en suggestions-mappe:

   ```py
   suggestion_dir = "test-suggestions"
   os.makedirs(suggestion_dir, exist_ok=True)
   suggestion_path = os.path.join(suggestion_dir, test_path.replace("/", "__"))
   with open(suggestion_path, "w", encoding="utf-8") as f:
       f.write(test_content + "\n")
   ```

3. Fjern commit/push step helt.

   Foer:

   ```yaml
   - name: Commit genererede tests
     run: |
       git add ...
       git commit ...
       git push
   ```

   Efter:

   ```yaml
   - name: Upload generated test suggestions
     uses: actions/upload-artifact@v4
     if: always()
     with:
       name: generated-test-suggestions
       path: test-suggestions/
       retention-days: 7
   ```

4. Tilfoej en summary step:

   ```yaml
   - name: Summarize suggestions
     if: always()
     run: |
       echo "Generated test suggestions are available as an artifact." >> "$GITHUB_STEP_SUMMARY"
       find test-suggestions -type f -maxdepth 1 2>/dev/null | sed 's#^#- #' >> "$GITHUB_STEP_SUMMARY" || true
   ```

5. Hvis workflow skal kommentere paa PR, brug `gh pr comment` eller GitHub script, men kun med links til artifact/summary. Undgaa at paste lange generated tests i PR-kommentar.

6. Opdater workflow name til at tydeliggoere forslag:

   ```yaml
   name: Generate Unit Test Suggestions
   ```

### 5. DEFINITION OF DONE

- Workflow committer ikke laengere til PR branch.
- `contents: write` er fjernet.
- Genererede tests gemmes som artifact.
- Workflow summary fortaeller hvilke files der har suggestions.
- CI unit-job er stadig autoritativ for, hvad der faktisk merges.

### 6. TEST STRATEGI

Da GitHub workflow ikke kan fuldt verificeres lokalt, lav disse checks:

```bash
bunx prettier --check .github/workflows/generate-tests.yml
```

Manuel review:

- Se at ingen step kalder `git commit`.
- Se at ingen step kalder `git push`.
- Se at `contents: write` ikke findes i workflowet.

Koer workflow manuelt paa en test-PR og verificer, at artifact `generated-test-suggestions` bliver uploadet.

---

## Ticket 10

### 1. TITEL

Goer retry/backoff tests deterministiske

### 2. MAAL

Tests for retry/backoff maa ikke vente paa real time eller bruge nondeterministisk jitter. `fetchWithRetry` skal kunne testes med injiceret sleep/jitter/clock, saa tests bliver hurtige, deterministiske og uden flaky timing.

### 3. KONTEKST & REGLER

Aktuel kode i `src/integrations/http/fetch-with-retry.ts`:

```ts
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  // +/- 20%
  const delta = ms * 0.2;
  return ms + (Math.random() * 2 - 1) * delta;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: Partial<RetryOptions>,
  traceOptions?: FetchTraceOptions,
): Promise<Response> {
  // ...
  const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
  await sleep(delay);
}
```

Aktuel test bruger real delay, dog lavt:

```ts
const result = await fetchWithRetry("https://example.com", {}, { retries: 1, retryDelayBaseMs: 1 });
```

Regler:

- Production default behavior skal vaere uændret.
- Tests skal kunne bruge `sleep: async () => {}` og `jitter: (ms) => ms`.
- Trace duration maa kunne vaere deterministisk, hvis clock injiceres.

### 4. TRIN-FOR-TRIN INSTRUKSER

1. Udvid options type:

   ```ts
   export type RetryRuntime = {
     sleep: (ms: number) => Promise<void>;
     jitter: (ms: number) => number;
     now: () => number;
   };
   ```

2. Tilfoej default runtime:

   ```ts
   const defaultRuntime: RetryRuntime = {
     sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
     jitter: (ms) => {
       const delta = ms * 0.2;
       return ms + (Math.random() * 2 - 1) * delta;
     },
     now: () => Date.now(),
   };
   ```

3. Udvid `fetchWithRetry` signatur uden at bryde eksisterende callers:

   ```ts
   export async function fetchWithRetry(
     input: RequestInfo | URL,
     init?: RequestInit,
     options?: Partial<RetryOptions>,
     traceOptions?: FetchTraceOptions,
     runtime: RetryRuntime = defaultRuntime,
   ): Promise<Response> {
     // ...
   }
   ```

4. Erstat interne kald:

   Foer:

   ```ts
   const startedAt = Date.now();
   const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
   await sleep(delay);
   durationMs: Math.max(0, Date.now() - startedAt),
   ```

   Efter:

   ```ts
   const startedAt = runtime.now();
   const delay = runtime.jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
   await runtime.sleep(delay);
   durationMs: Math.max(0, runtime.now() - startedAt),
   ```

5. Opdater test:

   ```ts
   const sleeps: number[] = [];
   const runtime = {
     sleep: async (ms: number) => {
       sleeps.push(ms);
     },
     jitter: (ms: number) => ms,
     now: () => 1_000,
   };

   const result = await fetchWithRetry(
     "https://example.com",
     {},
     { retries: 1, retryDelayBaseMs: 500 },
     undefined,
     runtime,
   );

   expect(result.status).toBe(200);
   expect(sleeps).toEqual([500]);
   ```

6. Tilfoej en test for non-retryable status:

   ```ts
   it("does not sleep for non-retryable 400", async () => {
     // fetch returns 400
     // expect calls=1 and sleeps=[]
   });
   ```

### 5. DEFINITION OF DONE

- `fetchWithRetry` production callers kraever ingen aendring.
- Tests bruger injiceret runtime og venter ikke paa real timers.
- Retry delay sequence kan assertes deterministisk.
- `Math.random()` bruges kun i default runtime, ikke i test path.

### 6. TEST STRATEGI

Koer:

```bash
bun test src/integrations/http/fetch-with-retry.test.ts
bunx tsc --noEmit
```

Valider at testen stadig passer, hvis `retryDelayBaseMs` saettes til et stort tal i testen, fordi `sleep` er mocked og ikke venter.
