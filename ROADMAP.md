# Refactoring Roadmap
Prioriteret rækkefølge for teknisk gæld og arkitektur-opretning:
1. [x] **Domain Contract Extraction:** Bryd afhængigheden fra `src/lib/rule-engine` og `src/lib/compliance-engine` til `src/integrations`.
2. [ ] **Boundary Cleanup:** Flyt inline Supabase/storage/AI-kald ud af `createServerFn` til repositories.
3. [ ] **Validation:** Erstat `as any`/`as unknown` casts med Zod-schemas.
4. [ ] **Fase-normalisering:** Synkronisér alle faser med de 4 kanoniske faser fra AGENTS.md.

## Components audit (`src/components`)

### Prioriterede findings

1. [ ] **`AiDesignHero` er blevet workflow-lag i UI**
   - Fil: `src/components/cockpit/AiDesignHero.tsx`
   - Problem: Komponenten henter auth-session, uploader billeder, kalder AI-funktioner, merger store-state via `useProject.getState()` og persisterer direkte med `syncPatch`.
   - AGENTS-brud: Rule 2 (UI Is An Adapter), Rule 7 (Refactor Dirty Domain Boundaries Before Extending).
   - Refaktorering: Flyt upload/analyse/generering/persistens til en fokuseret hook eller application service, fx `useAiDesignWorkflow`, så komponenten kun renderer state og videresender brugerintention.

2. [ ] **`MatrikelMap` kalder serverfunktioner og persistence direkte fra UI**
   - Fil: `src/components/cockpit/MatrikelMap.tsx`
   - Problem: Komponenten importerer route server functions fra `@/routes/api.map-tiles`, bruger `useServerFn` direkte, henter geometri/preview i `useEffect` og skriver adresseændringer tilbage med `syncPatch`.
   - AGENTS-brud: Rule 2 (UI Is An Adapter), Rule 3 ånd (serverfunktioner bør forblive inbound adapters), Rule 7.
   - Refaktorering: Indfør et typed hook eller adapterlag, fx `useParcelPreview` og `usePlacementSync`, så komponenten ikke kender routes, server functions eller sync-mekanismen.

3. [ ] **`cockpit/index.tsx` rummer domænepolitik og dispensation-workflow**
   - Fil: `src/components/cockpit/index.tsx`
   - Problem: `StepExtras` og `DispensationModal` tolker `boligoenskeValidering`, matcher konkrete compliance-flag IDs og bruger tekstmatch på labels for at udlede regler.
   - AGENTS-brud: Rule 2 (UI Is An Adapter), Rule 7, samt forbuddet mod regex/free-text parsing til compliance-kategorier i UI.
   - Refaktorering: Flyt constraint- og dispensation-logik til typed view-model builders eller hooks, fx `buildByggeoenskeConstraintViewModel()` og `useDispensationFlow()`.

4. [ ] **`BudgetKalkulator` blander pure budgetdomæne med UI-persistence**
   - Fil: `src/components/cockpit/BudgetKalkulator.tsx`
   - Problem: Beregningsfunktionerne er pure, men de bor i komponentfilen, og komponenten skriver `budget_estimate` tilbage til store og sync-lag i et effect.
   - AGENTS-brud: Rule 2, Rule 7.
   - Refaktorering: Flyt budgetberegning til et rent domæne/helper-modul og flyt synkronisering til et fokuseret hook eller service.

5. [ ] **`AnalyseTab` indeholder spredte threshold-regler og semantisk tolkning i præsentationslaget**
   - Fil: `src/components/cockpit/AnalyseTab.tsx`
   - Problem: Lokalplaner klassificeres via tekstmatch, naboafstande og terrænrisiko vurderes via inline thresholds, og fallback-vurderingstekst genereres direkte i komponenten.
   - AGENTS-brud: Rule 2, Rule 7.
   - Refaktorering: Flyt regel- og klassificeringslogik til view-model helpers eller domænenære pure moduler, og lad komponenten kun renderere færdigformaterede sektioner.

