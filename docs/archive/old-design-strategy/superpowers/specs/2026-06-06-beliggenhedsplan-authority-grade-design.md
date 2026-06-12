# Beliggenhedsplan — Authority-Grade Design Spec

**Dato:** 2026-06-06
**Status:** Godkendt af Kasper Rosenmejer — klar til implementeringsplan
**Relaterede dokumenter:**

- Tidligere spec: `docs/superpowers/specs/2026-05-28-beliggenhedsplan-myndighedstegning-design.md`
- Gatekeeper-protokol: `CLAUDE.md`

---

## 1. Vision og scope

Beliggenhedsplanen er **ikke** et brugerprodukt. Den er et myndighedsartefakt — et deterministisk output genereret fra data indsamlet på tværs af rejsen (Matriklen + Maskinrummet). Brugeren interagerer ikke med tegningen. Brugeren træffer designbeslutninger andre steder; systemet genererer resultatet.

Tegningen er parallelt med plantegning og facadetegning: et lag i byggeansøgningspakken, ikke et selvstændigt step.

**Completeness-model:** Tegningen er altid downloadbar. Hvis data mangler tegner systemet placeholders med angivelse af hvem der udfylder dem (kloakmester, landinspektør, arkitekt, bruger). Tegningen bærer et "UDKAST"-vandmærke indtil alle blocking-felter er opfyldt. Ingen gate — kun ærlighed.

**Permanent sandhed:** Tinglyste servitutter vises altid som placeholder med opfordring til at tjekke tinglysning.dk. Det er en korrekt erklæring, ikke en svaghed.

---

## 2. Arkitektur og dataflow

### 2.1 Tre-trins dataflow

```
TRIN 1 — MATRIKLEN (ved adresseanalyse)
  Ny service: handleFetchSiteGeometry
  Kører parallelt med eksisterende compliance-analyse
  Henter: vej, naturbeskyttelse, LER, kloakopland, fjernvarme
  Skriver: 5 rækker til address_source_results (Zod-validerede JSONB)
  Udstillet via: api.site-geometry.ts (ny tynd server-funktion)

TRIN 2 — MASKINRUMMET (ved designbeslutning)
  Bruger angiver: tagform, taghaldning, kælder, jordvarme, nedrivning
  Gemmes til: typed kolonner på projects-tabel
  Live-validering: reactive-compliance.ts surfacerer fund øjeblikkeligt
  Ingen server-kald til Datafordeler — alle data allerede cached

TRIN 3 — MYNDIGHED (on-demand generering)
  assembleBeliggenhedsplan() henter fra cache + typed kolonner
  computeDrawingCompleteness() returnerer per-felt status
  SVG renderes med auto-data, estimater og placeholders
  PDF genereres med UDKAST-vandmærke hvis draft
  Download altid tilgængeligt
```

### 2.2 Cache-mekanisme

Fem nye `source_type`-værdier i `address_source_results`:

| source_type          | payload-type                               | Zod-schema                             |
| -------------------- | ------------------------------------------ | -------------------------------------- |
| `"vej_geometry"`     | `VejLayer \| null`                         | `VejLayerSchema`                       |
| `"naturbeskyttelse"` | `NaturbeskyttelseLayer[]`                  | `z.array(NaturbeskyttelseLayerSchema)` |
| `"ler_ledninger"`    | `LerLedning[]`                             | `z.array(LerLedningSchema)`            |
| `"kloakopland"`      | `{ type: "separat" \| "faelles" \| null }` | inline                                 |
| `"fjernvarme"`       | `{ daekning: boolean \| null }`            | inline                                 |

Hvert payload valideres med Zod inden skrivning (Rule 1). Cache-miss returnerer `null` for laget — aldrig en fejl. Cachen invalideres ved ny adresseanalyse på samme projekt.

### 2.3 Boundary: hvad er serverfunktion, hvad er service

```
api.site-geometry.ts         → validér → auth → handleFetchSiteGeometry → gem cache
api.drawing-readiness.ts     → validér → auth → læs cache + typed kolonner → computeCompleteness
api.drawing.ts (eksist.)     → validér → auth → assembleBeliggenhedsplan → renderSvg → gem export

handleFetchSiteGeometry      → kalder 5 adapter-metoder parallelt → skriver via repository
assembleBeliggenhedsplan     → læser fra cache-repository + adapter (parcel, DHM, plandata)
computeDrawingCompleteness   → ren funktion, ingen I/O
```

---

## 3. Domænemodel

### 3.1 Tre nye typer i `src/domain/drawing/beliggenhedsplan.types.ts`

