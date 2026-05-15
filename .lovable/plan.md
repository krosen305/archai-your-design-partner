# Cockpit-redesign: Fra guidet wizard til frit dashboard

Vi sletter hele fase-paradigmet og gør cockpittet til den primære arbejdsflade. Brugeren rammer cockpittet umiddelbart efter projektoprettelse — enten med adresse-data trukket fra Datafordeler, eller helt uden grund (frit design). Et nyt AI-hero panel øverst genererer 3 visuelle forslag fra inspirationsbilleder + fritekst-drøm. Personrelaterede byggeønsker fjernes.

## 1. Faseoverblik fjernes helt

**Filer:** `src/components/wizard-chrome.tsx`, `src/lib/phases.ts`, `src/components/phase-sidebar.tsx`, `src/components/phase-coming-soon.tsx`, `src/routes/__root.tsx`

- Slet `PhaseBar`, `MobilePhaseBar`, `PhaseChip` fra `wizard-chrome.tsx`. `TopBar` reduceres til: logo (venstre) · evt. kort projektkontekst (midten) · `UserMenu` (højre). `MobileMenu` beholdes men uden faseoversigt — kun "Mine projekter" + "Log ud".
- Fjern `PhaseSidebar` overalt (sletter både komponenten og evt. brug i `__root.tsx` / cockpit).
- Behold `BackLink`-helper.
- `src/lib/phases.ts`: behold kun `setPhase`-relaterede typer hvis project-store stadig refererer dem internt; fjern `PHASES`, `usePhaseStates`, `usePhaseSubKeys`, `usePhaseClickable`. Fjern alle imports af disse fra øvrige filer.
- Slet stub-routes der kun gav mening i fase-flowet: `projekt.datacheck.tsx`, `projekt.teknik.tsx`, `projekt.udbud.tsx` (alt funktionalitet flyttes ind i cockpit-tabs senere efter behov).

## 2. Ny indgang: Adresse er default, "design frit" som toggle

**Fil:** `src/routes/projekt.start.tsx` (mindre justering) + `src/routes/projekt.adresse.tsx` (tilføjelse) + ny route `src/routes/projekt.frit.tsx` ELLER hash i cockpit.

**Beslutning:** Vi tilføjer en lille toggle i `projekt.adresse.tsx`-skærmen ("Indtast adresse" / "Design uden grund"). Vælges "design uden grund":

- Opret projekt uden adresse via `serverCreateProject` (allerede understøttet — `address` forbliver null)
- Naviger til `/projekt/frit/cockpit` (en speciel rute der mounter `Cockpit` med `bbr=null`, `metrics=null` osv.)
- Cockpittet skjuler matrikel-canvas og compliance-gauges når der ikke er adresse-data — viser i stedet kun AI-hero + design-input + grov estimat.

I `projekt.start.tsx` ændres "Nyt projekt"-knappens undertekst til "Indtast adresse eller design frit".

## 3. Cockpit-omstrukturering: AI-hero øverst, slankere paneler

**Fil:** `src/components/cockpit/index.tsx`, `src/routes/projekt.$id.cockpit.tsx`

Ny vertikal struktur i cockpittet (oppefra og ned):

```text
┌────────────────────────────────────────────────────────┐
│ AI-HERO: "Drøm dit hjem"                              │
│ [Upload billeder] [Fritekst-felt] [Generér 3 forslag] │
│ → 3 generede billed-kort vises horisontalt herunder    │
└────────────────────────────────────────────────────────┘
┌──────────┬──────────────┬──────────────┐
│ Byggeønsker │ Matrikel/  │ Compliance & │
│ (accordion) │ placering  │ budget       │
│             │ + visuel   │ (gauges)     │
└──────────┴──────────────┴──────────────┘
```

Center-panel splittes i to faner: **"Matrikel & placering"** (eksisterende `MatrikelCanvas`) og **"Visuelt udseende"** (de genererede AI-billeder + valgt facade/materiale-preview).

Når `bbr === null` (frit design): vis kun AI-hero + venstre input-panel + et budget-estimat. Skjul matrikel-canvas og compliance-gauges med placeholder "Tilføj adresse for at se grunddata".

## 4. Slankere byggeønsker — fjern personrelaterede felter

