# Plan: Restore compliance_data ved "Fortsæt" på eksisterende projekt

**Dato:** 2026-05-30
**Status:** Implementing
**Linear/Issue:** (none — diagnostic finding, se conversation 2026-05-30)

## Problem

`src/hooks/useCockpitRestore.ts:25-29` springer Supabase-restore over hvis
adressen i store allerede matcher URL'en — uden at tjekke om vi rent faktisk
har compliance-data in-memory.

`src/routes/projekt.start.tsx:196-226` (`handleFortsaet`) kalder `reset()` →
`setAddress(addr)` → `navigate(...)`. Når cockpit'et mounter, matcher adressen
URL'en, så restore springes over. Men `reset()` har nulstillet `bbrData`,
`lokalplaner`, osv. → `useCockpitAnalysis` ser `bbrData=null` og fyrer en frisk
`fetchCompliance` selvom projektets compliance ligger i Supabase.

Empirisk bekræftet: today's run pair (`a3783911`, `6d63fca9`) — to fulde
analyser kørt på samme adresse/projekt på samme bruger 29.5 sek apart, begge med
`source: analyseAddress`. Den ene er Run #2 ovenfor.

## Boundary & arkitektur (Gatekeeper Protocol)

1. **Boundary:** UI-flow-hook læser project-store. Ingen ny ekstern boundary.
2. **Schema:** Ingen ny — eksisterende `project-restore.schemas` validerer det
   Supabase-svar `hydrateProjectIntoStore` arbejder på.
3. **Business logic:** Tjekket "har vi compliance i hukommelsen?" er UI-flow,
   ikke compliance-sandhed. Forbliver i hook.
4. **Application service:** Ingen ny — eksisterende `loadProjectRestore`
   (project-sync) + `hydrateProjectIntoStore` (project-restore-facade).
5. **Adapter:** `loadProjectRestore` er det inbound adapter; uændret.
6. **UI domain logic:** Rule 4 (server-side compliance authority) er upåvirket
   — denne fix vælger blot mellem "læs gemt analyse" og "kør ny analyse".
   Server validerer fortsat Hard Stop før AI.
7. **Tests:** `src/hooks/useCockpitRestore.react.test.tsx` udvides:
   - `bbrData=null` + matching address → restore KØRES (selv hvis address
     matcher URL'en).
   - `bbrData` sat + matching address → restore SPRINGES over.
   - Initial `restorePhase` er `"pending"` indtil restore er færdig, hvis
     `bbrData` mangler.

## Implementation

`src/hooks/useCockpitRestore.ts`:
- Subscribe også til `bbrData` fra store.
- Initial `restorePhase = "checked"` kun hvis address matcher OG `bbrData`
  er sat.
- Early-return i useEffect tilsvarende — brug `useProject.getState().bbrData`
  for at undgå stale-closure.

Det er den eneste ændring. Ingen ændringer til `useCockpitAnalysis`,
`project-restore-facade`, `loadProjectRestore`, eller persistens.

## Test plan

- Opdatér den eksisterende "sætter restorePhase=checked straks hvis adressen
  allerede matcher" test så den pre-populerer `bbrData` ud over address.
- Ny test: address matcher men bbrData mangler → restore kører.
- Ny test: address matcher OG bbrData sat → restore springes over.

## Definition of Done

- [ ] Nye/opdaterede tests passerer (`bun test src/hooks/useCockpitRestore.react.test.tsx`)
- [ ] `bunx tsc --noEmit` clean
- [ ] `bunx eslint src/hooks/useCockpitRestore.ts` clean
- [ ] Ingen new `any`, ingen direkte Supabase-kald i hook, ingen circular imports.