```typescript
// --- VejLayer ---
export type VejLayer = {
  vejnavn: string;
  centerline25832: GeoJsonLineString25832 | null;
  vejkant25832: GeoJsonLineString25832 | null;
  vejbreddeM: number | null;
  source: LayerSourceMeta;
};

// --- NaturbeskyttelseLayer ---
export type NaturbeskyttelseType =
  | "strandbeskyttelse"
  | "skovbyggelinje"
  | "åbeskyttelse"
  | "fortidsmindebeskyttelse"
  | "klitfredning";

export type NaturbeskyttelseLayer = {
  type: NaturbeskyttelseType;
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  bufferDistanceM: number;
  intersectsProposedBuilding: boolean; // forberegnet — rule engine bruger dette direkte
  source: LayerSourceMeta;
};

// --- LerLedning ---
export type LerLedningType =
  | "kloak_spildevand"
  | "kloak_regnvand"
  | "kloak_faelles"
  | "vand"
  | "el"
  | "naturgas"
  | "fjernvarme"
  | "telekom";

export type LerLedning = {
  type: LerLedningType;
  geometry25832: GeoJsonLineString25832;
  ejer: string | null;
  dybdeM: number | null;
  diameterMm: number | null;
  source: LayerSourceMeta;
};
```

### 3.2 Udvidelse af eksisterende typer

**`ProposedBuildingLayer`** — tre nye felter:

```typescript
tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
taghaldningGrad: number | null; // 0–60 grader
rygningsKoteM: number | null; // DVR90, beregnet deterministisk
```

**`ExistingBuilding`** — ét nyt felt:

```typescript
nedrives: boolean; // tegnes med kryds-skravering + "NEDRIVES"
```

**`BeliggenhedsplanInput`** — fire nye lag:

```typescript
vej: VejLayer | null;
naturbeskyttelse: NaturbeskyttelseLayer[];
lerLedninger: LerLedning[];
kloakoplandType: "separat" | "faelles" | null;
```

### 3.3 Schema-opdatering (`beliggenhedsplan.schemas.ts`)

Tre Rule 1-brud repareres. Fire nye schemas tilføjes:

```typescript
// REPARATIONER:
utilities: z.array(UtilityLayerSchema),       // var z.unknown()
siteUse: z.array(SiteUseLayerSchema),         // var z.unknown()
terrain: TerrainLayerSchema.nullable(),        // var z.unknown()

// NYE SCHEMAS:
export const VejLayerSchema = z.object({
  vejnavn: z.string(),
  centerline25832: GeoJsonLineString25832Schema.nullable(),
  vejkant25832: GeoJsonLineString25832Schema.nullable(),
  vejbreddeM: z.number().positive().nullable(),
  source: LayerSourceMetaSchema,
});

export const NaturbeskyttelseLayerSchema = z.object({
  type: z.enum([
    "strandbeskyttelse", "skovbyggelinje", "åbeskyttelse",
    "fortidsmindebeskyttelse", "klitfredning",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  bufferDistanceM: z.number(),
  intersectsProposedBuilding: z.boolean(),
  source: LayerSourceMetaSchema,
});

export const LerLedningSchema = z.object({
  type: z.enum([
    "kloak_spildevand", "kloak_regnvand", "kloak_faelles",
    "vand", "el", "naturgas", "fjernvarme", "telekom",
  ]),
  geometry25832: GeoJsonLineString25832Schema,
  ejer: z.string().nullable(),
  dybdeM: z.number().nullable(),
  diameterMm: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

// OPDATERET BeliggenhedsplanInputSchema tilføjer de fire nye felter
// (alle eksisterende felter bibeholdes — kun additions)
```

### 3.4 Migration — nye typed kolonner

```sql
-- supabase/migrations/20260606100000_drawing_params.sql
ALTER TABLE projects
  ADD COLUMN taghaldning_grad    numeric,
  ADD COLUMN tagform             text CHECK (tagform IN ('sadeltag','fladt','mansard','pulttag')),
  ADD COLUMN har_jordvarme       boolean NOT NULL DEFAULT false,
  ADD COLUMN har_kaelder         boolean NOT NULL DEFAULT false,
  ADD COLUMN kaelder_gulv_kote_m numeric;
```

Disse er typed SQL-kolonner (Rule 6) fordi de driver rule-engine-valideringer. De læses af `useProject()` via udvidelse af project-store (se afsnit 7).

---

## 4. Ports — `src/domain/drawing/ports.ts`

Fuld opdateret interface:

