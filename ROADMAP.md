# Refactoring Roadmap

Opdateret vurdering af teknisk gæld og arkitektur-opretning pr. 2026-05-30.

Denne roadmap er rebased mod den aktuelle kodebase og følger reglerne i
`CLAUDE.md` og `AGENTS.md`.

Statusmarkeringer:

- `[x]` Løst eller i praksis afklaret i den nuværende kodebase
- `[-]` Delvist løst / kræver opfølgning i reduceret form
- `[ ]` Stadig aktiv og relevant
- `[!]` Forældet reference i den gamle roadmap; behold temaet, men ikke den gamle fil-/løsningsbeskrivelse

---

## Topprioriteter

1. [x] **Domain Contract Extraction**
   - Vurdering: Overordnet løst.
   - Begrundelse: Domænelaget fremstår fortsat rent, og flere boundary-moduler bruger nu reelle schemas/decoders, fx `src/integrations/supabase/repositories/projects.repository.ts`.
   - Opfølgning: Ingen selvstændig epic nødvendig. Nye ændringer skal blot fortsætte samme retning.

2. [-] **Boundary Cleanup**
   - Vurdering: Størstedelen er nu løst, men enkelte hotspots er stadig åbne.
   - Problem: De fleste tunge server boundaries er ryddet op, men enkelte klientnære workflows og kompositionslag bærer stadig for meget orchestration.
   - Særligt fokus:
     - `src/hooks/useCockpitAnalysis.ts`
     - `src/routes/__root.tsx`
     - `src/routes/projekt.datacheck.tsx`
     - `src/routes/debug.analyse.tsx`
     - `src/lib/billede-analyse.functions.ts`
     - `src/lib/project-sync.ts`

3. [-] **Validation**
   - Vurdering: Væsentligt forbedret, men ikke helt lukket.
   - Problem: De vigtigste server boundaries og restore/persisted payloads er nu valideret bedre, men der findes stadig resterende kontraktoprydning.
   - Retning: Prioritér boundary-validation før oprydning i interne eller testrelaterede casts.

4. [-] **Fase-normalisering**
   - Vurdering: Kerne og navigation er normaliseret, men den sidste produktmæssige afstemning er stadig åben.
   - Problem: Koden er nu i hovedtræk flyttet til de 4 kanoniske faser, men enkelte read-models og progressionstolkninger mangler endelig afklaring:
     - `Sandkassen`
     - `Matriklen`
     - `Maskinrummet`
     - `Myndighed`
   - Særligt synligt i:
     - `src/types/project-state.ts`
     - `src/lib/phases.ts`
     - `src/lib/datacheck.ts`
     - `src/lib/datacheck-config.ts`

---

## Rebased Status På Tidligere Findings

### Allerede helt eller næsten løst

1. [x] **`AiDesignHero` er ikke længere hovedproblemet**
   - Filer:
     - `src/components/cockpit/AiDesignHero.tsx`
     - `src/hooks/useAiDesignWorkflow.ts`
     - `src/lib/services/ai-design-workflow.service.ts`
   - Vurdering: Den gamle finding er i store træk adresseret.
   - Bemærkning: Workflowet er flyttet ud af komponenten, så det konkrete roadmap-item bør ikke længere stå som åbent i sin gamle form.
   - Rest-risiko: Hooken er stadig tæt koblet til global store og `syncPatch`, så opfølgningen hører nu under det bredere “workflow/persistence separation”-spor.

2. [x] **`MatrikelMap` er delvist ryddet op i den retning roadmapet efterspurgte**
   - Filer:
     - `src/components/cockpit/MatrikelMap.tsx`
     - `src/hooks/useParcelData.ts`
     - `src/hooks/usePlacementSync.ts`
   - Vurdering: Den gamle finding er i væsentlig grad adresseret.
   - Bemærkning: Komponenten bruger nu fokuserede hooks til parceldata og placement-sync.
   - Rest-risiko: Hooks er fortsat koblet til `syncPatch` og store-state, men problemet er ikke længere primært i komponenten selv.