6. [ ] **`FreeDesignCockpit` bruger usikre casts mod store-state**
   - Fil: `src/components/cockpit/FreeDesignCockpit.tsx`
   - Problem: Flere `as never`-casts bruges for at skrive direkte til `setByggeoenske`.
   - AGENTS-brud: Validation/typed boundary-principperne.
   - Refaktorering: Indfør typed field-actions eller et lille form-hook, så UI ikke skal omgå typesystemet.

### Sekundære observationer

- [ ] **`EjendomPanel` er overvejende præsentationsnær, men beregner stadig fallback- og sammenstillingslogik lokalt**
  - Fil: `src/components/cockpit/EjendomPanel.tsx`
  - Problem: Komponenten sammenstykker selv værdier fra typed columns, compliance metrics, BBR og `adressePreCheck`.
  - Refaktorering: Overvej en samlet `buildPropertyPanelViewModel()` for at reducere ad hoc fallbackkæder i UI.

- [ ] **`RisikoFeed` og `RiskOverview` peger på den rigtige retning**
  - Filer: `src/components/cockpit/RisikoFeed.tsx`, `src/components/cockpit/RiskOverview.tsx`
  - Observation: De bruger i højere grad eksisterende view-model helpers og er tættere på AGENTS-målet om UI som adapter.
  - Opfølgning: Brug disse som reference, når de mere workflow-tunge cockpit-komponenter splittes op.

## Routes audit (`src/routes`)

### Prioriterede findings

1. [ ] **`__root.tsx` udfører restore-orchestration og hydrerer store direkte fra route-laget**
   - Fil: `src/routes/__root.tsx`
   - Problem: Root-routen kalder `restoreProject()`, parser route/path/query selv, og skriver et stort antal felter direkte ind i `useProject()`-store med mange ad hoc branch/fallbacks.
   - AGENTS-brud: Rule 1 (boundary validation), Rule 7 (dirty boundary), samt generel architectural drift væk fra ports/adapters.
   - Særligt risikabelt: `project.billedanalyse as unknown as BilledeAnalyseResultat`, `project.brief_data as Record<string, unknown>` og restore af JSONB/data uden et samlet typed restore-contract.
   - Refaktorering: Flyt restore til en dedikeret application service eller typed restore-adapter, der returnerer en valideret `ProjectRestoreSnapshot`, som route-laget kun anvender.

2. [ ] **`projekt.adresse.tsx` ejer compliance-gate og dispensation-politik i UI**
   - Fil: `src/routes/projekt.adresse.tsx`
   - Problem: Routen opdeler blockers i hard/soft ud fra `dispensationMulig`, styrer override-flow og afgør, hvornår brugeren må fortsætte.
   - AGENTS-brud: Rule 2 (UI Is An Adapter), Rule 4 (server-side compliance authority), Rule 7.
   - Refaktorering: Flyt gate-semantik til et typed precheck view-model/hook, fx `useAddressGateViewModel()`, hvor UI kun gengiver server-/domain-afgjorte states.

3. [ ] **`projekt.datacheck.tsx` har server functions, der går direkte til persistence uden `withAuth()` eller service-lag**
   - Fil: `src/routes/projekt.datacheck.tsx`
   - Problem: `loadDatacheck` og `saveDatacheck` validerer input, men går direkte til `project-persistence` og håndterer auth-token som rå data i stedet for at bruge den etablerede server function pattern.
   - AGENTS-brud: Rule 3 (Server Functions Are Inbound Adapters), Rule 1.
   - Refaktorering: Lad server functions være tynde wrappers med `withAuth()` og et import af en fokuseret datacheck-service, som ejer load/save-workflowet.

4. [ ] **`api.map-tiles.ts` bruger type-only inputValidator og validerer ikke reelt boundary-data**
   - Fil: `src/routes/api.map-tiles.ts`
   - Problem: `inputValidator((data: ParcelGeometryRequest) => data)` og tilsvarende giver TypeScript-tryghed, men ingen runtime-validering.
   - AGENTS-brud: Rule 1 (Contract-First Boundaries).
   - Refaktorering: Indfør Zod-schemas eller eksplicitte decoders for `ParcelGeometryRequest`, `ParcelPreviewRequest`, `TileRequest` og `jordstykkeLokalId`.