```typescript
export interface DrawingGeometrySourcePort {
  // Eksisterende (uændrede):
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
  fetchNeighborParcels(ownJordstykkeId: string, bbox25832: BBox25832): Promise<NeighborParcel[]>;
  fetchRoadName(addressId: string): Promise<{ name: string | null }>;
  fetchDhmKoter(bbox25832: BBox25832, lat: number, lng: number): Promise<TerrainLayer | null>;

  // Erstattet (stub fjernes):
  fetchRoadGeometry(addressId: string, bbox25832: BBox25832): Promise<VejLayer | null>;

  // Nye:
  fetchNaturbeskyttelse(bbox25832: BBox25832): Promise<NaturbeskyttelseLayer[]>;
  fetchLerLedninger(bbox25832: BBox25832): Promise<LerLedning[]>;
  fetchKloakopland(
    kommunekode: string,
    bbox25832: BBox25832,
  ): Promise<"separat" | "faelles" | null>;
  fetchFjernvarmeDaekning(centroidLat: number, centroidLng: number): Promise<boolean | null>;
}
```

---

## 5. Adapters — datapunktsinventar

### 5.1 Vejgeometri (`src/integrations/geodanmark/drawing-layers.ts`)

| Datapunkt                        | Mulig kilde                                                                               | Confidence |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| Vejmidte LineString (EPSG:25832) | GeoDanmark WFS — feature type `vejmidte`. Via Dataforsyningen med `DATAFORSYNINGEN_TOKEN` | medium     |
| Vejkant LineString (EPSG:25832)  | GeoDanmark WFS — feature type `vejkant`                                                   | medium     |
| Vejbredde (beregnet)             | Geometrisk afstand vejkant↔vejkant                                                        | medium     |

Filter: bbox udvidet med 50 m. Begge feature types forespørges parallelt.
Fallback: Hvis fetch fejler → `null` for de geometriske felter. Vejnavn genbruges fra eksisterende `fetchRoadName`.

### 5.2 Naturbeskyttelse (`src/integrations/miljoeportalen/naturbeskyttelse-adapter.ts`)

| Datapunkt               | Bufferzone | Mulig kilde                                                                                                                                    | Confidence |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Strandbeskyttelseslinje | 300 m      | Miljøstyrelsen WFS. Mulig service-URL: `https://wfs2-miljoegis.mim.dk/natur`. Feature type: `strandbeskyttelseslinje`. **Verificér endpoint.** | medium     |
| Skovbyggelinje          | 300 m      | Samme WFS, feature type: `skovbyggelinje`                                                                                                      | medium     |
| Åbeskyttelseslinje      | 150 m      | Samme WFS, feature type: `aabeskyttelseslinje`                                                                                                 | medium     |
| Fortidsmindebeskyttelse | 100 m      | Slots- og Kulturstyrelsen WFS eller Miljøportalen. Feature type: `fortidsmindebeskyttelseslinje`. **Verificér endpoint.**                      | medium     |
| Klitfredning            | variabel   | Kystdirektoratet / Miljøstyrelsen WFS. Feature type: `klitfredning`. **Verificér endpoint.**                                                   | medium     |

Hvert af de fem kald wraps i individuelt try/catch. Fejl på ét kald → `[]` for den type — blokerer ikke assemblering.
`intersectsProposedBuilding` beregnes via `polygonsIntersect()` i geometry-engine inden lagret i cache.

### 5.3 LER-ledninger (`src/integrations/ler/ler-adapter.ts`)

| Datapunkt                                 | Mulig kilde                                                                                                                                                                   | Note                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Ledningsgeometri (LineString, type, ejer) | LER 2.0 REST API. Mulige base-URLs: `https://lerdataservices.dk/api/v1/` eller `https://ler.forsyningstilsynet.dk/`. Forespørgsel: bbox. **Verificér endpoint og auth-krav.** | Dækker primærnet — ikke stikledninger |
| Ledningstype mapping                      | LER-response attribut                                                                                                                                                         | Se type-mapping i afsnit 3.1          |
| Dybde, diameter                           | LER-response attribut                                                                                                                                                         | Accepter null — sjældent udfyldt      |

Confidence: `"medium"`, `requiresReview: true` for alle LER-features.
Legenden på tegningen: _"Ledninger: LER (primærnet — stikledninger til grunden ikke vist)"_

### 5.4 Kloakopland (`src/integrations/plandata/kloakopland-adapter.ts`)

| Lag   | Kilde                                                                                                       | Fallback |
| ----- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Lag 1 | Plandata WFS — kommunale spildevandsplan-lag hvor tilgængeligt                                              | → Lag 2  |
| Lag 2 | Direkte kommunal WFS — statisk mapping fra kommunekode til endpoint. Bygges progressivt fra top-10 kommuner | → `null` |

Returnerer `"separat" \| "faelles" \| null`. Fejl → `null`. Null vises som placeholder på tegningen.

### 5.5 Fjernvarmedækning (`src/integrations/energistyrelsen/fjernvarme-adapter.ts`)

| Datapunkt                                 | Mulig kilde                                                                                                                                                                  | Note           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Fjernvarme tilgængelig i område (boolean) | Energistyrelsens Energi Data Service (EDS) eller Varmeplan Danmark. **Verificér endpoint.** Fallback: heuristik baseret på BBR `varmeinstallation`-koder for adresser i bbox | low confidence |