3. [x] **`cockpit-restore-utils.ts` er forbedret**
   - Fil: `src/hooks/cockpit-restore-utils.ts`
   - Vurdering: Den tidligere kritik af ukontrolleret `objectField<T>()`-casting er i praksis løst.
   - Bemærkning: Modulet bruger nu schema-baseret decoding via `decodeWithSchema`.

4. [x] **Repository-boundary for `projects.repository.ts` er styrket**
   - Fil: `src/integrations/supabase/repositories/projects.repository.ts`
   - Vurdering: Den gamle finding om rå casts er i store træk løst.
   - Bemærkning: `loadProject()` og snapshot-load bruger nu schemas.

### Delvist løst eller ændret form

1. [-] **`cockpit/index.tsx` er forbedret, men ikke helt “adapter-tynd”**
   - Fil: `src/components/cockpit/index.tsx`
   - Vurdering: Delvist løst.
   - Begrundelse: Constraint- og dispensation-logik er flyttet i bedre retning via fx:
     - `buildStepConstraintViewModel()`
     - `useDispensationFlow()`
   - Restarbejde: Komponenten bærer stadig en del workflow- og projectionsammensætning og bør fortsat tyndes ud gradvist.

2. [-] **`project-sync.ts` er blevet bedre valideret, men er stadig ikke helt afviklet som legacy-lag**
   - Fil: `src/lib/project-sync.ts`
   - Vurdering: Delvist løst.
   - Begrundelse: Der er nu Zod-schemas i `src/types/project-sync.schemas.ts`, eksplicitte save/restore-contexts og workflow-lag til både save og restore.
   - Restarbejde:
     - `syncPatch()` er fjernet helt
     - `restoreProject()` findes stadig som compatibility helper
     - `project-sync.ts` fungerer stadig delvist som legacy adapter ved siden af de nye workflows

3. [-] **`__root.tsx` er mindre usikker end før, men stadig arkitektonisk tung**
   - Fil: `src/routes/__root.tsx`
   - Vurdering: Delvist løst.
   - Begrundelse: Restore går nu gennem shared facade/workflow-lag og typed snapshot-kontrakter.
   - Restarbejde: Root-route ejer stadig noget bootstrap/orchestration, men ikke længere den store felt-for-felt restore-logik.

4. [-] **`useCockpitAnalysis.ts` er fortsat et hotspot**
   - Fil: `src/hooks/useCockpitAnalysis.ts`
   - Vurdering: Delvist løst, men stadig et vigtigt opfølgningspunkt.
   - Restarbejde:
     - compliance-fetch, byggeanalyse-fetch og resultatanvendelse er nu flyttet til workflow/facade-lag
     - hooken bærer stadig React-orkestrering og en del store-koordination
     - videre tynding bør ske gradvist, ikke som fuld omskrivning

### Forældede referencespor i gammel roadmap

1. [!] **`src/lib/pre-check-adresse.ts` findes ikke længere på den nævnte sti**
   - Vurdering: Den konkrete reference i den gamle roadmap er forældet.
   - Konsekvens: Eventuel opfølgning skal baseres på den nuværende pre-check-arkitektur, ikke på den gamle filsti.

2. [!] **Flere gamle findings peger på filer, der siden er flyttet eller refaktoreret**
   - Vurdering: Roadmapet skal bruges som retning, ikke som bogstavelig filcheckliste.

---

## Aktiv Arbejdsplan

### Spor 1 — Fase-normalisering

1. [x] Indfør én kanonisk fasekontrakt på tværs af typer, navigation og UI.
   - Start i `src/types/project-state.ts`
   - Opdater derefter `src/lib/phases.ts`
   - Synkronisér `src/lib/datacheck.ts` og `src/lib/datacheck-config.ts`