5. [ ] **`debug.analyse.tsx` mangler tydelig auth-gating på server-side**
   - Fil: `src/routes/debug.analyse.tsx`
   - Problem: Server functionen modtager token i payload og sender det videre, men følger ikke det etablerede `withAuth()`-mønster. Debug-routen er omtalt som intern, men den kontrakt håndhæves ikke her.
   - AGENTS-brud: Rule 3.
   - Refaktorering: Indfør eksplicit auth/role-gate i serverfunktionen eller flyt debug-opslaget til en service, der håndhæver miljø- og brugerkrav.

### Sekundære observationer

- [ ] **`projekt.start.tsx` samler for meget projekt-workflow i route-komponenten**
  - Fil: `src/routes/projekt.start.tsx`
  - Problem: Route-komponenten står selv for session-check, projektliste-load, projektoprettelse, sletning og delvis state-restore før navigation.
  - Refaktorering: Overvej et `useProjectStartPage()`-hook eller en dedikeret facade for projektliste-handlinger, så route-komponenten bliver mere præsentationsnær.

- [ ] **`projekt.$id.cockpit.tsx` er i bedre form end de øvrige routes**
  - Fil: `src/routes/projekt.$id.cockpit.tsx`
  - Observation: Routen bruger allerede `useCockpitRestore` og `useCockpitAnalysis`, hvilket er tættere på AGENTS’ ønskede separering.
  - Opfølgning: Brug denne route som referencepunkt, når `projekt.adresse.tsx` og `projekt.start.tsx` senere tyndes ud.

## Hooks audit (`src/hooks`)

### Prioriterede findings

1. [ ] **`useCockpitAnalysis` fungerer som application service, persistence-adapter og UI-hook på samme tid**
   - Fil: `src/hooks/useCockpitAnalysis.ts`
   - Problem: Hooken henter auth-session, kalder `fetchCompliance` og `runByggeanalyse`, afleder compliance flags og metrics, opdaterer store, sætter fase-status og persisterer direkte via `syncPatch`.
   - AGENTS-brud: Rule 2 (workflowlogik bør ikke ejes af UI-nære lag), Rule 7 (dirty boundary), samt gråzone mod Rule 4 fordi compliance- og AI-gating flyder sammen med klientorkestrering.
   - Refaktorering: Split i mindst tre lag: en typed compliance-fetch service, en ren snapshot/view-model transformer og en tynd hook, der kun koordinerer React-livscyklus.

2. [ ] **`useCockpitRestore` hydrerer store direkte fra rå persisted payloads**
   - Fil: `src/hooks/useCockpitRestore.ts`
   - Problem: Hooken kalder `restoreProject()`, læser JSONB-lignende felter, sætter store-felter direkte og caster persisted data til domænetyper uden samlet boundary-contract.
   - AGENTS-brud: Rule 1 (Contract-First Boundaries), Rule 7.
   - Særligt risikabelt: `address_koordinater as { lat: number; lng: number } | null`, `project.billedanalyse as ...BilledeAnalyseResultat`, `project.hus_dna as ...HusDna`.
   - Refaktorering: Flyt restore-decoding til en dedikeret restore-adapter, der returnerer et valideret `CockpitRestoreSnapshot` plus separat metadata for store-hydrering.

3. [ ] **`cockpit-restore-utils.ts` indeholder usikker generic-object decoding**
   - Fil: `src/hooks/cockpit-restore-utils.ts`
   - Problem: `objectField<T>()` returnerer `field as T` uden runtime-validering.
   - AGENTS-brud: Rule 1.
   - Refaktorering: Erstat med Zod-baserede decoders pr. felt eller en lille typed decoding registry for `geusRisk`, `terrain`, `servitutter`, `fbbData` osv.

