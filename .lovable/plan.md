## Mål

Når brugeren åbner et eksisterende projekt, skal cockpittet **vise alt vi har i databasen med det samme** — ingen 2,8 sek. loading-skærm, ingen orchestrator-kald. Sektioner uden data får en tydelig "ikke hentet"-tilstand med en **Genindlæs**-knap, så API-kald bliver et eksplicit valg pr. datakilde, ikke noget der sker automatisk ved hver genindlæsning.

## Problemet med nuværende flow

Cockpit-routen har én stor gate (`bbrData && complianceDone` → vis; ellers → kør hele `fetchCompliance`-orchestratoren). Tre konsekvenser:

1. Hvis ét felt mangler (fx `compliance_done = false` på et gammelt projekt, eller en ny datakilde der ikke fandtes da projektet blev gemt), kører **hele pipelinen** igen — selv om 90 % af data ligger i DB.
2. Den kunstige `MIN_LOADING_MS = 2800` skærm bliver vist selv når restore er øjeblikkelig.
3. Brugeren kan ikke se *hvilke* datakilder der er friske/forældede/manglende — alt er sort boks.

## Forslag

### 1. Fjern "alt eller intet"-gaten

Cockpittet renderes altid med det restore har givet os. Vi bruger ikke længere `status: "loading" | "done" | "error"` til at skjule hele UI'et. `complianceDone`-flaget i store afgør kun *om "Genindlæs alt"-knappen er fremhævet*, ikke om sektionerne vises.

### 2. Datakilde-status pr. sektion

Vi introducerer en lille per-sektion model i `project-store.ts`:

```ts
type SectionStatus = "fresh" | "stale" | "missing" | "loading" | "error";

dataStatus: {
  bbr: SectionStatus;
  lokalplaner: SectionStatus;
  kommuneplanramme: SectionStatus;
  fbb: SectionStatus;          // SAVE/fredning
  naturbeskyttelse: SectionStatus;
  geusRisk: SectionStatus;
  servitutter: SectionStatus;
  terrain: SectionStatus;
  fjernvarme: SectionStatus;
  naboer: SectionStatus;
  vurdering: SectionStatus;
  byggeanalyse: SectionStatus;
  billedanalyse: SectionStatus;
  husDna: SectionStatus;
}
```

Status afledes ved restore:
- Felt findes i DB → `fresh` (med `updated_at`-tidsstempel)
- Felt er `null` i DB → `missing`
- Felt er ældre end TTL (samme regler som `address_analysis`-cachen i `src/integrations/cache/client.ts`: lokalplan 30d, servitut 7d, compliance 30d) → `stale`

### 3. Granulære refresh-server-funktioner

I dag har vi én monolitisk `fetchCompliance` der kører alt parallelt. Vi tilføjer pr.-datakilde server-funktioner (eller én `refreshDataSource(kind)`) der kun rammer den nødvendige integration og opdaterer både `address_analysis`-cache og `projects`-rækken:

- `refreshBbr` → BBR + MAT
- `refreshLokalplaner` → Plandata + lokalplan-PDF-ekstraktion
- `refreshServitutter` → Tinglysning
- `refreshGeoRisk` → GEUS + SDFI terrain + naturbeskyttelse
- `refreshFbb` → FBB SAVE/fredning
- `refreshVurdering` → VUR
- `refreshNaboer` → BBR neighbor-client
- `refreshFjernvarme` → Plandata fjernvarme
- `refreshByggeanalyse` → AI byggeanalyse (allerede separat via `runByggeanalyse`)

Den gamle `fetchCompliance` beholdes som "Genindlæs alt"-knap (én kommando der orchestrerer ovenstående parallelt) — nyttig ved første compliance-kørsel og ved totalrefresh.

### 4. UI: badge + knap pr. sektion

Hver datakilde-blok i `EjendomPanel`, `OekonomiPanel`, lokalplan-sektionen, risiko-feed osv. får et lille header-element:

