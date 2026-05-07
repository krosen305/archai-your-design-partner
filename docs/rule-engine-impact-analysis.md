# Regelmotor-v1: Konsekvensanalyse

> **ARCH-106** — Blocker for ARCH-107, ARCH-108, ARCH-109, ARCH-110.
> Ingen produktionskode er skrevet her — kun analyse og konkrete anbefalinger.

---

## 1. Input-mapping: regelmotor-v1 felter vs. eksisterende datakilder

| Regelmotor-v1 felt | Eksisterende kilde | TypeScript-sti | Status | Handling i ARCH-107 |
|---|---|---|---|---|
| `plot.area_m2` | `BbrKompliantData.grundareal` | `ComplianceResult.bbr.grundareal` | ✅ MATCH | Direkte mapping |
| `plot.zone` | `Kommuneplanramme.fremtidigzonestatus` | `ComplianceResult.kommuneplanramme.fremtidigzonestatus` | ⚠️ PARTIAL | Streng → enum (byzone/landzone/sommerhusområde/ukendt) |
| `plot.has_localplan` | `ComplianceResult.lokalplaner.length > 0` | Afledt | ✅ MATCH | `input.plot.has_localplan = lokalplaner.length > 0` |
| `plot.kommuneplan_zone` | `Kommuneplanramme.anvgen` | `ComplianceResult.kommuneplanramme.anvgen` | ✅ MATCH | Numerisk anvendelseskode |
| `heritage.listed_building` | Ingen integration | — | ❌ MANGLER | Hardcode `null` + `missing_inputs`-markering |
| `heritage.save_value` | Ingen integration (DkJord dækker ikke SAVE) | — | ❌ MANGLER | Hardcode `null` + `missing_inputs`-markering |
| `heritage.protection_lines.strandbeskyttelse` | `NaturbeskyttelsesResultat.strandbeskyttelse` | `ComplianceResult.naturbeskyttelse.strandbeskyttelse` | ⚠️ PARTIAL | Data eksisterer, men IS_MOCK=true (ARCH-65 ikke done) |
| `heritage.protection_lines.skovbyggelinje` | `NaturbeskyttelsesResultat.skovbyggelinje` | `ComplianceResult.naturbeskyttelse.skovbyggelinje` | ⚠️ PARTIAL | Se ovenfor |
| `heritage.protection_lines.aabeskyttelse` | `NaturbeskyttelsesResultat.aabeskyttelse` | `ComplianceResult.naturbeskyttelse.aabeskyttelse` | ⚠️ PARTIAL | Se ovenfor |
| `heritage.protection_lines.soebeskyttelse` | `NaturbeskyttelsesResultat.soebeskyttelse` | `ComplianceResult.naturbeskyttelse.soebeskyttelse` | ⚠️ PARTIAL | Se ovenfor |
| `localplan.max_building_percent` | `LokalplanExtract.maxBebyggelsespct` | `ComplianceResult.lokalplanExtract.maxBebyggelsespct` | ✅ MATCH | Direkte mapping (live PDF-extractor) |
| `localplan.max_floors` | `LokalplanExtract.maxEtager` | `ComplianceResult.lokalplanExtract.maxEtager` | ✅ MATCH | Direkte mapping |
| `localplan.max_height_m` | **Ikke i LokalplanExtract** — kun i Kommuneplanramme | `komplianceResult.kommuneplanramme.maxbygnhjd` | ⚠️ GAP | Tilføj `maxHoejdeM: number \| null` til `LokalplanExtract` **eller** brug `kommuneplanramme.maxbygnhjd` som fallback |
| `localplan.min_setback_m` | `LokalplanExtract.byggelinjer` (fritekst) | `ComplianceResult.lokalplanExtract.byggelinjer` | ⚠️ PARTIAL | Fritekst ("2,5 m fra vejskel") — kræver regex-parsing i assembler |
| `localplan.allowed_roof_types` | `LokalplanExtract.tagform` (fritekst) | `ComplianceResult.lokalplanExtract.tagform` | ⚠️ PARTIAL | Fritekst ("Sadeltag 25-45°") — parse til streng-array i assembler |
| `localplan.allowed_materials` | `LokalplanExtract.materialer` | `ComplianceResult.lokalplanExtract.materialer` | ✅ MATCH | String-array, direkte |
| `localplan.special_conditions` | `LokalplanExtract.specialBestemmelser` | `ComplianceResult.lokalplanExtract.specialBestemmelser` | ✅ MATCH | String-array, sendes til AI-laget |
| `existing_building.footprint_m2` | `BbrKompliantData.bebygget_areal` | `ComplianceResult.bbr.bebygget_areal` | ✅ MATCH | Direkte |
| `existing_building.floor_area_m2` | `BbrKompliantData.samlet_areal` | `ComplianceResult.bbr.samlet_areal` | ✅ MATCH | Direkte |
| `existing_building.floors` | `BbrKompliantData.antal_etager` | `ComplianceResult.bbr.antal_etager` | ✅ MATCH | Direkte |
| `existing_building.year_built` | `BbrKompliantData.byggeaar` | `ComplianceResult.bbr.byggeaar` | ✅ MATCH | String → number (parseInt) |
| `existing_building.height_m` | **Ikke i BBR** | — | ❌ MANGLER | Estimér som `antal_etager × 3.0` m (heuristik) + `missing_inputs`-markering |
| `existing_building.use_code` | `BbrKompliantData.anvendelseskode` | `ComplianceResult.bbr.anvendelseskode` | ✅ MATCH | Direkte |
| `new_building.floor_area_m2` | `Byggeoenske.oensketAreal` | Store state | ✅ MATCH | `number`, direkte |
| `new_building.floors` | `Byggeoenske.antalEtager` | Store state | ✅ MATCH | `1 \| 1.5 \| 2 \| 3` → `Math.ceil()` til heltal |
| `new_building.footprint_m2` | **Ikke i Byggeoenske** | — | ❌ MANGLER | Estimer som `oensketAreal / antalEtager` i assembler |
| `new_building.height_m` | **Ikke i Byggeoenske** | — | ❌ MANGLER | Estimer som `antalEtager × 3.0` m. Tilføj evt. `oensketHoejdeM?: number` til `Byggeoenske` på sigt |
| `new_building.roof_type` | `Byggeoenske.tagform` | Store state | ✅ MATCH | Enum-værdier mapper 1:1 |
| `new_building.facade_material` | `Byggeoenske.facademateriale` | Store state | ✅ MATCH | Enum-værdier mapper 1:1 |
| `new_building.build_type` | `Byggeoenske.byggetype` | Store state | ✅ MATCH | `"nybyg" \| "tilbyg" \| "ombyg"` |
| `energy.energy_frame_compliant` | **Ingen automatisk kilde** | — | ❌ MANGLER | Brugerinput eller ingeniørgodkendelse. Tilføj som `missing_inputs`. |
| `energy.heating_source` | `Byggeoenske.varmekilde` | Store state | ✅ MATCH | Enum-værdier mapper 1:1 |
| `energy.energy_class_target` | `Byggeoenske.energiklasse` | Store state | ✅ MATCH | Enum-værdier mapper 1:1 |
| `fire.building_class` | **Ingen integration** | — | ❌ MANGLER | Kræver brandingeniør. `missing_inputs` |
| `fire.escape_routes_ok` | **Ingen integration** | — | ❌ MANGLER | Kræver brandingeniør. `missing_inputs` |
| `servitut.kritiske` | `TinglysningResult.servitutter` (filtered) | `ComplianceResult.servitutter.servitutter` | ✅ MATCH | Filtrer på `kritisk === true` |
| `terrain.slope_pct` | `TerrainData.slopePercent` | `ComplianceResult.terrain.slopePercent` | ✅ MATCH | Direkte (IS_MOCK=true) |
| `radon.risk_level` | `GeusRiskData.radonRisk` | `ComplianceResult.geusRisk.radonRisk` | ✅ MATCH | Direkte (IS_MOCK=true) |