Returnerer `boolean \| null`. Null → placeholder annotation.

---

## 6. Completeness-motor (`src/domain/drawing/completeness-engine.ts`)

### 6.1 Typer

```typescript
export type ResponsibleParty = "kloakmester" | "landinspektør" | "arkitekt" | "ingeniør" | "bruger";

export type FieldStatus =
  | { status: "auto"; source: DataSource; confidence: DataConfidence }
  | { status: "estimated"; source: DataSource; note: string }
  | { status: "placeholder"; responsibleParty: ResponsibleParty; displayLabel: string }
  | { status: "missing"; blocksSubmission: boolean; displayLabel: string };

export type DrawingCompleteness = {
  overallStatus: "ready" | "draft";
  fields: {
    parcelPolygon: FieldStatus;
    proposedFootprint: FieldStatus;
    sokkelKote: FieldStatus;
    rygningsKote: FieldStatus;
    vejGeometry: FieldStatus;
    koterTerræn: FieldStatus;
    kloakStikledning: FieldStatus;
    regnvandsløsning: FieldStatus;
    overkørsel: FieldStatus;
    naturbeskyttelse: FieldStatus;
    tinglysteServitutter: FieldStatus;
  };
  blockingCount: number;
  placeholderCount: number;
  permanentWarnings: string[];
};
```

### 6.2 Feltregler

| Felt                   | `auto`                                                                           | `estimated`                                       | `placeholder`                                | Blocking            |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- | ------------------- |
| `parcelPolygon`        | altid (nås ikke her ellers)                                                      | —                                                 | —                                            | —                   |
| `proposedFootprint`    | source `"survey"\|"cad_upload"` eller fra designværktøj med `"generated"` + high | source `"generated"` fra bredde/dybde-dimensioner | null                                         | **JA**              |
| `sokkelKote`           | survey terrainPoints > 0 OG sokkelKoteM sat                                      | sokkelKoteM fra DHM + 0,30 m                      | sokkelKoteM null                             | nej — kloakmester   |
| `rygningsKote`         | tagform + taghaldningGrad kendte + sokkel auto                                   | tagform kendt, sokkel estimated                   | tagform null                                 | nej — arkitekt      |
| `vejGeometry`          | centerline25832 ikke null                                                        | vejkant tilgængeligt, ikke centerline             | begge null                                   | nej                 |
| `koterTerræn`          | survey.terrainPoints.length > 0                                                  | terrain fra DHM (source.source === "registry")    | terrain null                                 | nej — landinspektør |
| `kloakStikledning`     | **aldrig**                                                                       | **aldrig**                                        | **altid** — kloakmester                      | nej                 |
| `regnvandsløsning`     | kloakoplandType `"faelles"`                                                      | —                                                 | kloakoplandType `"separat"` **eller** `null` | nej — kloakmester   |
| `overkørsel`           | SiteUseLayer type `"driveway"` med source !== `"placeholder"`                    | —                                                 | **altid som default** — bruger               | nej                 |
| `naturbeskyttelse`     | fetch forsøgt (fetchedAt ikke null)                                              | —                                                 | fetch ikke forsøgt                           | nej                 |
| `tinglysteServitutter` | **aldrig**                                                                       | **aldrig**                                        | **altid** — bruger                           | nej                 |

### 6.3 Permanente advarsler

`permanentWarnings` indeholder **altid** (uanset completeness):

```
"Kontroller tinglyste servitutter og privatretlige deklarationer
 via tinglysning.dk inden indgivelse til kommunen."
```

### 6.4 Overall status

```typescript
const blockingCount = Object.values(fields).filter(
  (f) => f.status === "missing" && f.blocksSubmission,
).length;
overallStatus = blockingCount === 0 ? "ready" : "draft";
```

---

## 7. Rule-engine-tilføjelser

### 7.1 `validateNaturbeskyttelse` (`src/lib/rule-engine/rules/nature-protection-rules.ts`)

```typescript
export function validateNaturbeskyttelse(
  naturbeskyttelse: NaturbeskyttelseLayer[],
): ReadinessReason[];
```

Returnerer én `blocking` reason per lag hvor `intersectsProposedBuilding === true`.
Lovhenvisninger er faste strings — se implementering nedenfor:

| Type                    | Lovhenvisning                               |
| ----------------------- | ------------------------------------------- |
| strandbeskyttelse       | NBL §15 — dispensation fra Kystdirektoratet |
| skovbyggelinje          | NBL §17 — dispensation fra Miljøstyrelsen   |
| åbeskyttelse            | NBL §16 — dispensation                      |
| fortidsmindebeskyttelse | NBL §18 — Slots- og Kulturstyrelsen         |
| klitfredning            | NBL §8 — dispensation fra Kystdirektoratet  |