```text
┌─────────────────────────────────────────────┐
│ LOKALPLANER          [Frisk · 3 dage siden] │
│ ...                                         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ GEOTEKNISK RISIKO    [Mangler] [Genindlæs ↻]│
│ Ingen data hentet endnu                     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ NABODATA             [Forældet · 45 dage]   │
│ ...                              [Opdatér ↻]│
└─────────────────────────────────────────────┘
```

Status-pillen bruger eksisterende design-tokens (`accent`, `warning`, `danger`, `muted`). Loading-tilstand pr. sektion = lille spinner i pillen, ikke fuld-skærm.

### 5. Auto-trigger kun ved "missing" + brugerens valg

Vi tilføjer en preference-toggle i toppen af cockpittet:
- **Vis cachet data** (default) — ingen automatiske API-kald
- **Hent altid friske data** — kører "Genindlæs alt" ved hvert besøg

Vi fjerner den implicitte auto-orchestrator. Hvis et projekt aldrig har kørt compliance (`compliance_done = false`), vises et tydeligt banner: *"Compliance-analyse er ikke kørt endnu — [Start analyse]"*, så det er et bevidst klik.

### 6. Fjern `MIN_LOADING_MS = 2800`

Den kunstige forsinkelse fjernes. Hvis vi virkelig kører API-kald, viser sektionens egen loading-pille det.

## Tekniske detaljer

**Filer der ændres:**

- `src/lib/project-store.ts` — tilføj `dataStatus`-felt + setter pr. kilde (beskyttet fil — kræver review).
- `src/integrations/supabase/project-persistence.ts` — `loadProject` returnerer `updated_at` pr. felt (eller vi læser fra `address_analysis.*_at`-kolonnerne der allerede findes). Beskyttet fil — kræver review.
- `src/lib/project-sync.ts` — `syncPatch` opdaterer status til `fresh` når der skrives.
- `src/routes/projekt.$id.cockpit.tsx` — fjern stor loading-gate, render direkte, fjern `MIN_LOADING_MS`. Tilføj `refreshSource(kind)` callback. Beskyttet fil (orchestrator-niveau) — kræver review.
- `src/components/cockpit/EjendomPanel.tsx`, `OekonomiPanel.tsx`, `RisikoFeed.tsx`, `ComplianceFeed.tsx` — tilføj `<DataSourceStatus kind="..." />`-header.
- **Ny komponent**: `src/components/cockpit/DataSourceStatus.tsx` — pille + refresh-knap, læser status fra store, kalder `refreshSource`.
- **Nye server-fns**: én pr. integration (kan bo i `src/lib/refresh.functions.ts` eller splittes pr. integration).

**Beholder vi**: `address_analysis`-cachen og dens TTLs er den rigtige sandhedskilde — vi bruger blot `*_at`-kolonnerne til at afgøre `fresh` vs. `stale` i UI.

**Datakontrakt**: Status er afledt — gemmes IKKE som typed kolonne i `projects`. Den beregnes ved restore baseret på (a) om feltet er null og (b) `address_analysis.*_at` tidsstempler.

## Hvad jeg gerne vil have afklaret før implementering

1. Skal "Genindlæs alt"-knappen være synlig hele tiden i toppen, eller kun når mindst én kilde er `stale`/`missing`?
2. Hvilken TTL skal udløse `stale`-tilstand i UI'et? De nuværende cache-TTLs (lokalplan 30d, servitut 7d, compliance 30d) er fra `cache/client.ts` — skal vi bruge samme værdier, eller mere aggressive (fx 7d for alt) til UI-markering?
3. Skal AI-genererede kilder (byggeanalyse, billedanalyse, husDna) have refresh-knapper? De er dyrere at regenerere — måske kun "Forny analyse"-knap når input (byggeoenske, inspirationsbilleder) ændres.
4. Preference-toggle ("Vis cachet" vs. "Hent altid friske") — skal den gemmes pr. bruger (profil) eller pr. projekt?