2. [-] Fjern eller oversæt gamle fase-ID’er og labels.
   - Udfas:
     - `hus-dna`
     - `match`
     - `finans`
     - `engineering`
     - `udbud`
     - `skitse`
   - Erstat med de 4 kanoniske faser fra `AGENTS.md`

3. [-] Tilpas faseafhængig store-state og UI-flow.
   - Særligt i `src/hooks/useCockpitAnalysis.ts`
   - Verificér at sidebars, progressionsvisning og readiness-views stadig giver mening efter normaliseringen

### Spor 2 — Server Boundaries Med Runtime-validering

1. [x] Stram `src/routes/api.map-tiles.ts`
   - Erstat type-only validators med Zod-schemas for:
     - parcel geometry request
     - parcel preview request
     - tile request
     - `jordstykkeLokalId`

2. [x] Stram `src/routes/projekt.datacheck.tsx`
   - Flyt load/save-workflow til service-lag
   - Brug etableret auth-pattern i stedet for rå token-flow til persistence

3. [x] Stram `src/routes/debug.analyse.tsx`
   - Indfør eksplicit auth-/miljø-gate
   - Lad route-serverfunktion være tynd wrapper omkring service

4. [x] Stram `src/lib/billede-analyse.functions.ts`
   - Flyt project ownership, auth og storage-arbejde ud af server function handleren
   - Behold handleren som validate -> auth -> delegate

### Spor 3 — Restore Og Sync Som Rigtigt Application-lag

1. [x] Indfør typed restore snapshot/facade
   - Mål: `__root.tsx` og cockpit-hooks skal modtage et valideret snapshot frem for at samle persisted state stykkevis

2. [-] Flyt restore-hydrering ud af root-route
   - Fil: `src/routes/__root.tsx`
   - Root-route bør ikke eje stor felt-for-felt restore-logik

3. [x] Afkobling af `syncPatch()` fra global store og intern auth lookup
   - Fil: `src/lib/project-sync.ts`
   - Mål: Kaldende lag skal levere nødvendig kontekst, så sync-laget bliver testbart og mindre magisk

### Spor 4 — Cockpit-workflows Ud Af UI-nære Hooks

1. [-] Split `src/hooks/useCockpitAnalysis.ts`
   - Del i:
     - typed compliance-fetch/service
     - snapshot transformer / mapping-lag
     - tynd React-hook

2. [-] Gennemgå `src/hooks/useAiDesignWorkflow.ts`
   - Ikke en akut P0, men næste naturlige kandidat efter `useCockpitAnalysis`
   - Fokus: reducér direkte `useProject.getState()`- og global store-kobling yderligere

3. [ ] Tynd `src/components/cockpit/index.tsx` yderligere
   - Flyt mere sammensætning/projection ud i view-model helpers
   - Hold komponenterne på render + brugerintention

### Spor 5 — Målrettet Validation Cleanup

1. [-] Fjern manglende runtime-kontrakter før kosmetiske casts
   - Prioritér boundary-data over interne UI-casts

2. [-] Gennemgå gamle fase- og restore-relaterede typer
   - Fil: `src/types/project-state.ts`
   - Mål: sikre at persisted og runtime-relevante contracts matcher den aktuelle arkitektur

3. [ ] Kør en targeted søgning efter boundary-risici efter hvert større spor
   - Fokus på:
     - `as unknown as`
     - type-only `inputValidator`
     - direkte persistence i server handlers
     - rå restore af JSONB-lignende data

---

## Anbefalet Implementeringsrækkefølge

1. [x] Fase-normalisering
2. [x] `api.map-tiles` runtime-validation
3. [x] `projekt.datacheck` service/auth cleanup
4. [x] `debug.analyse` auth/miljø-gate
5. [x] `project-sync` restore/sync-afkobling
6. [x] `__root.tsx` typed restore facade
7. [-] Split af `useCockpitAnalysis`
8. [ ] Opfølgning på `useAiDesignWorkflow` og resterende cockpit-view-models