### 7.2 `validateKælderFeasibility` (`src/lib/rule-engine/rules/basement-rules.ts`)

```typescript
export function validateKælderFeasibility(input: {
  hasKælder: boolean;
  kælderGulvKoteM: number | null;
  grundvandSpejlKoteM: number | null; // fra GEUS/Jupiter
  terrainKoteM: number | null; // fra DHM
}): ReadinessReason[];
```

**Regler:**

- `!hasKælder` → `[]`
- `kælderGulvKoteM < grundvandSpejlKoteM + 0,5` → **blocking**: grundvand-Hard Stop
- `kælderGulvKoteM < terrainKoteM - 1,2` → **warning**: pumpe sandsynligvis nødvendig
  - `1,2 m` er konservativt landsdækkende estimat for kloakdybde (dækker alle frostzoner)
  - Reason-teksten angiver eksplicit at dette er et estimat
- `kælderGulvKoteM === null` → **warning**: gulvkote mangler, kloak-beregning afventer

### 7.3 `validateJordvarmePermit` (`src/lib/rule-engine/rules/utility-rules.ts`)

```typescript
export function validateJordvarmePermit(input: { hasJordvarme: boolean }): ReadinessReason[];
```

**Regler:**

- `!hasJordvarme` → `[]`
- `hasJordvarme` → to `info`-reasons:
  1. §19 MBL-tilladelse fra kommunen (boringer > 10 m)
  2. GEUS Jupiter-registrering efter etablering

### 7.4 `computeRygningsKote` (`src/domain/drawing/geometry-engine.ts`)

```typescript
export function computeRygningsKote(input: {
  sokkelKoteM: number;
  loftshøjdeM: number; // typisk 2,40–2,60 m
  fodprintBreddeM: number; // korteste dimension af bygningsfodprint
  tagform: "sadeltag" | "pulttag" | "mansard" | "fladt";
  taghaldningGrad: number;
}): number;
```

Beregning:

- sadeltag/pulttag: `taghøjde = (bredde/2) × tan(haldning)`
- mansard: `taghøjde = (bredde/2) × tan(haldning) × 0,6`
- fladt: `taghøjde = 0,15` (minimalt fald)
- `rygningsKoteM = sokkelKoteM + loftshøjdeM + taghøjde`

---

## 8. reactive-compliance integration (`src/lib/reactive-compliance.ts`)

`PartialUpdateParams` udvides med valgfrie nye felter:

```typescript
// Tilføjes til PartialUpdateParams — alle valgfrie, breaking change undgås:
proposedFootprint25832?: GeoJsonPolygon25832 | null;
naturbeskyttelseZoner?: NaturbeskyttelseLayer[];
harKælder?: boolean;
kælderGulvKoteM?: number | null;
harJordvarme?: boolean;
```

`PartialUpdateResult` udvides med:

```typescript
drawingReasons?: ReadinessReason[];
```

I `computePartialUpdate`, efter eksisterende `runRuleEngine`-kald:

```typescript
const drawingReasons: ReadinessReason[] = [
  ...validateNaturbeskyttelse(params.naturbeskyttelseZoner ?? []),
  ...validateKælderFeasibility({
    hasKælder: params.harKælder ?? false,
    kælderGulvKoteM: params.kælderGulvKoteM ?? null,
    grundvandSpejlKoteM: geusRisk?.grundvandsspejlKoteM ?? null,
    terrainKoteM: terrain?.representativeKoteM ?? null,
  }),
  ...validateJordvarmePermit({ hasJordvarme: params.harJordvarme ?? false }),
];
return { complianceMetrics, complianceFlags, ruleEngineResult, drawingReasons };
```

**PR-flag:** `Rører beskyttet fil — kræver review`

---

## 9. SVG-renderer

### 9.1 Visuel datakvalitetssprog

| Datakvalitet                          | Farve            | Stil               | Tekst                  |
| ------------------------------------- | ---------------- | ------------------ | ---------------------- |
| `auto` high confidence                | Sort `#111827`   | Solid, normal vægt | Normal                 |
| `estimated`                           | Grå `#6b7280`    | Let stiplet        | Kursiv                 |
| `placeholder`                         | Orange `#f97316` | Stiplet            | Kursiv + `[ansvarlig]` |
| Hard Stop intersection                | Rød `#dc2626`    | Skraveret fill     | Stor label             |
| Naturbeskyttelse (ingen intersection) | Amber `#f59e0b`  | Let skraveret fill | Lille label            |
| Nedrives                              | Grå `#9ca3af`    | Kryds-skravering   | "NEDRIVES"             |

### 9.2 Lagrækkefølge (bund til top)