4. [ ] **Hook-laget er stadig koblet hårdt til global store-mutation**
   - Filer: `src/hooks/useCockpitAnalysis.ts`, `src/hooks/useCockpitRestore.ts`
   - Problem: Begge hooks bruger `useProject.getState()` og mange imperative setters som deres primære integrationsmekanisme.
   - AGENTS-brud: Rule 7 og generel ports/adapters-separation.
   - Refaktorering: Introducér et smalt facade-lag for cockpit-state, så hooks kan arbejde mod et mindre, typed interface i stedet for hele store-kontrakten.

### Sekundære observationer

- [ ] **Der er tæt kobling mellem `useCockpitRestore` og `useCockpitAnalysis`**
  - Filer: `src/hooks/useCockpitRestore.ts`, `src/hooks/useCockpitAnalysis.ts`
  - Problem: `useCockpitRestore` importerer `AnalysisSnapshot` type fra analyse-hooken, mens analyse-hooken runtime-importerer `routeMatchesAddress` fra restore-hooken.
  - AGENTS-relevans: Ikke en runtime-cycle nu, men tæt nok på Rule 8 til at shared typer og hjælpefunktioner bør flyttes til et lavere niveau.
  - Refaktorering: Flyt fælles snapshot-typer og `routeMatchesAddress` til et neutralt `cockpit-shared.ts` eller lignende.

- [ ] **`use-mobile.tsx` ser ren og lav-risiko ud**
  - Fil: `src/hooks/use-mobile.tsx`
  - Observation: Hooken er lokal, UI-teknisk og uden domæne- eller boundary-problemer.

## Targeted lib audit (`src/lib`, `src/types`)

### Prioriterede findings

1. [ ] **`project-state.ts` bryder fase-invarianten og parser persisted compliance-data usikkert**
   - Fil: `src/types/project-state.ts`
   - Problem: `PhaseName` bruger stadig de gamle faser (`"hus-dna" | "match" | "finans" | "engineering" | "udbud"`) i stedet for de 4 kanoniske faser fra AGENTS.md.
   - Problem: `parseComplianceData()` og `isHusDna()` bruger kun meget lette shape-checks og flere direkte casts fra `unknown`.
   - AGENTS-brud: Fase-normalisering, Rule 1 (Contract-First Boundaries).
   - Refaktorering: Indfør canonical fase-typer og Zod-baseret parsing for persisted compliance/Hus-DNA payloads.

2. [ ] **`project-sync.ts` validerer kun patch-overfladen og skjuler persistence bag en global store-afhængighed**
   - Fil: `src/lib/project-sync.ts`
   - Problem: `projectPatchSchema` accepterer store dele af domænedata som `z.record(z.string(), z.unknown())`, hvilket reelt ikke validerer nested boundary-data.
   - Problem: `syncPatch()` slår selv auth-token op og læser `currentProjectId` via `useProject.getState()`, hvilket gør persistence svært at isolere og teste.
   - AGENTS-brud: Rule 1, Rule 7.
   - Refaktorering: Erstat opaque records med typed schemas for kritiske patch-felter, og flyt `currentProjectId`/auth-afhængighed op i et service- eller hook-lag.

3. [ ] **`byggeanalyse.server.ts` decoder trusted JSONB med generiske casts**
   - Fil: `src/lib/byggeanalyse.server.ts`
   - Problem: `extractComplianceField<T>()` og den efterfølgende brug af `as RuleEngine...` caster persisted compliance-data til domænekontrakter uden runtime-validering.
   - AGENTS-brud: Rule 1, selv om modulet ellers respekterer Rule 4 ved at hente trusted state server-side.
   - Refaktorering: Dekodér `compliance_data` gennem typed contract decoders, før rule engine og AI-service får data.

4. [ ] **`cockpit.functions.ts` er strukturelt bedre, men `handleRunByggeanalyse()` læner sig stadig på et råt cast**
   - Fil: `src/lib/cockpit.functions.ts`
   - Problem: `handleRunByggeanalyse()` validerer kun token og caster derefter `rawData as ByggeanalyseInput`.
   - AGENTS-brud: Rule 1.
   - Refaktorering: Definér et eksplicit schema eller en decoder for det AI-relevante input, også hvis det sker som et reduceret server-side contract.