### Opsummering input-status

| Kategori | Antal felter | Match | Partial | Mangler |
|---|---|---|---|---|
| Plot | 4 | 3 | 1 | 0 |
| Heritage | 6 | 0 | 4 | 2 |
| Lokalplan | 7 | 4 | 3 | 0 |
| Eksisterende bygning | 6 | 5 | 0 | 1 |
| Ny bygning | 7 | 5 | 0 | 2 |
| Energi | 3 | 2 | 0 | 1 |
| Brand | 2 | 0 | 0 | 2 |
| Servitut/Terrain/Radon | 3 | 3 | 0 | 0 |
| **Total** | **38** | **22 (58%)** | **8 (21%)** | **8 (21%)** |

---

## 2. Output-model: extend vs. replace vs. wrap

### Eksisterende output-struktur

```typescript
// ComplianceResult (analysis-orchestrator.ts)
{ bbr, lokalplaner, kommuneplanramme, lokalplanExtract,
  naturbeskyttelse, dkjord, geusRisk, servitutter, terrain }

// ComplianceFlag[] (project-store.ts)
{ id, label, status: "ok"|"advarsel"|"blocker",
  detalje, aktuelVærdi, tilladt,
  kilde: "bbr"|"plandata"|"servitut"|"beregnet"|"sdfi"|"dkjord"|"geus" }

// ComplianceMetrics (compliance-engine.ts)
{ grundareal, currentBygningsareal, maxBygningsareal,
  remainingBygningsareal, currentBebyggelsesprocent,
  maxBebyggelsesprocent, currentEtager, maxEtager,
  maxBygningshoejde, erCompliant }
```