```
 1. Baggrund (hvid)
 2. Vejflade (lys grå fill — scenarie-afhængig, se 9.3)
 3. Nabomatrikler (tynde stiplede grænser + matrikelnr-labels)
 4. LER-ledninger i vejbane (farvekodede, stiplede)
 5. Naturbeskyttelseszoner (skraverede polygoner)
 6. Plandata-byggefelt og constraints (lilla/blå stiplede)
 7. BR18-sætningszone 2,5 m (orange stiplet buffer)
 8. Parcelgrænse/skel (fed solid linje)
 9. Eksisterende bygninger (grå skravering — kryds + "NEDRIVES" hvis markeret)
10. Foreslået bygning (fed sort outline, let grøn fill)
11. Terrænkoter (grå cirkler + DVR90-labels)
12. Vejmidte (stiplet, tynd)
13. Kotepunkter ved bygningshjørner + sokkelkote/rygningskote-annotationer
14. Afstandsmål til alle skel (bemaerkningslinjer)
15. Placeholder-elementer (orange stiplede)
16. Nordpil + målestoksbjælke
17. Signaturforklaring (legende)
18. Tegningsblok (title block)
19. UDKAST-vandmærke (hvis draft)
```

### 9.3 Vejflade — tre scenarier

**Scenarie A** (vejmidte + vejkant tilgængelige):

- Fill: polygon konstrueret som offset af vejmidte ±(vejbreddeM/2). Farve: `#e5e7eb`
- Vejkant: solid `#9ca3af`, 0,5 px
- Vejmidte: stiplet `#d1d5db`, 0,3 px
- Vejnavn: centreret langs vejmidte, roteret med vejens vinkel

**Scenarie B** (kun vejmidte):

- Ingen fill. Vejmidte: stiplet `#9ca3af`, 0,5 px (lidt tykkere)
- Vejnavn-label langs vejmidte
- Lille annotation: "vejkant ikke kortlagt"

**Scenarie C** (ingen vejgeometri):

- Parcel-boundarySegment klassificeret `"road"` bruges som vejskel-reference
- Tynd solid linje på segmentet
- `"VEJ"`-tekst vinkelret på segmentet, 3 m ind i vejarealet

### 9.4 Placeholder-elementer

**kloakStikledning** (altid):

- Stiplet orange linje fra bygningens nærmeste punkt til skel mod vej
- Lille stiplet orange cirkel ved skel (brønd-symbol)
- Label: _"Stikledning [af kloakmester]"_
- Sub-label ved brønd: _"Invert-kote: [af kloakmester]"_

**regnvandsløsning** (hvis kloakopland `"separat"` eller `null`):

- Stiplet orange rektangel: algoritme finder bedste position min. 5 m fra bygning, 2 m fra skel
- Estimeret størrelse: ca. 0,08 m³ pr. m² tagflade (vejledende)
- Fallback (ingen gyldig position): symbol ved fodprint-hjørne med label _"Regnvandsløsning — placering ikke mulig at beregne automatisk. Fastlægges af kloakmester og landinspektør."_
- Label inkl. størrelse: _"Faskine ca. X m³ (vejl.) + sandfang [dim. af kloakmester]"_

**overkørsel** (default placeholder):

- Stiplet orange åbning i vejskel-segmentet, 3 m bred
- Label: _"Overkørsel [placering bekræftes af kommunen]"_

**sokkelKote** (estimated):

- Grå kursiv annotation ved hjørnepunkt: _"Sokkelkote: ca. DVR90 +X,XX m (est. DHM)"_
- Null: orange kursiv _"Sokkelkote: [af kloakmester]"_

**rygningsKote** (placeholder/estimated):

- Estimated: grå kursiv _"Rygningskote: ca. DVR90 +X,XX m (beregnet)"_
- Placeholder: orange kursiv _"Rygningskote: [angives af arkitekt]"_

### 9.5 LER-legende og farver

| Type             | Farve            | Stil    |
| ---------------- | ---------------- | ------- |
| kloak_spildevand | `#78350f` brun   | solid   |
| kloak_regnvand   | `#1d4ed8` blå    | solid   |
| kloak_faelles    | `#525252` grå    | solid   |
| vand             | `#0891b2` cyan   | stiplet |
| el               | `#ca8a04` gul    | stiplet |
| naturgas         | `#ea580c` orange | stiplet |
| fjernvarme       | `#dc2626` rød    | stiplet |
| telekom          | `#16a34a` grøn   | stiplet |

Legende: nederste venstre hjørne. Under legenden: _"Kilde: LER (primærnet — stikledninger til grunden ikke vist)"_

### 9.6 Tegningsblok