5. [ ] **`use-address-precheck.ts` er et workflow-hook placeret i `lib` og muterer store/persistence direkte**
   - Fil: `src/lib/use-address-precheck.ts`
   - Problem: Hooken henter address details, kører precheck, skriver mange felter direkte til store og persisterer med `syncPatch`.
   - AGENTS-brud: Rule 2/Rule 7-typen af dirty boundary, selv om filen ikke ligger i `src/hooks`.
   - Refaktorering: Del den i et typed address-selection service-lag og et tyndt React-hook, så orchestration og UI-state ikke blandes.

### Sekundære observationer

- [ ] **`datacheck.ts` ser relativt sund ud**
  - Fil: `src/lib/datacheck.ts`
  - Observation: Modulet bruger Zod, filtrerer kendte IDs og holder logikken pure og testbar.
  - Opfølgning: Brug dette modul som reference for, hvordan flere af de øvrige `lib`-parsers bør se ud.

- [ ] **`cockpit.functions.ts` er tættere på AGENTS-målet end meget af det tilkoblede UI-lag**
  - Fil: `src/lib/cockpit.functions.ts`
  - Observation: `fetchCompliance`-delen følger i højere grad mønstret “validate -> auth -> delegate”.
  - Opfølgning: Hvis cockpit-flowet deles op yderligere, så brug denne fil som stedet, hvor server-boundary-kontrakter kan strammes først.

## Domain audit (`src/domain`, `src/domain/contracts`)

### Observationer

- [ ] **Domænelaget ser overordnet sundt ud**
  - Filer: `src/domain/bbr/canonical-building.ts`, `src/domain/bbr/node-decoder.ts`, `src/domain/contracts/*.ts`
  - Observation: Filerne er små, rene og uden tydelige imports tilbage til UI, routes eller Supabase runtime-klienter. `node-decoder.ts` bruger reel Zod-validering, og `canonical-building.ts` holder udvælgelseslogik pure.
  - Opfølgning: Brug dette lag som reference for, hvordan boundary-dekodning og domænebeslutninger bør se ud andre steder i systemet.

- [ ] **Ingen større AGENTS-brud fundet i `src/domain` i denne runde**
  - Observation: Jeg fandt ikke tegn på React-, Supabase- eller route-afhængigheder i domænekernen.
  - Rest-risiko: De typed contracts er gode, men flere højere lag caster stadig data ind i dem uden runtime-validering. Risikoen ligger derfor primært i adapterne omkring domænet, ikke i domænet selv.

## Supabase repositories audit (`src/integrations/supabase/repositories`)

### Prioriterede findings

1. [ ] **`projects.repository.ts` returnerer persisted data via rå casts uden decoder**
   - Fil: `src/integrations/supabase/repositories/projects.repository.ts`
   - Problem: `getProjectComplianceSnapshot()` returnerer `data as ExistingProjectSnapshot | null`, og `loadProject()` returnerer `data as unknown as PersistedProject`.
   - AGENTS-brud: Rule 1 (Contract-First Boundaries).
   - Refaktorering: Indfør en eksplicit decoder for `PersistedProject`/snapshot-formerne ved repository-boundary, så resten af appen ikke modtager uvaliderede rækker.

### Sekundære observationer

- [ ] **`site-constraints.repository.ts` er relativt sund**
  - Fil: `src/integrations/supabase/repositories/site-constraints.repository.ts`
  - Observation: Repositoryet holder DB-kald samlet, og derivationen er udskilt i pure helpers. Det er en god retning, selv om upstream `ProjectPatch` stadig er for svagt valideret.

- [ ] **`building-tasks.repository.ts` og derivation-filen er tæt på AGENTS-målet**
  - Filer: `src/integrations/supabase/repositories/building-tasks.repository.ts`, `src/integrations/supabase/repositories/building-tasks.derivation.ts`
  - Observation: Sideeffekter og rene derivationer er delt fornuftigt op, og repositoryet respekterer den aktive `building_tasks`-tabel samt upsert-kontrakten.