**Fil:** `src/lib/byggeoenske-steps.ts` (+ `src/lib/project-store.ts` typen `Byggeoenske` — beskyttet fil; markeres med `🔒` i PR)

Fjern fra `STEPS`-arrayet:

- `husstandsstoerrelse`, `voksne`, `boern`, `livsfase` (gruppe "Grundlæggende")
- `hjemmekontor` (toggle, gruppe "Areal & rum")

Bevar: `byggetype`, `oensketAreal`, `antalEtager`, `antalSovevaerelser`, `antalBadevaerelser`, alle stil/arkitektur-felter, alle bæredygtighed-felter, `budget`, `inspirationsbilleder`.

`Byggeoenske`-typen i `project-store.ts` beholder felterne som optional for bagudkompatibilitet med eksisterende projekter, men de bruges ikke længere i UI. Gruppen "Grundlæggende" reduceres til kun `byggetype`.

## 5. AI-design hero komponent (ny)

**Ny fil:** `src/components/cockpit/AiDesignHero.tsx`
**Ny server-fn:** Tilføjes i `src/routes/projekt.$id.cockpit.tsx` (eller egen `src/lib/ai-design.functions.ts`)

UI:

- Stort kort øverst i cockpittet
- Venstre: drag-and-drop upload (genbrug logik fra `UploadField` i `cockpit/index.tsx`) + textarea til "Beskriv dit drømmehus" (gemmes i en ny `byggeoenske.designDroem: string` i store)
- Højre: knap "Generér 3 forslag" → kalder server-fn `generateDesignProposals`
- Resultat: 3 billeder rendres som klikbare kort. Valgt forslag persisteres i `byggeoenske.valgteDesignforslag` (string url)

Server-fn:

- `createServerFn({ method: "POST" })` med auth-middleware
- Bruger Lovable AI Gateway (`google/gemini-3.1-flash-image-preview`) til billed-generering
- System-prompt baseret på inspirationsbilleder + fritekst + valgte stil/materialer fra `byggeoenske`
- Returnerer `{ images: string[] }` (3 stk., gemt i Supabase Storage eller som data-URLs)

State-tilføjelser i `project-store.ts` (beskyttet fil — kræver review):

- `byggeoenske.designDroem?: string`
- `byggeoenske.valgteDesignforslag?: string`
- `byggeoenske.genererededDesignforslag?: string[]`

## 6. Routing-konsekvenser

- Fjern logikken i `projekt.start.tsx` `ProjektKort.handleFortsaet` der tjekker `current_step` mod `COCKPIT_STEPS` — alle projekter med adresse går direkte til `/projekt/{adresseid}/cockpit`. Projekter uden adresse går til `/projekt/adresse?projectId=...`.
- `routeTree.gen.ts` regenereres automatisk af Vite-pluginet når `projekt.frit.tsx` tilføjes / stub-routes slettes.

## 7. Verifikation

- `bunx tsc --noEmit` skal være ren — fjern alle imports af de slettede phase-helpers i: `wizard-chrome.tsx`, `phase-sidebar.tsx`, `phase-coming-soon.tsx`, evt. cockpit-fil hvis den kalder `setPhase`.
- `bun test` skal forblive grøn — tjek `tests/wizard-flow.spec.ts` og `tests/address-flow.spec.ts`; opdatér selectors hvis de leder efter "FASE X"-chips.
- Manuel rundtur: opret projekt → vælg "design frit" → cockpit uden grund → tilføj adresse senere via tilbage-link → cockpit med grund.

## Tekniske noter

- Ingen nye dependencies; AI-billedgenerering bruger eksisterende Lovable AI Gateway-mønster (se `connecting-to-ai-models-tanstack`).
- Beskyttede filer rørt: `src/lib/project-store.ts` — markeres `🔒` i PR.
- AGENTS.md/CLAUDE.md opdateres ikke automatisk (Codex må ikke).
- Slettede stub-routes (`datacheck`, `teknik`, `udbud`) kan reintroduceres senere som cockpit-tabs hvis behov opstår.

## Åbne spørgsmål inden implementering

Ingen blokerende — alle 4 designvalg er afklaret. Implementering kan starte når denne plan er godkendt.