```
┌─────────────────────────────────────────────────────────────┐
│ BELIGGENHEDSPLAN                                            │
│ [Adresse]                       Matrikel: [nr], [ejerlav]  │
│ Bygherre: [navn]                BFE: [nr]                  │
│ Dato: [dato]                    Målestok: 1:250            │
│ Tegningsnr: [sagsnr]            Papir: A3                  │
├─────────────────────────────────────────────────────────────┤
│ STATUS: UDKAST — 2 blocking, 4 placeholders                │
├─────────────────────────────────────────────────────────────┤
│ Terrændata: DHM/Skåningerne (SDFI, DVR90)                  │
│ Matrikel: MAT WFS (Datafordeler)                           │
│ Ledninger: LER (primærnet)                                  │
├─────────────────────────────────────────────────────────────┤
│ NB: Kontroller tinglyste servitutter og privatretlige       │
│ deklarationer via tinglysning.dk inden indgivelse.          │
└─────────────────────────────────────────────────────────────┘
```

Status-linjen opdateres fra `DrawingCompleteness`. Datakilder vises kun for data der faktisk er hentet.

### 9.7 UDKAST-vandmærke

- Tekst: `"UDKAST"`. Rotation: −35°. Position: centrum af tegningsfladen
- Opacity: 0,12. Farve: `#6b7280`. Størrelse: `svgBredde / 5`
- Fjernes automatisk når `overallStatus === "ready"`

### 9.8 DrawingModel integration

`drawing-model.ts` udvides med fem nye valgfrie arrays. Konstruktionssteget (`buildDrawingModel`) mapper fra `BeliggenhedsplanInput + DrawingCompleteness → DrawingModel`. Rendereren læser udelukkende fra `DrawingModel`.

```typescript
// Tilføjes til DrawingModel:
vejElements: VejDrawingElements | null;
naturbeskyttelseElements: NaturbeskyttelseDrawingElement[];
lerElements: LerDrawingElement[];
placeholderElements: PlaceholderDrawingElement[];
watermark: WatermarkElement | null;
```

Implementeringsplanen specificerer at `drawing-model.ts` læses i sin helhed inden dette step påbegyndes.

---

## 10. UI

### 10.1 Maskinrummet — fire nye inputgrupper

**Tagform** (ved siden af bygningshøjde-input):

```
TAGFORM
[● Sadeltag] [Fladt] [Mansard] [Pulttag]

Taghaldning: [35] °   Genveje: [25°] [35°] [45°]

Beregnet rygningskote: DVR90 +23,85 m        ← live, ingen server-kald
```

**Kælder**:

```
[toggle] Kælder inkluderet i projektet
  → Kælderens gulvkote DVR90 (m): [____]
  → Live-validering fra reactive-compliance vises her
```

**Installationer**:

```
[toggle] Jordvarme
  → ℹ Kræver §19-tilladelse (vises øjeblikkeligt ved toggle)
```

**Nedrivning** (liste under kortvisning):

```
Eksisterende bygninger på grunden
☐ BBR [ID] — 142 m² bolig (opf. 1987)
☐ BBR [ID] — 24 m² udhus (opf. 1991)
Markér bygninger der nedrives som del af projektet.
```

### 10.2 Myndighed-UI (`projekt.teknik.tsx`)

To-kolonne layout:

**Venstre** — `MatrikelMap` med `readonly={true}` og `planLayers`-prop der viser vej, natur, LER, constraints, placeholders.

**Højre** — Dokumentpanel:

```
BELIGGENHEDSPLAN
────────────────────────────────
✓ Matrikelpolygon         auto (MAT)
✓ Bygningsfodprint        auto (designværktøj)
~ Sokkelkote              est. DVR90 +18,20 m
~ Rygningskote            est. DVR90 +23,85 m
~ Vejgeometri             medium (GeoDanmark)
~ Terrænkoter             DHM estimat
○ Kloakstikledning        kloakmester
○ Regnvandsløsning        kloakmester       ← ved separat/null kloakopland
○ Overkørsel              bekræftes
✓ Naturbeskyttelse        ingen i området
! Tinglyste servitutter   tjek tinglysning.dk
────────────────────────────────
STATUS: UDKAST
2 placeholders inden myndighedsindgivelse
────────────────────────────────
[↓ SVG — UDKAST]   [↓ PDF — UDKAST]
```

Hvert `○`-felt viser inline navigationslink til det rejsetrin der udfylder det.
Download er **altid** tilgængeligt. UDKAST-vandmærket er den ærlige indikator.

### 10.3 MatrikelMap — readonly prop

```typescript
// Ny prop — ikke breaking:
readonly?: boolean  // default: false

// Ny prop til beliggenhedsplan-lag:
planLayers?: {
  vej: VejLayer | null;
  naturbeskyttelse: NaturbeskyttelseLayer[];
  lerLedninger: LerLedning[];
}
```

Når `readonly={true}`: ingen `Translate`-interaction, ingen drag-hints, ingen cursor-ændring.

### 10.4 Project-store udvidelse

