# Sprint-design: Næste 3 prioriterede tasks

**Dato:** 2026-05-17
**Tasks:** ARCH-163 · ARCH-213 · ARCH-181/182
**Tilgang:** Brugerværdi + teknisk fundament — vi arbejder selv (Claude Code)

---

## Kontekst

Brainstorming identificerede at ARCH-169 (live Byggeoenske + compliance) allerede er implementeret i `cockpit/index.tsx` linje 161–176 — `computePartialUpdate()` kaldes og resultatet skrives til store. ARCH-169 bør lukkes i Linear.

De tre valgte tasks dækker: data integrity (ARCH-163), brugervendt økonomi (ARCH-213) og visuel/spatial kontekst (ARCH-181/182).

---

## Task 1: ARCH-163 — Typede kolonner → EjendomPanel + OekonomiPanel

### Problem

`EjendomPanel.tsx` og `OekonomiPanel.tsx` læser compliance-data fra runtime-beregnede kæder (`complianceMetrics?.grundareal ?? bbrData?.grundareal ?? k?.grundareal`). Ved page refresh uden pipeline-kørsel kan de falde tilbage til JSONB-felter der er stale. ARCH-160 er Done — typede SSOT-felter eksisterer i store.

### Design

**Filer:** `src/components/cockpit/EjendomPanel.tsx` + `src/components/cockpit/OekonomiPanel.tsx`

**Fallback-kæde (begge paneler):**
```typescript
const grundareal = grundareal_m2 ?? complianceMetrics?.grundareal ?? bbrData?.grundareal ?? k?.grundareal ?? null;
const bebyggetAreal = bebygget_areal_m2 ?? bbrData?.bebygget_areal ?? null;
```
`grundareal_m2` og `bebygget_areal_m2` sættes først — de er SSOT fra Supabase og korrekte ved restore uden pipeline.

**Nyt i EjendomPanel:**
- SAVE-bevaringsværdi-felt fra `heritage_save_value`:
  - Rød badge: 1–3 (høj bevaringsværdi — nedrivning kræver dispensation)
  - Gul badge: 4–6 (middel)
  - Grøn badge: 7–9 (lav — normal nedrivning)
- Fredningsstatus-badge (`is_fredet === true`) med link til relevant myndighed

**Nyt i OekonomiPanel:**
- Bebyggelsesprocent beregnes fra `grundareal_m2` + `bebygget_areal_m2`
- `budget_estimate` (BIGINT fra `projects`) vises formateret: `Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })`

**Scope:** Kun disse to filer. Ingen store-ændringer, ingen migrations, ingen server functions.

### Acceptkriterier
- [ ] EjendomPanel viser SAVE-bevaringsværdi med rød/gul/grøn badge fra `heritage_save_value`
- [ ] EjendomPanel viser fredningsstatus-badge fra `is_fredet`
- [ ] OekonomiPanel beregner bebyggelsesprocent fra typede felter
- [ ] OekonomiPanel viser `budget_estimate` som DKK
- [ ] Korrekte data ved direkte URL-adgang (page refresh uden pipeline)
- [ ] `bun build` + `bun test` grøn

---

## Task 2: ARCH-213 — Samlet budgetkalkulator

### Problem

Private bygherrer undervurderer totalomkostninger med 30–50% fordi nedrivning, forsyningsafkobling og geoteknik glemmes. Cockpit viser i dag kun VUR-ejendomsværdi — ingen samlet omkostningsestimering.

### Design

**Ny fil:** `src/components/cockpit/BudgetKalkulator.tsx`
**Placering:** Nyt kort i `OekonomiPanel.tsx` under ejendomsvurderingen.

#### 4 kategorier

**1. Nedrivning** (auto fra store, redigerbar):
- Input: `bebygget_areal_m2` (auto) + asbest-flag (auto: `parseInt(bbrData.byggeaar ?? '0') < 1978` — byggeaar er `string | null`)
- Sats: 800–1.200 kr/m², +200 kr/m² ved asbest-risiko
- Resultat: min/max range

**2. Forsyningsafkobling** (fast estimat, redigerbar toggle per forsyningstype):
- El: 15.000–25.000 kr
- Vand: 10.000–20.000 kr
- Kloak: 20.000–50.000 kr
- Gas (vises kun hvis `bbrData.opvarmningsmiddel === 'naturgas'`): 10.000–15.000 kr

**3. Geoteknik** (bruger-valgt kategori, GEUS er MOCK):
- Dropdown: Kategori 1 (god grund) / Kategori 2 (variabel) / Kategori 3 (dårlig/pæl)
- Range: 0–50k / 50k–200k / 200k–500k kr
- Badge: "Baseret på GEUS-estimat (eksempeldata)"

**4. Nybyg** (auto fra Byggeoenske, redigerbar):
- Input: `byggeoenske.oensketAreal` + energiklasse + kælder-flag
- Sats: 22.000–26.000 kr/m², +2.000 kr/m² lavenergi, +5.000 kr/m² kælder
- Resultat: min/max range

#### Output
- Vandfaldsbar (Recharts `BarChart`, akkumulerede lag) — min/typisk/max per kategori
- Total: min / typisk / max formateret som DKK
- Sammenligning: "Projektet koster [X–Y gange] mere end ejendomsværdien" (fra `vurderingData.ejendomsvaerdi`)

