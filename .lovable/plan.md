## Diagnose — hvorfor cockpittet føles cluttet

Selv efter sidste refaktor render `AnalyseTab` stadig **fire parallelle "sandheds-overflader"** under hinanden:

1. `Cockpit` (3-kolonne workspace) → indeholder allerede sin egen `CompliancePanel` til højre
2. `ComplianceFeed` (kronologisk feed)
3. `RiskOverview` (5 risikokategorier)
4. `DetailsAccordion` (7 sektioner: AI byggeanalyse, AI design, lokalplaner, geus, terræn, servitutter, fjernvarme, naboer)

Plus: HardStopBanner i toppen, tabs, AI-genberegn-knap, navigations-row med 3 CTAs.

På 1160px viewport (brugerens aktuelle bredde) presses 3-kolonne workspace + 3 stablede compliance-views = >2000px scroll før brugeren ser et eneste designvalg. Resultatet er at "design huset og se instant feedback" — produktets kerneløfte — drukner.

**Rod-årsagen er ikke for meget data — det er at hver datakilde har fået sin egen sektion i stedet for at blive sorteret efter brugerens intention.**

## Designprincipper (forankret i brugerrejsen)

Fra `docs/domain/journey-demolition-new-build.md` + Builder's Cockpit faser:

- **Phase 4-6 (pre-purchase, due-diligence mode)**: Brugeren vil vide ét: *"Er der hard stops? Kan jeg overhovedet bygge her?"* — alt andet er støj.
- **Phase 7-8 (design + iteration)**: Brugeren ændrer byggeønsker og vil se *delta* (grøn/rød indikator) — ikke en rapport.
- **Dybdedata** (servitutter, geoteknik, naboer, fjernvarme, lokalplan-PDF'er) er **dokumentation** — vigtig at have, men sjælden at åbne. Skal være ét klik væk, ikke i hovedflowet.

Derfor: **én primær flade, ikke fire**. Mode bestemmer hierarki.

## Ny AnalyseTab — layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  ◀ Tilbage     Hasselvej 48 · 2820 Gentofte    [DD-mode/Design-mode pill] │
│  ──────────────────────────────────────────────────────────────────────────│
│  [ANALYSE]  EJENDOM  ØKONOMI                                              │
├────────────────────────────────────────────────────────────────────────────┤
│  STATUS-STRIBE (full bredde, 56px høj)                                    │
│  🔴 1 Hard Stop  ·  🟠 2 advarsler  ·  🟢 8 OK     [Vis alle 11 →]        │
├──────────────────────────────┬─────────────────────────────────────────────┤
│  VENSTRE: DESIGN-INTENT      │  HØJRE: LIVE FEEDBACK                      │
│  (380px fast)                │  (fluid, fylder resten)                    │
│                              │                                            │
│  Mode-toggle [Køb|Design]    │  ┌─ MATRIKEL-CANVAS (16:10) ──────────┐   │
│                              │  │  Kort + footprint + nabo-afstande  │   │
│  Byggeønsker accordion       │  │  Inline gauges overlay:            │   │
│  (22 trin, grupperet)        │  │  bebyggelse 18%/30%  etager 1/2    │   │
│                              │  └─────────────────────────────────────┘   │
│  Totalpris-estimat (sticky)  │                                            │
│                              │  RISIKO-FEED (max 6 synlige)              │
│                              │  🔴 SAVE 4 – nedrivning kræver §14        │
│                              │  🟠 Bebyggelse 92% af max                 │
│                              │  🟠 Nabo 2.1 m – brandkrav BR18 §126      │
│                              │  🟢 Ingen strandbeskyttelse               │
│                              │  [Vis 7 flere flag →]  [Detaljer →]       │
└──────────────────────────────┴─────────────────────────────────────────────┘
                              [↳ Klik "Detaljer" åbner side-drawer:
                               AI byggeanalyse, lokalplaner, geus,
                               terræn, servitutter, fjernvarme, naboer,
                               AI-design visualisering]
```

### Hvad forsvinder fra hovedfladen

| Element                  | Hvor flytter det hen                                          |
| ------------------------ | ------------------------------------------------------------- |
| 3-kolonne Cockpit-grid   | Kollapses til 2-panel (venstre design / højre feedback)       |
| `CompliancePanel`        | Smelter ind i `RisikoFeed` (kun ét compliance-objekt)         |
| `ComplianceFeed`         | Smelter ind i `RisikoFeed`                                    |
| `RiskOverview`           | Smelter ind i `RisikoFeed` (kategorier vises som filtre)      |
| `DetailsAccordion`       | Flyttes til side-drawer (`Sheet`) udløst af "Detaljer →"      |
| "GENBEREGN" CTA          | Bliver til lille ikon-knap i status-stribe                    |
| AI-byggeanalyse fritekst | I drawer, ikke i hovedflow                                    |
| HardStopBanner           | Erstattes af status-stribe (Hard Stops vises som røde flag)   |
| 3-CTA navigations-row    | Reduceres til én primær "ØKONOMI →" i bunden af venstre panel |

### Nye komponenter

- `StatusStripe` — full-bredde sammenfattende stribe (Hard Stop count, advarsler, OK). Erstatter `HardStopBanner` og er det første brugeren ser efter tab-skift.
- `RisikoFeed` — én sorteret feed (severity desc), kategori-filterpills i top (Hard Stop, plan, geoteknik, naboer, forsyning, fredning). Default: kun severity≥warning vises, OK skjult bag toggle. Hver flag har: ikon, titel, kilde-badge, og "Læs mere" der dybde-linker til drawer.
- `MatrikelCanvasV2` — eksisterende `MatrikelMap` med overlejret **inline gauge-strip** i bunden (4 mikro-gauges: bebyggelse, etager, areal, højde). Erstatter behovet for separat metric-grid.
- `DetailsDrawer` — `Sheet` (shadcn) der åbner fra højre med eksisterende `DetailsAccordion`-indhold. Default lukket. Dyb-linkbar via URL `?details=ai-byggeanalyse`.

### Mode-styret hierarki

`useCockpitMode()` (eksisterer allerede) bestemmer hvad der får visuel vægt:

- **Køb-mode (due-diligence)**: `StatusStripe` + `RisikoFeed` bliver primær flade; venstre byggeønsker-panel kollapses til "INTENT-OVERSIGT" (read-only summary). Canvas viser kun matrikel + restriktionslag.
- **Design-mode**: Venstre byggeønsker-accordion ekspanderes; canvas viser footprint-preview; `RisikoFeed` viser kun delta-flags der ændrer sig ved brugerens valg.

Dette løser den uudtalte konflikt: i dag prøver UI'et at gøre begge ting samtidigt for begge brugertyper.

### Responsivt fald-tilbage

- ≥1280px: 2-panel som ovenfor
- 1024–1279px (brugerens viewport): venstre panel bliver 320px, canvas bevarer 16:10
- <1024px: stack vertikalt — `StatusStripe` → canvas → byggeønsker → `RisikoFeed`. Drawer bliver bottom-sheet.

## Tekniske ændringer

**Nye filer:**

- `src/components/cockpit/StatusStripe.tsx` — full-bredde severity-summary
- `src/components/cockpit/RisikoFeed.tsx` — sammensmeltning af `ComplianceFeed` + `RiskOverview` + `CompliancePanel`-indhold
- `src/components/cockpit/MatrikelCanvasV2.tsx` (eller udvid eksisterende) — canvas med overlejret gauge-strip
- `src/components/cockpit/DetailsDrawer.tsx` — `Sheet`-wrapper omkring eksisterende `DetailsAccordion`

**Ændrede filer:**

- `src/routes/projekt.$id.cockpit.tsx` — `AnalyseTab` skæres fra ~260 til ~80 linjer, alle dybdedata-sektioner flyttes til drawer
- `src/components/cockpit/index.tsx` — `Cockpit`-grid ændres fra 3-kolonne til 2-kolonne; `CompliancePanel` deprecateres (logik flyttes ind i `RisikoFeed`); `ProjektDnaPanel` og `MatrikelCanvas` eksporteres uændret
- `src/components/cockpit/ComplianceFeed.tsx` — bliver intern "brick" brugt af `RisikoFeed` (ikke længere standalone i route)
- `src/components/cockpit/RiskOverview.tsx` — kategori-logik genbruges i `RisikoFeed`s filterpills, derefter slettes filen

**Slettes:**

- `RiskOverview` (logik flyttet)
- Standalone `ComplianceFeed`-brug i route (komponenten beholdes som brick)
- `HardStopBanner` hvis dens info dækkes 100% af `StatusStripe` (verificeres før sletning)

**Uberørt:**

- `analysis-orchestrator`, `rule-engine`, `compliance-engine`, `project-store`, `project-persistence` — kun præsentation ændres, ingen domænelogik.
- `EjendomPanel` og `OekonomiPanel` — andre tabs forbliver som de er.
- `useCockpitMode` — bruges som er.

## Verifikation før færdig

- `bunx tsc --noEmit` 0 errors
- `bun test` 0 failures
- `bunx eslint .` 0 errors
- Manuel: 1024px, 1280px, 1440px viewports — ingen overflow, drawer åbner korrekt, `?details=…` dybdelink virker
- Manuel: skift Køb↔Design mode — hierarki ændres synligt

## Risici

- `RisikoFeed` skal håndtere fraværende data nådigt (hvis `geusRisk` mangler skal kategorien bare ikke vises). Vi har allerede mønstret i `ComplianceFeed`.
- Drawer-pattern er nyt i cockpittet — kræver én ny shadcn-komponent (`sheet.tsx` er allerede installeret).
- Vi rører ikke `project-store.ts` eller orchestratoren, så ingen "beskyttet fil"-flag.

## Forslået rækkefølge

1. Byg `StatusStripe` + `RisikoFeed` isoleret, drop dem ind under eksisterende workspace (verificer at de erstatter ComplianceFeed+RiskOverview+CompliancePanel komplet)
2. Slet de tre gamle compliance-overflader fra route
3. Byg `DetailsDrawer`, flyt `DetailsAccordion`-indhold ind
4. Refaktor `Cockpit`-grid fra 3→2 kolonner, integrér gauge-strip i canvas
5. Mode-styret hierarki (Køb vs Design vægt)
6. Responsiv finpudsning + verifikation