`project-store.ts` udvides med de fem nye typed kolonner (`tagform`, `taghaldningGrad`, `harKælder`, `kælderGulvKoteM`, `harJordvarme`). Disse hentes ved projekt-load via den eksisterende `loadProject()`-funktion og Supabase-repository'et. **PR-flag:** `Rører beskyttet fil — kræver review`

### 10.5 Server-funktioner

**`api.site-geometry.ts`** (ny):

- Input: `{ projectId, matrikelId, kommunekode, addressId, bbox25832 }`
- Kalder `handleFetchSiteGeometry` → gemmer 5 rækker i `address_source_results`
- Returnerer: `{ status: "ok" | "partial"; fetchedSources: string[] }`

**`api.drawing-readiness.ts`** (ny):

- Input: `{ projectId }`
- Læser cache + typed kolonner
- Returnerer `DrawingCompleteness` — ingen SVG-generering, < 200 ms

**`api.drawing.ts`** (eksist. — udvidet schema):

```typescript
// Nye felter i input-schema:
tagform: z.enum(["sadeltag", "fladt", "mansard", "pulttag"]).nullable(),
taghaldningGrad: z.number().min(0).max(60).nullable(),
harKælder: z.boolean().default(false),
kælderGulvKoteM: z.number().nullable(),
harJordvarme: z.boolean().default(false),
```

---

## 11. CLAUDE.md-opdateringer

### 11.1 Protected Files-listen

**`analysis-orchestrator.ts`** flyttes fra "Protected Files" til en ny sektion:

```
## Filer der kræver Gatekeeper-review ved ændring (ikke uberørbare)

- `src/lib/analysis-orchestrator.ts` — ændringer kræver arkitekturplan
  og eksplicit human review i PR, men er ikke forbudte.
```

**`project-store.ts`** og **`reactive-compliance.ts`** forbliver i Protected Files-listen. PR'er der rører dem skal indeholde `Rører beskyttet fil — kræver review`.

---

## 12. Implementeringsfaser

Fire faser der hver kan deployes uafhængigt:

**Fase 1 — Domænefundament** (ingen brugersynlig ændring)

- Nye typer og schemas (afsnit 3.1–3.3)
- Migration (afsnit 3.4)
- `computeDrawingCompleteness` (afsnit 6)
- `computeRygningsKote`, `validateNaturbeskyttelse`, `validateKælderFeasibility`, `validateJordvarmePermit` (afsnit 7)
- `reactive-compliance.ts`-integration (afsnit 8)
- `DrawingModel`-udvidelse (afsnit 9.8)
- Tier 1-tests for alle nye rene funktioner

**Fase 2 — Data-adapters**

- `DrawingGeometrySourcePort` opdateret (afsnit 4)
- Fem nye adapter-implementeringer (afsnit 5)
- `handleFetchSiteGeometry` service + `api.site-geometry.ts`
- Cache-integration i `address_source_results`
- `api.drawing-readiness.ts`

**Fase 3 — SVG-renderer**

- Ny lag-arkitektur i `src/services/drawing/layers/`
- Implementering af alle lag (vej, natur, LER, placeholders, vandmærke)
- Udvidet tegningsblok
- Integration med udvidet `DrawingModel`

**Fase 4 — UI**

- Maskinrummet: de fire inputgrupper + reactive-compliance live-visning
- Project-store udvidelse
- `MatrikelMap` readonly-prop + planLayers
- Myndighed-UI omskrives til dokumentpanel
- Navigation bridges (NaesteStepSection, VerificationPanel)
- `api.drawing.ts` schema-udvidelse

---

## 13. Teststrategi

**Tier 1 (rene funktioner — ingen netværk, ingen DB):**

- `computeDrawingCompleteness`: komplet plan → ready; fodprint null → blocking
- `computeDrawingCompleteness`: `tinglysteServitutter` altid i `permanentWarnings`
- `computeRygningsKote`: sadeltag 35° 9m bred → verificeret mod håndberegning
- `validateNaturbeskyttelse`: tom liste → []; strandbeskyttelse intersection → blocking med §15
- `validateKælderFeasibility`: ingen kælder → []; under grundvand → Hard Stop; under kloakestim. → warning
- `validateJordvarmePermit`: ingen jordvarme → []; jordvarme → to info-reasons
- Regnvandsløsning-estimat: tagflade 100 m² → ca. 8 m³ faskine

**Tier 2 (service-tests med injected fakes):**

- `assembleBeliggenhedsplan`: parcel null → BLOCKED_MISSING_CORE_DATA
- `assembleBeliggenhedsplan`: naturbeskyttelse intersection → blocking reason i output
- `handleFetchSiteGeometry`: alle 5 adapters fejler → 5 null-rækker i cache

**Tier 3 (Playwright — eksisterende smoke-tests bibeholdes):**

- Ingen nye E2E-tests i denne fase
