## Diagnose — hvad der er galt visuelt

`AnalyseTab` er i dag en lodret mega-stak hvor alt skriger om opmærksomhed samtidig:

```text
┌─ adresse-linje
├─ ComplianceFeed         ← risiko-tidslinje
├─ RiskOverview           ← 5 risiko-kort  ╲
├─ AiDesignHero           ← AI-billede      ╲ tre "hero"-blokke i træk
├─ "KØR AI-ANALYSE"-knap   ╱
├─ Cockpit (3-kolonne)    ← det egentlige design-arbejdsrum (skjult midt på siden)
│   ├─ Byggeønsker accordion + ModeToggle
│   ├─ Matrikel-canvas
│   └─ CompliancePanel    ← endnu en risiko-overflade
├─ "BYGNING FUNDET" badge
├─ 3 metric-kort  (bebyggelses%, etager, anvendelse)
├─ 3 metric-kort  (max areal, rest areal, max højde)
├─ ByggeanalyseKort       ← endnu en risiko-overflade (AI-version)
├─ Lokalplaner-kort
├─ SaveSektion / GeusRisiko / Terrain / Servitutter / Fjernvarme / Naboer
├─ "Vis Økonomi →" CTA   ← wizard-tankegang i et tab-system
└─ to sekundære knapper
```

Konsekvenser:
- **Fire overlappende compliance-overflader** (ComplianceFeed, RiskOverview, CompliancePanel, ByggeanalyseKort) viser i vid udstrækning samme flag.
- **To Mode-toggles med to kilder**: TopBar bruger `useCockpitMode` (sessionStorage), Cockpit-venstrepanel bruger `cockpitMode` fra `project-store`. De er ikke i sync.
- **To byggeønsker-accordions** i samme route (FreeByggeoenskeAccordion + Cockpit/ByggeoenskeAccordion).
- Den faktiske "design dit hus + få instant feedback"-arbejdsflade (3-kolonne Cockpit) er begravet under tre hero-blokke og overskygges af 6+ metric-kort + 6+ detail-sektioner under sig.
- "Vis Økonomi →"-CTA underminerer fane-systemet og giver indtryk af lineær wizard.

## Nyt princip — ét arbejdsrum, én risiko-overflade

Kerneopgaven er: **justér byggeønske → se kritisk forhold ændre sig live**. Alt andet er sekundært eller hører til andre tabs.

Vi bygger AnalyseTab op om **ét, fuld-viewport workspace** med tre samtidige paneler — og rydder op overalt udenom.

## Den nye AnalyseTab — layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  [adresse]  ·  Hasselvej 48, 2830 Virum                            [● live]  │
│  HARD-STOP-BAR (kun hvis hard_stop=true — fuld bredde, rød)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ DIT HUS              │  MATRIKEL               │  LIVE FEEDBACK              │
│ (byggeønsker)        │  (canvas + nøgletal)    │  (kritiske forhold)         │
│                      │                         │                             │
│ Mode: ◉ Køb ○ Design │   ┌──── kort ────┐      │  ⚠ Fredning · SAVE 3        │
│                      │   │   matrikel   │      │     Dispensation kræves     │
│ ▾ Grundlæggende  3/4 │   │   bygning    │      │     → Slots- & Kultur       │
│   Byggetype          │   │   nabo-skel  │      │  ⚠ Bebyggelses%: 41 / 35    │
│   Areal     ████ 180 │   └──────────────┘      │     +6% over rammen         │
│   Etager        ▒▒ 2 │                         │  ⚠ Etager: 2 / 1.5          │
│   Stil               │   Bebyggelse  41 % ▓▓░  │  ✓ Strandbeskyttelse N/A    │
│ ▸ Materialer         │   Etager       2  / 1½  │  ✓ Geoteknik OK             │
│ ▸ Energi             │   Areal      180  m²    │  ✓ Naboafstand 4.2 m        │
│ ▸ Inspiration        │   Højde       8.5 m     │                             │
│                      │                         │  ─────────────────────────  │
│                      │                         │  Vis 5 risikokategorier ▾   │
│                      │                         │  Vis AI-analyse ▾           │
│                      │                         │  Vis lokalplan-uddrag ▾     │
└──────────────────────────────────────────────────────────────────────────────┘
   Detaljer (foldet sammen) ▾   Save · Geoteknik · Terræn · Servitutter · Fjernvarme · Naboer