- [ ] **`project-storage.repository.ts` ser ren og lav-risiko ud**
  - Fil: `src/integrations/supabase/repositories/project-storage.repository.ts`
  - Observation: Modulet er lille, fokuseret og uden domænelogik.

## Analysis/functions audit (`src/lib/analysis`, `src/lib/*.functions.ts`)

### Prioriterede findings

1. [ ] **`pre-check-adresse.ts` blander inbound adapter og analyse-workflow i samme modul**
  - Fil: `src/lib/pre-check-adresse.ts`
  - Problem: `createServerFn`-handleren validerer input, men kalder derefter `runPreCheckAdresse()` i samme fil uden `withAuth()` og uden at delegere til et separat application service-lag. Selve modulet ejer samtidig orchestration over Layer1, naturbeskyttelse, FBB, metrics og flagbygning.
  - AGENTS-brud: Rule 3 (Server Functions Are Inbound Adapters), Rule 7 (dirty boundary).
  - Refaktorering: Behold Zod-contracten, men flyt `runPreCheckAdresse()` til en dedikeret service, og lad server functionen være en tynd wrapper med eksplicit auth-strategi.

2. [ ] **`billede-analyse.functions.ts` har inline auth-, projekt- og storage-workflow i server functionen**
  - Fil: `src/lib/billede-analyse.functions.ts`
  - Problem: `uploadBillede` bruger `supabaseAdmin.auth.getUser()`, slår projekt-ejerskab op i `projects` og uploader direkte til storage i samme handler.
  - AGENTS-brud: Rule 3, samt persistence/storage-bekymringen i Boundary Cleanup-roadmapsporet.
  - Refaktorering: Flyt auth/ownership/upload til en fokuseret service eller repository-kombination, så server functionen kun validerer input og delegerer.

3. [ ] **`ai-design.functions.ts` har god server-side gate, men `resolveHardStop()` går direkte til Supabase-tabeller**
  - Fil: `src/lib/ai-design.functions.ts`
  - Problem: Hard Stop-authority ligger rigtigt på serveren, men hjælpefunktionen læser `projects` og `site_constraints` direkte via `supabaseAdmin` i samme modul, i stedet for at gå gennem repositories eller et lille compliance-gate service-lag.
  - AGENTS-brud: Ikke et Rule 4-brud, men stadig en boundary-læk ift. Rule 3/Rule 7 og persistence-patternet.
  - Refaktorering: Bevar server-side gate-semantikken, men flyt opslagene til repository-/service-lag, fx `loadProjectComplianceSnapshot()` og `loadSiteConstraintGate()`.

### Sekundære observationer

- [ ] **`analysis-orchestrator.ts` er et af de sundere servermoduler**
  - Fil: `src/lib/analysis-orchestrator.ts`
  - Observation: Modulet er en relativt ren koordinator over step-moduler, bruger dependency injection og holder compliance-orchestration væk fra UI/routelaget.
  - Rest-risiko: Kontrakten er kun så stærk som decodingen i de underliggende adapters og caches.

- [ ] **`layer1-analysis.ts`, `address-enrichment.ts` og `geo-risk-step.ts` følger generelt den rigtige retning**
  - Filer: `src/lib/analysis/layer1-analysis.ts`, `src/lib/analysis/address-enrichment.ts`, `src/lib/analysis/geo-risk-step.ts`
  - Observation: De holder sig server-side, logger struktureret og samler integrationstrin i fokuserede moduler i stedet for at lægge dem i UI.
  - Opfølgning: Brug disse moduler som reference, når dirty workflows i hooks og komponenter flyttes ned i services.

- [ ] **`adresse.functions.ts` er tæt på den ønskede inbound-adapter-form**
  - Fil: `src/lib/adresse.functions.ts`
  - Observation: Input valideres med Zod, og handlerne delegerer direkte til integrationsklienter uden ekstra workflow- eller persistence-logik.