#### Arkitektur
- Lokal `useState` for bruger-overrides (geoteknik-kategori, forsyningstype-toggles, areal-overrides)
- Pure computation — ingen API-kald, ingen store-ændringer
- Recharts er allerede i bundle via shadcn
- `OekonomiPanel.tsx` importerer og renderer `<BudgetKalkulator />`

### Acceptkriterier
- [ ] Nedrivning auto-beregnet fra `bebygget_areal_m2` med asbest-flag ved byggeår < 1978
- [ ] Forsyningsafkobling viser gas-linje kun ved naturgas-opvarmning
- [ ] Geoteknik har MOCK-disclaimer
- [ ] Nybyg auto-udfyldt fra Byggeoenske
- [ ] Vandfaldsbar viser akkumulerede min/max per kategori
- [ ] Total sammenlignes med VUR-ejendomsværdi
- [ ] Alle inputs redigerbare
- [ ] `bun build` + `bun test` grøn

---

## Task 3: ARCH-181/182 — Cockpit-kort med WMS/WFS-lag

### Problem

`MatrikelCanvas` er en simpel SVG baseret på et antaget kvadratisk grundareal. Den giver ingen reel spatial kontekst — brugeren kan ikke se matrikelgrænser, nabogrunde eller sin ønskede bygnings placering på det faktiske grundstykke.

### Design

**Ny fil:** `src/components/cockpit/CockpitMap.tsx` (erstatter `MatrikelMap.tsx` i ANALYSE-tabben)
**`MatrikelMap.tsx`** beholdes — bruges fortsat i EJENDOM-tabben som fallback indtil stabil.

#### Lag-arkitektur (MVP)

| Lag | Kilde | Proxy | Cache |
|---|---|---|---|
| Basemap | Skærmkort WMTS | Eksisterende ARCH-178 proxy | Cloudflare max-age=86400 |
| Matrikelgrænser | Matriklen2 WMS | Ny `createServerFn` | Request-level |
| Jordstykke-polygon | Matriklen2 WFS | Ny `createServerFn` | `address_analysis.jordstykke_polygon JSONB` (ny kolonne via migration) |
| Eksisterende bygning | BBR approx. footprint | — | Fra `bbrData` |
| Ny bygning | `DesignPlacement` i store | — | Reaktiv |

#### Server functions (begge i `src/routes/api/`)
- `mat-wms-proxy.ts`: proxyer WMS-tile-requests til Matriklen2 med API-key
- `mat-wfs-polygon.ts`: henter jordstykke-polygon for matrikelnummer, cacher i `address_analysis.jordstykke_polygon JSONB` (ny kolonne — kræver migration: `ALTER TABLE address_analysis ADD COLUMN jordstykke_polygon JSONB`)

#### Bygningsplacering
- Ny bygning tegnes som OpenLayers-feature fra `designPlacement` (footprint + rotation)
- Drag-interaktion: `ol/interaction/Translate` → oversætter `footprintGeojson`-koordinaterne med turf `@turf/transform-translate`, kalder `setDesignPlacement({ footprintGeojson: translatedPolygon, footprintAreaM2: ... })`
- Roter: custom rotate handle → `@turf/transform-rotate` på `footprintGeojson`-polygon
- Reset: sætter `footprintGeojson` tilbage til center af jordstykke-polygon (centroid fra WFS-polygon)

#### Live badges (øverst på kortet)
- Bebyggelsesprocent: beregnet reaktivt fra `complianceMetrics` + `designPlacement`
- Skelafstand: beregnet fra bygningsfodaftryk vs. jordstykke-polygon
- Rød badge ved overskridelse

#### Hard stop banner
- Overlay over korteditor hvis `hard_stop === true` (fra store)
- Konsistent med eksisterende Hard Stop-logik i compliance-panel

#### Fallback
- Ingen adresse i store → standard Danmark-zoom, editor disabled, CTA "Vælg adresse"
- Ingen WFS-polygon → vis kun WMS matrikellag uden drag-feature

#### Fase 2 (eksplicit udeladt)
Restriktionspolygoner (strandbeskyttelse-areal, fredskov), snap-to-parcel, footprint-size handles, flere bygninger.

### Acceptkriterier
- [ ] OpenLayers-komponent renderer Skærmkort WMTS basemap
- [ ] Matriklen2 WMS viser matrikelgrænser
- [ ] Jordstykke-polygon fra WFS caches i `address_analysis`
- [ ] Drag + roter + reset virker og skriver til `designPlacement` i store
- [ ] Live bebyggelsesprocent-badge opdateres ved drag
- [ ] Hard stop banner vises ved `hard_stop === true`
- [ ] Fallback ved ingen adresse
- [ ] `bun build` + `bun test` grøn

---

## Rækkefølge og afhængigheder

```
ARCH-163  →  isoleret, start her
ARCH-213  →  isoleret, paralleliserbar med ARCH-163
ARCH-181/182  →  størst scope, sidst
```

ARCH-163 og ARCH-213 er fuldt uafhængige og kan arbejdes på parallelt eller i rækkefølge. ARCH-181/182 kræver server functions og ny dependency (OpenLayers) — mest passende som afsluttende task.

## ARCH-169 — luk i Linear

`computePartialUpdate()` er allerede implementeret og kaldt i `ProjektDnaPanel.patch()` (cockpit/index.tsx linje 161–176). Resultatet skrives til store. ARCH-169 bør markeres **Done** i Linear.