```

Tre paneler, samme højde, ingen lodret stak ovenover. Det føles som et cockpit, ikke en lang side.

### Højre panel — den ENE samlede risiko-overflade

I dag har vi fire steder hvor compliance vises. De smeltes sammen til **én prioriteret feed** øverst i højre panel:

1. **Hard stops** (rødt, øverst — fredning, strandbeskyttelse, fredskov, klitfredning).
2. **Brud på kvantitative grænser** (bebyggelses%, etager, højde — viser delta direkte: "41% / 35% — +6%").
3. **Advarsler** (SAVE 4–5, naboafstand, terræn-hældning, geoteknik).
4. **OK** (grøn, skjult bag "Vis 8 grønne flag" hvis brugeren vil se dem).

Hver række har ét tag der peger på myndighed/kilde. Når brugeren ændrer et byggeønske, animeres rækken (samme `AnimatedNumber`-mønster vi allerede har), så ændringen er synlig.

**Fjernes / smeltes ind i feedet:**
- `ComplianceFeed` (eksisterende komponent — flytter sin sortering ind i den nye feed).
- `RiskOverview` (5 risikokort) — bliver til en foldbar undersektion under feedet ("Vis 5 risikokategorier") for dem der vil have hele kategorisynet.
- `CompliancePanel` (i nuværende `Cockpit/index.tsx`) — erstattes helt af det nye højre-panel.
- `ByggeanalyseKort` — bliver til en foldbar "Vis AI-analyse" under feedet (LLM-output er sekundært til hårde regler).

### Midter-panel — matrikel + nøgletal

Beholder `MatrikelCanvas` (kortet er stærkt). De seks `MetricCard`-rækker under siden kollapses til **fire kompakte tal-rækker** lige under kortet:

- Bebyggelse: `41% / 35%` (delta-farvet)
- Etager: `2 / 1½`
- Areal: `180 m² / 165 m²`
- Højde: `8.5 m / 8.5 m`

Ingen separate Card-bokse — bare typografi i samme panel. "Bygning fundet"-badge fjernes (status er implicit når data vises).

### Venstre panel — byggeønsker

Beholder `ByggeoenskeAccordion` stort set som den er. Mode-toggle bliver i TopBar (vi har den der allerede via `ModeIndicator`) — den dublerede `ModeToggle` i venstrepanelet fjernes, og `cockpitMode`-felt i `project-store` udfases til fordel for den centrale `useCockpitMode`-hook.

Den separate "KØR AI-ANALYSE"-knap flyttes ind i højre panels "Vis AI-analyse"-folde-sektion (som "Genberegn AI-vurdering").

### Under workspacet — detaljer foldet ned

`SaveSektion`, `GeusRisikoSektion`, `TerrainSektion`, `ServitutterSektion`, `FjernvarmeSektion`, `NaboerSektion`, `Lokalplaner`-kort flyttes ned under workspacet i en enkelt **"Detaljer"-accordion** med 7 sektioner. De er reference-data — ikke noget brugeren behøver se for at designe.

### CTA-knapper

"Vis Økonomi →" og "Ejendomsdetaljer →"-knapperne fjernes — de duplikerer fane-systemet i toppen. Kun "Projektparathed →" beholdes (den peger på en faktisk anden route).

## Oprydning udenfor AnalyseTab

- **Mode-state**: én kilde (`useCockpitMode`). Slet `cockpitMode` + `setCockpitMode` fra `project-store.ts` og `ModeToggle`-komponenten i `cockpit/index.tsx`.
- **Free design**: `FreeByggeoenskeAccordion` i `projekt.$id.cockpit.tsx` erstattes af samme `ByggeoenskeAccordion` som workspacet bruger — ét accordion-mønster, ikke to.
- **Due-diligence-banner** (gul stribe øverst når mode=køb) reduceres til en lille pille i TopBar — den fylder hele bredden i dag og presser arbejdsrummet ned.
- **`Cockpit`-komponenten** (`src/components/cockpit/index.tsx`) refaktoreres så den eksporterer de tre paneler hver for sig (`ProjektDnaPanel`, `MatrikelCanvas`, `LiveFeedbackPanel`) i stedet for ét hardcodet 3-kolonne grid — så AnalyseTab kan layoute dem direkte uden et indlejret grid-i-grid.

## Nye/ændrede filer

| Fil | Ændring |
|---|---|
| `src/routes/projekt.$id.cockpit.tsx` | AnalyseTab skrives om til 3-panel layout + foldbar detaljer-sektion. ~400 linjer fjernes. |
| `src/components/cockpit/index.tsx` | Eksportér `ProjektDnaPanel`, `MatrikelCanvas`, `LiveFeedbackPanel` separat. Fjern intern 3-kol grid og ModeToggle. |
| `src/components/cockpit/LiveFeedbackPanel.tsx` | **Ny** — den ene samlede risiko-overflade (smelter ComplianceFeed + CompliancePanel + RiskOverview + ByggeanalyseKort sammen). |
| `src/components/cockpit/ComplianceFeed.tsx` | Beholdes som intern brick i LiveFeedbackPanel; ikke længere selvstændig hero. |
| `src/components/cockpit/RiskOverview.tsx` | Bliver `<RiskCategoriesAccordion />` brugt foldet inde i LiveFeedbackPanel. |
| `src/components/cockpit/DetailsAccordion.tsx` | **Ny** — samler Save/Geus/Terrain/Servitutter/Fjernvarme/Naboer/Lokalplaner i én foldbar boks. |
| `src/lib/project-store.ts` | Slet `cockpitMode` / `setCockpitMode` (kun `useCockpitMode` bruges nu). |
| `src/components/wizard-chrome.tsx` | TopBar's `ModeIndicator` får en lille "DD"-pille når mode=køb (erstatter gul fuld-bredde-banner). |

Ingen ændringer i: orchestrator, rule-engine, project-store data-felter (kun mode-feltet droppes), server functions, integrations.

## Verifikation

- `bunx tsc --noEmit` 0 fejl
- `bun test` 0 fejl
- Visuel QA på `/projekt/{id}/cockpit?tab=analyse` ved 1160×708 viewport (brugerens nuværende): tre paneler synlige uden scroll, hard-stop banner kun ved aktivt hard stop, detaljer foldet ned.
- Manuel: justér "antalEtager" fra 1 til 3 i venstre panel → se "Etager 3 / 1½" pulse rødt i midter-panel og en ny række pop op i højre panel højest øverst.

## Hvad jeg IKKE rører

- Datapipeline (`analysis-orchestrator`, `pre-check-adresse`, `reactive-compliance`).
- Rule-engine.
- `project-persistence` / typede compliance-kolonner.
- Andre tabs (Ejendom, Økonomi) — kun Analyse refaktoreres nu.
