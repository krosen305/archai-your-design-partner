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

## Task 3: ARCH-181/182 — WFS polygon-caching (det eneste tilbageværende)

### Opdateret analyse (2026-05-17)

`MatrikelMap.tsx` er allerede en fuldt implementeret OpenLayers-komponent:
- Skærmkort WMTS basemap ✅
- Matriklen2 WFS parcel geometry (`fetchParcelGeometry`) ✅
- Matriklen2 WMS preview (`fetchMatriklenPreview`) ✅
- Drag + roter + reset ✅
- Live badges (bebyggelsesprocent, skelafstand) ✅
- Hard stop banner ✅
- Fallback ved ingen adresse ✅

`MatrikelCanvas` i ANALYSE-tabben er allerede en tynd wrapper der renderer `<MatrikelMap />`.

**Det eneste tilbageværende fra ARCH-181 definition of done:** "Jordstykke-polygon caches i `address_analysis`." WFS-polygon hentes i dag fresh ved hver load — ingen Supabase-cache.

### Design

**Filer:**
- Ny migration: `supabase/migrations/YYYYMMDD_add_jordstykke_polygon.sql`
- Modificér: `src/lib/map-proxy.ts` — `fetchParcelGeometryProxy` udvides med cache-read/write
- Modificér: `src/routes/api.map-tiles.ts` — `fetchParcelGeometry` inputvalidator udvides med `adresseid`
- Modificér: `src/components/cockpit/MatrikelMap.tsx` — sender `adresseid` med til server function

#### Migration
```sql
ALTER TABLE public.address_analysis
  ADD COLUMN IF NOT EXISTS jordstykke_polygon JSONB,
  ADD COLUMN IF NOT EXISTS jordstykke_polygon_at TIMESTAMPTZ;
```

#### Cache-logik i `fetchParcelGeometryProxy`
Input udvides: `{ point: MapPoint, adresseid?: string | null, bufferMeters?: number }`

1. Hvis `adresseid`: check `address_analysis.jordstykke_polygon` for cached polygon
2. Cache hit → returner cached `featureCollection` med `source: "wfs"`
3. Cache miss → fetch WFS → skriv til `address_analysis.jordstykke_polygon` → returner

### Acceptkriterier
- [ ] Jordstykke-polygon gemmes i `address_analysis.jordstykke_polygon` efter første WFS-kald
- [ ] Andet besøg på samme adresse bruger cached polygon (ingen ny WFS-request)
- [ ] `adresseid` sendes fra `MatrikelMap.tsx` til `fetchParcelGeometry`
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