---

## Definition Of Done For Hvert Spor

- [-] Boundary-data valideres ved runtime med Zod eller eksplicit decoder
- [-] UI ejer ikke compliance- eller persistencepolitik
- [-] Server functions er tynde inbound adapters
- [x] Restore/sync kan testes uden implicit afhængighed af global store
- [-] Faser bruger de kanoniske navne fra `AGENTS.md`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test`
- [ ] `bunx eslint .`
- [ ] `bun run build`

---

## Seneste Findings — Fasefortælling Og Konsekvenser

Dato: 2026-05-30

### Afklaret produktforståelse

- `Sandkassen` er en fremtidig alternativ startvej for brugere uden adresse, der vil udforske drømmehus, stil og behov.
- `Matriklen` er den nuværende reelle start for produktet: adresse valgt, grundens rammer og risici samlet.
- `Maskinrummet` er arbejdsrummet, hvor projektet formes og modnes mod en realistisk løsning.
- `Myndighed` er fasen, hvor projektet omsættes til ansøgningsklar dokumentation og materiale.

### Konsekvensvurdering af fuld faseomskrivning

- Teknisk risiko: lav til moderat.
- Produktmæssig risiko: moderat til høj, hvis vi ændrer fortællingen uden at tage de vigtigste følgeændringer med.

### Hvad går sandsynligvis ikke i stykker

- Persistence, registerdata, hard-stop-logik og de fleste serverintegrationer.
- Eksisterende projekter og gemte data.

### Hvad risikerer at blive semantisk skævt

- `Sandkassen` findes endnu ikke som reel selvstændig vej i produktet.
- `Maskinrummet` er endnu ikke 100% identisk med cockpit-oplevelsen, som stadig også rummer analyse og ejendomsforståelse.
- `Myndighed` er indholdsmæssigt stadig delt mellem teknik/ansøgning og senere udbuds-/gennemførelsesmateriale.
- `datacheck`/readiness lever stadig delvist i en gammel faseverden med `skitse/myndighed/udbud`.

### Anbefalet migrationsstrategi

1. Lås den nye fasefortælling produktmæssigt.
2. Behandl `Matriklen` som den faktiske nuværende start.
3. Lad `Sandkassen` eksistere som fremtidig vej uden at foregive, at den er fuldt aktiv nu.
4. Oversæt `datacheck`/readiness til samme fasefortælling.
5. Fold teknik og udbud tydeligere ind under `Myndighed`, før vi lover en helt ren 4-fase oplevelse.

### Status siden denne vurdering

- [x] Kanoniske faser indført i type/store-kernen.
- [x] Fasenavigation opdateret til `Sandkassen`, `Matriklen`, `Maskinrummet`, `Myndighed`.
- [x] `api.map-tiles` har nu runtime-validation.
- [x] `projekt.datacheck` er flyttet til validate -> auth -> delegate.
- [x] `debug.analyse` bruger nu middleware-baseret auth og server-side brugerafgrænsning.
- [-] `datacheck`/readiness er delvist oversat til den nye fasefortælling, men kræver stadig sidste produktmæssige oprydning.

---

## Status Efter Seneste Refaktorering

- [x] `syncPatch()` er fjernet helt fra `src/lib/project-sync.ts`.
- [x] Save-flows bruger nu eksplicitte workflow-indgange med kendt kontekst i stedet for global implicit sync.
- [x] Restore går gennem shared workflow + facade i stedet for duplikeret felt-for-felt hydrering.
- [x] `useCockpitAnalysis.ts` er reduceret via dedikerede workflow- og facade-lag.
- [ ] `restoreProject()` står stadig tilbage som compatibility helper og bør vurderes afviklet eller markeret tydeligere som legacy.
- [ ] `useAiDesignWorkflow.ts` og `src/components/cockpit/index.tsx` er de tydeligste tilbageværende UI-nære opfølgningsspor.