### Foreslået regelmotor-output

```typescript
{ status: "OK"|"INCOMPLETE"|"REQUIRES_DISPENSATION"|"ILLEGAL",
  checked_rules: Rule[],
  missing_inputs: string[],
  dispensation_list: { rule, authority, reason }[] }
```

### Mapping og gap-analyse

| Regelmotor-felt | Eksisterende ækvivalent | Gap |
|---|---|---|
| `status: OK` | Ingen `ComplianceFlag` med `status: "blocker"` | Afledt — ingen direkte ækvivalent |
| `status: INCOMPLETE` | `ComplianceFlag` med `status: "advarsel"` og `detalje: "Ingen data"` | Svarer til INCOMPLETE-tilstand |
| `status: REQUIRES_DISPENSATION` | `ComplianceFlag` med `status: "blocker"` | Blocker = kræver dispensation eller er ulovlig — mangler skelnen |
| `status: ILLEGAL` | `ComplianceFlag` med `status: "blocker"` | **MANGLER skelnen** — ingen markering af om dispensation er mulig |
| `checked_rules` | `ComplianceFlag[]` | Næsten 1:1 — `ComplianceFlag` er den eksisterende "checked rule" |
| `missing_inputs` | **Intet ækvivalent** | **Ny nødvendig:** liste af felter der mangler til fuld beregning |
| `dispensation_list[].rule` | `ComplianceFlag.id + label` | Mappes fra flags med `status: "blocker"` |
| `dispensation_list[].authority` | **Intet ækvivalent** | Ny: "kommunen" / "Naturstyrelsen" / "Slots- og Kulturstyrelsen" |
| `dispensation_list[].reason` | `ComplianceFlag.detalje` | Delvist — detalje er fritekst |

### Anbefaling: **EXTEND** (ikke replace)

**Udvid `ComplianceFlag` med to nye felter:**

```typescript
export type ComplianceFlag = {
  id: string;
  label: string;
  status: "ok" | "advarsel" | "blocker";
  detalje: string | null;
  aktuelVærdi: string | null;
  tilladt: string | null;
  kilde: "bbr" | "plandata" | "servitut" | "beregnet" | "sdfi" | "dkjord" | "geus" | "regelkerne"; // ny kilde
  dispensationMulig?: boolean;   // NY: kan der søges dispensation?
  dispensationMyndighed?: string; // NY: hvilken myndighed
};
```

**Tilføj `RuleEngineResult` til `ComplianceResult`:**

```typescript
export type ComplianceResult = {
  // ... eksisterende felter ...
  ruleEngine: RuleEngineResult | null; // NY
};

export type RuleEngineResult = {
  overordnetStatus: "ok" | "incomplete" | "kræver_dispensation" | "ulovligt";
  checkedRules: number;
  missingInputs: string[];   // felter der mangler — vises i UI
  generatedFlags: ComplianceFlag[]; // flags fra regelkerne, merges med eksisterende flags
};
```

Eksisterende `ComplianceFlag[]` i storen **suppleres** med `generatedFlags` fra regelkernen. `deriveComplianceFlags()` i `project-store.ts` kan udvides til at acceptere `RuleEngineResult` og merge.

---

## 3. Pipeline-placering

### Nuværende pipeline (forenklet)

```
projekt.byggeanalyse.tsx
  └── fetchCompliance() [createServerFn]
        └── analyseAddress() [analysis-orchestrator.ts]
              ├── Layer 1: BBR + Plandata (cached)
              ├── Layer 2: Lokalplan PDF (cached)
              ├── Layer 3: Servitutter (IS_MOCK=true)
              └── Layer 4: Naturbeskyttelse + DkJord + GEUS + Terrain (parallelt)
  └── runByggeanalyse() [createServerFn] — AI-analyse af byggeønsker vs. lokalplan
```

### Anbefalet placering: **Ny Layer 5 i orchestrator**

```
analyseAddress()
  ├── Layer 1-4: (eksisterende)
  └── Layer 5: Regelkerne [NY]
        └── src/lib/rule-engine/engine.ts
              ├── assembleInput(complianceBase, lokalplanExtract, byggeoenske?)
              └── runRuleEngine(input) → RuleEngineResult
```

**Begrundelse:**
1. Regelkernen afhænger af Layer 1-4's output (BBR, lokalplan, naturbeskyttelse) — den skal køre efter disse.
2. `runByggeanalyse` (AI-analyse af byggeønsker) er optionel og afhænger af `Byggeoenske` fra klienten, ikke serveren. Regelkernen derimod kan køres serverside.
3. Regelkernens output (`RuleEngineResult`) caches sammen med resten af `ComplianceResult` i Supabase — én cache-nøgle for hele analysen.
4. AI-analysen (`runByggeanalyse`) kan evt. konsumere regelkernens output som kontekst, men det er ikke nødvendigt i v1.

**Undtagelse:** `new_building.*`-felter kommer fra `Byggeoenske` som er klientstate. Orchestratoren har ikke adgang til dette. To løsninger:
- **Option A (anbefalet):** Assembler kører med `new_building = null` serverside → regelkerne markerer `new_building.*` som `missing_inputs`. Route-laget kan efterfølgende kalde `runRuleEngine` med `new_building` udfyldt fra `Byggeoenske`.
- **Option B:** Send `Byggeoenske` som ekstra input til `analyseAddress()` — breder orchestrator-kontrakten.

**Anbefaling: Option A.** Regelkernen kører to gange:
1. Serverside (orchestrator Layer 5): eksisterende bygning + plot + lokalplan/heritage
2. Klientsside-trigger (route): efter `Byggeoenske` kendes — kalder `runRuleEngine` med fuldt input

I praksis implementerer ARCH-109 kun serverside-varianten til at starte med.

---

## 4. `Byggeoenske` → `new_building` mapping

| `new_building` felt | `Byggeoenske` felt | Transform | Note |
|---|---|---|---|
| `floor_area_m2` | `oensketAreal?: number` | Direkte (number) | Brugerangivet i m² |
| `floors` | `antalEtager?: 1 \| 1.5 \| 2 \| 3` | `Math.ceil(antalEtager)` | 1.5 etager → 2 for regelvalidering |
| `footprint_m2` | Ikke i type | `Math.round(oensketAreal / Math.ceil(antalEtager))` | Heuristisk — ufuldstændig |
| `height_m` | Ikke i type | `Math.ceil(antalEtager) * 3.0` | Heuristik: 3m pr etage, ufuldstændig |
| `roof_type` | `tagform?: "fladt"\|"saddeltag"\|"valm"\|"ensidig"` | 1:1 string-mapping | Direkte |
| `facade_material` | `facademateriale?: "tegl"\|"trae"\|"puds"\|"metal"\|"kombineret"` | 1:1 string-mapping | Direkte |
| `build_type` | `byggetype?: "nybyg"\|"tilbyg"\|"ombyg"` | 1:1 string-mapping | Direkte |
| `energy_class` | `energiklasse?: "BR18"\|"lavenergi"\|"passiv"\|"plusenergi"` | 1:1 string-mapping | Direkte |
| `heating_source` | `varmekilde?: "varmepumpe"\|"fjernvarme"\|"jordvarme"\|"solvarme"` | 1:1 string-mapping | Direkte |

**Konklusion:** 7 af 9 `new_building`-felter kan mappes fra `Byggeoenske`. De 2 manglende (`footprint_m2`, `height_m`) skal estimeres via heuristik — regelkerne skal tolerere disse som skøn og markere dem som `estimated: true`.

---

## 5. Felter der ikke kan hentes automatisk (kræver brugerinput)

Disse felter skal eksponeres som brugerinput i UI — regelkernen markerer dem som `missing_inputs` og springer tilhørende regler over:

| Felt | Begrundelse | UI-handling |
|---|---|---|
| `new_building.height_m` | Afhænger af etageplan og loftshøjde | Valgfrit inputfelt i Byggeoenske-wizard |
| `new_building.footprint_m2` | Afhænger af planform | Valgfrit inputfelt i Byggeoenske-wizard |
| `energy.energy_frame_compliant` | Kræver ingeniørberegning | Projekt-readiness tracker (datacheck) |
| `fire.building_class` | Kræver brandingeniørvurdering | Projekt-readiness tracker (datacheck) |
| `fire.escape_routes_ok` | Kræver brandingeniørvurdering | Projekt-readiness tracker (datacheck) |
| `heritage.listed_building` | Kræver opslag i fredningsdatabasen | Se ARCH-89 — ikke implementeret |
| `heritage.save_value` | Kræver SAVE-register-opslag | Ny integration nødvendig |

---

## 6. Nye integrationer der blokerer fuld regelkerne (non-blockers for v1)

Disse er **ikke** blockers for regelkerne-v1 (som kan køre med `missing_inputs`), men er forudsætninger for 100% dækning:

| Integration | Regelmotor-felt | Issue-ref | Status |
|---|---|---|---|
| Naturbeskyttelse live (DAI WFS) | `heritage.protection_lines.*` | ARCH-65 | IS_MOCK=true — blocker for live beskyttelseslinje-regler |
| SAVE-register | `heritage.save_value` | Ingen issue | Ny integration — Slots- og Kulturstyrelsen API? |
| Fredningsregister | `heritage.listed_building` | ARCH-89 | Status ukendt — var del af ejendomsindikatorer |
| LokalplanExtract: max_height | `localplan.max_height_m` | ARCH-108 | Tilføj felt til LokalplanExtract-type + PDF-extractor prompt |

---

## 7. Fil- og mappestruktur (anbefaling til ARCH-107)

```
src/lib/rule-engine/
  types.ts          # RuleEngineInput, RuleEngineResult, Rule, DispensationItem
  assembler.ts      # assembleInput(ComplianceResult, Byggeoenske?) → RuleEngineInput
  engine.ts         # runRuleEngine(input) → RuleEngineResult (pure functions)
  rules/
    bebyggelse.ts   # Bebyggelsesprocent, bygningsareal, etager
    setback.ts      # Afstandskrav til skel og vej
    protection.ts   # Naturbeskyttelseslinjer, strandbeskyttelse osv.
    servitut.ts     # Kritiske servitut-regler
    heritage.ts     # Fredning og SAVE-regler
```

Alle filer i `rules/` eksporterer `Rule[]`-arrays. `engine.ts` itererer over alle regler mod input.

---

## 8. Prioriteret handling for ARCH-107

1. **Definer `RuleEngineInput`-type** med alle felter fra mapping-tabel, inkl. `null`-values for manglende felter og `estimated: boolean`-flag på heuristiske værdier.
2. **Tilføj `maxHoejdeM` til `LokalplanExtract`** — enkelt felt, nødvendigt for højde-regler.
3. **Skriv `assembleInput()`** — transformer `ComplianceResult` + `Byggeoenske` → `RuleEngineInput`. Ikke regellogik, kun data-transformation.
4. **Følg Option A** for `new_building`-felter: assembler kører serverside med `new_building = null`, returnerer `missing_inputs = ["new_building.*"]`.
5. **Udvid `ComplianceFlag.kilde`** med `"regelkerne"` og tilføj `dispensationMulig?: boolean` og `dispensationMyndighed?: string`.

Ingen breaking changes til eksisterende `ComplianceResult`-type eller `deriveComplianceFlags()` — alt tilføjes som nye valgfri felter.
