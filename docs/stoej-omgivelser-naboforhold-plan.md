# Plan: Støj, Omgivelser Og Naboforhold

Dato: 2026-05-25  
Rolle: forretnings- og IT-analyse  
Område: due diligence for støj, nabogeometri, omgivelser, konfliktrisiko og myndighedsnære naboforhold.

## 1. Formål

ArchAI skal kunne advare en privat bygherre eller køber om forhold, der kan gøre
en ellers attraktiv parcel dyrere, langsommere eller mere usikker:

- støj fra vej, bane, luftfart og større virksomheder
- planlagte støj-, lugt- og konsekvensområder
- nabobygninger, skelafstande, vejskel og tæthed
- naboorientering, partshøring og sandsynlige indsigelsesrisici
- omgivelser som tekniske anlæg, produktionsvirksomheder, landbrug, større veje,
  landskabskiler og grønne arealer

Området hører primært hjemme i `Matriklen`, men påvirker også `Maskinrummet`
og `Myndighed`:

- `Matriklen`: adresse- og parcelbaseret screening.
- `Maskinrummet`: placering, bygningsvolumen, varmepumpe, opholdsarealer og
  støjfølsomme disponeringer.
- `Myndighed`: dokumentationsbehov, naboorientering, partshøring,
  rådgiverbriefs og høringspakker.

Planen er skrevet, så den ikke strider mod `CLAUDE.md` eller `AGENTS.md`:

- ingen DAWA/Dataforsyningen REST som compliancekilde
- ingen direkte Supabase-, Datafordeler-, AI- eller registerkald i UI
- alle nye boundary-data skal valideres med Zod eller eksplicit decoder
- compliance- og risikotærskler skal ligge i domain/rule engine, ikke UI
- kritiske sammenfatninger skal gemmes i typed columns, rå kildeudtræk i
  `address_source_results`
- server functions skal være tynde inbound adapters
- AI må forklare og opsummere, men ikke opfinde compliance truth

## 2. Nuværende Status I Repoet

Eksisterende fundament:

- DAR, BBR, MAT, EBR/VUR, Plandata, FBB, fjernvarme og flere miljøkilder er
  allerede integreret helt eller delvist.
- `MatGeometryService` henter parcelgeometri via MAT WFS.
- `GeoDanmarkNaboService` findes i `src/integrations/geodanmark/client.ts`, men
  er `IS_MOCK=true`.
- `NaboService` i `src/integrations/bbr/neighbor-client.ts` er deaktiveret og
  returnerer tomt resultat, fordi DAWA er forbudt.
- `ArealdataService` findes, men endpoint/layer-verifikation er fortsat
  uafklaret for flere lag.
- `PlandataService.getPlanContextForParcel` findes for zone, byggefelt og
  spildevandskontekst.
- `site_constraints` har typed columns for plan, SAVE/fredning, MAT hard stops,
  jordforurening, terræn/grundvand, Arealdata-udvidelser, bredbånd og
  energimærke.
- Der findes ingen typed noise/surroundings columns endnu.
- `naboer` gemmes som projektdata/JSON-kontekst, men ikke som typed
  compliance-/screening-sammenfatning.

Konsekvens:

ArchAI kan i dag vise lidt nabokontekst i UI, men ikke lave en robust,
DAWA-fri, myndighedsnær naboscreening. ArchAI kan heller ikke screene støj eller
planlagte støj-/lugt-/konsekvensområder på en måde, der er stærk nok til
pre-purchase due diligence.

## 3. Vigtige Forretningsregler

### 3.1 Støj Er Screening, Ikke Automatisk Afslag

Miljøstyrelsens støjkort og vejledende grænseværdier skal bruges til at
identificere risiko og dokumentationsbehov. De må ikke alene bruges til at
konkludere, at et projekt er myndighedsgodkendt eller umuligt.

Første version skal derfor klassificere støj som:

- `ok`: ingen kendt støjrisiko i verificeret dækningsområde
- `warning`: vejledende grænse eller planlagt konsekvensområde er relevant
- `review_required`: akustiker/kommune/rådgiver bør vurdere forholdet
- `unknown`: kilden dækker ikke området, endpoint fejlede, eller datalag mangler

`unknown` må aldrig vises som "ingen støj".

### 3.2 Naboforhold Er Både Geometri Og Myndighedsskøn

Naboforhold består af flere ting:

- fysisk afstand til skel, nabo- og vejbygninger
- eksisterende nabobebyggelses tæthed og orientering
- projektets placering, højde, indblik, terræn og skygge
- lokalplan-/BR18-afvigelser
- sandsynlighed for naboorientering eller partshøring
- kommunens konkrete vurdering

ArchAI må gerne beregne og foreslå, men kommunen ejer myndighedsskønnet.

### 3.3 Ejer- Og Høringsparter Er Følsomme

En automatisk liste over høringsparter kan involvere persondata. Før ArchAI
integrerer Ejerfortegnelsen/EJF eller andre ejerdata, skal der laves juridisk og
arkitektonisk review.

Første version bør derfor:

- identificere nabomatrikler og berørte arealer
- generere en manuel "høringspart-kandidat"-liste uden personnavne
- lade kommune/ejer/rådgiver validere endelige parter
- gemme høringsstatus som procesdata, ikke som register-sandhed

## 4. Manglende Integrationer

### 4.1 Miljøstyrelsens Støj-Danmarkskort / MiljøGIS

Status i ArchAI: mangler.

Formål:

- screene vejstøj, togstøj, flystøj og udvalgt virksomhedsstøj
- vise om grunden ligger i eller tæt på støjbelastet område
- markere om data faktisk dækker adressen
- give pre-purchase advarsel før køb, nedrivning eller design

Officiel kilde:

- Miljøstyrelsens støjkortlægning
- MiljøGIS/støjkortlag, hvis datalag kan tilgås via WMS/WFS/anden offentlig
  service

Kendte officielle forhold, der skal modelleres:

- De vejledende grænseværdier for boligområder er Lden 58 dB for vejstøj, Lden
  64 dB for togstøj og Lden 55 dB for flystøj.
- Ikke alle veje, jernbaner, lufthavne eller flyvepladser er omfattet af den
  obligatoriske støjkortlægning.
- Kortlægningen gentages i 5-års intervaller.
- For 2022 og frem skelnes der mellem Lden/Lnight ved 1,5 m og 4 m samt DK/EU
  beregningsmodel.

Implementering:

- Opret adapter: `src/integrations/stoej/mst-noise.ts`.
- Opret schemas: `src/integrations/stoej/mst-noise.schemas.ts`.
- Opret domain contract: `src/domain/contracts/noise.types.ts`.
- Første opgave er en `GetCapabilities`/metadata-verifikation:
  - identificer lag for vej, bane, luft og virksomhed
  - identificer årgang, model, højde og måleenhed
  - afgør om vi kan hente vektor/rasterværdier eller kun billedlag
- Hvis kilden kun kan levere WMS-billeder, må ArchAI ikke udlede præcise dB-tal
  fra billedfarver. I så fald gemmes kun `coverageStatus` og en
  `manual_review_required`-markering.
- Hvis kilden kan levere WFS/feature/raster-sampling, skal adapteren returnere
  struktureret `NoiseScreeningResult`.

Foreslået domain type:

```ts
export type NoiseSourceKind = "road" | "rail" | "air" | "industry";

export type NoiseMetric = {
  source: NoiseSourceKind;
  ldenDb: number | null;
  lnightDb: number | null;
  heightM: 1.5 | 4 | null;
  model: "DK_NORD2000" | "EU_CNOSSOS" | "unknown";
  year: number | null;
  coverage: "covered" | "outside_mapped_area" | "source_unavailable" | "unknown";
};

export type NoiseScreeningResult = {
  addressId: string;
  parcelIntersectionUsed: boolean;
  metrics: NoiseMetric[];
  highestRisk: "ok" | "warning" | "review_required" | "unknown";
  requiresAcousticReview: boolean | null;
  sourceUrl: string;
  fetchedAt: string;
};
```

Persistence:

- Rå `SourceResult<NoiseScreeningResult>` gemmes i `address_source_results` med
  `source_kind = "mst_noise"`.
- Typed summary columns bør tilføjes til `site_constraints`:
  - `noise_road_lden_db`
  - `noise_road_lnight_db`
  - `noise_rail_lden_db`
  - `noise_rail_lnight_db`
  - `noise_air_lden_db`
  - `noise_air_lnight_db`
  - `noise_industry_lden_db`
  - `noise_coverage_status`
  - `noise_model_year`
  - `noise_acoustic_review_required`

Rule engine:

- Tilføj `src/lib/rule-engine/rules/noise-rules.ts`.
- Tærskler må kun ligge i rule engine/domain, ikke UI.
- Første version skal lave warnings/review flags, ikke absolute Hard Stops.
- Regler skal være source-aware:
  - overstiger vejledende grænseværdi -> `warning` eller `review_required`
  - `coverage = outside_mapped_area` -> `unknown`, ikke `ok`
  - virksomhedsstøj uden entydig grænse -> `review_required`

UI:

- UI må kun læse analyseret state via `useProject()` eller fokuserede hooks.
- UI skal vise dækningsusikkerhed tydeligt.
- Ingen UI-hardkodede dB-grænser.

Prioritet: P1/P2. Støj er vigtig pre-purchase, men bør komme efter DAWA-fri
nabogeometri.

### 4.2 Vejdirektoratet / Mastra Trafikstøjdata

Status i ArchAI: mangler.

Formål:

- supplere støjkortlægningen med trafikdata, især hvor støjkort ikke dækker
  mindre veje
- give tidlig indikation af tung trafik, ÅDT og potentiel støjbelastning
- støtte rådgiverbrief til egentlig støjberegning

Officiel/åben kilde:

- Vejdirektoratets `Trafikstøj`/Mastra-datasæt på opendata.dk og VD geoserver

Vigtigt:

- Mastra-data er ikke i sig selv en støjberegning.
- Data kan være egnet som input til støjmodel, men ArchAI må ikke præsentere det
  som færdigt støjniveau.
- Datasættet har begrænsning på antal poster og kræver geografisk/CQL-filter.

Implementering:

- Opret adapter: `src/integrations/vejdata/mastra-noise-input.ts`.
- Hent vejsegmenter inden for buffer, fx 100 m, 250 m og 500 m fra parcel.
- Valider GeoJSON/CSV med Zod.
- Returner kun trafik- og datakvalitetsfelter:
  - nærmeste vejsegment
  - afstand til segment
  - ÅDT hvis tilgængelig
  - tung trafik-andel hvis tilgængelig
  - tælleår/datakilde
  - `noiseCalculationPossible`

Persistence:

- Rå resultater gemmes i `address_source_results` som
  `source_kind = "vejdata_mastra_noise_input"`.
- Typed columns er kun nødvendige, hvis data bruges i risk overview:
  - `traffic_nearest_counted_road_m`
  - `traffic_aadt_nearest`
  - `traffic_heavy_share_pct`
  - `traffic_count_year`

Rule engine:

- Ingen dB-thresholds fra Mastra alene.
- Høj ÅDT eller tung trafik tæt på grunden kan give
  `noise_acoustic_review_required = true`.

Prioritet: P2. Bruges som fallback og rådgiverinput, ikke compliancekilde.

### 4.3 GeoDanmark Vektor WFS For Nabobygninger, Veje Og Omgivelser

Status i ArchAI: service findes, men `IS_MOCK=true`.

Formål:

- erstatte DAWA-baseret naboopslag
- hente nabobygninger og vejmidter via Datafordeler/GeoDanmark
- beregne afstande til nabobygninger, vejmidte og mulig vejskel
- identificere tæt nabobebyggelse, vejadgang og omgivelser

Officiel kilde:

- Datafordeler GeoDanmark Vektor WFS
- GeoDanmark Vektor WFS entiteter

Kritisk repo-observation:

`src/integrations/geodanmark/client.ts` bruger aktuelt en mock og en endpoint-
kommentar, der skal verificeres. Officiel Datafordeler-dokumentation viser både
legacy GeoDanmark Vektor WFS og entitetsbaseret WFS. Legacy-tjenesten er markeret
som under udfasning i 2026, så ny implementering bør afklare og helst bruge den
fremadrettede entitetsbaserede WFS, hvis den leverer de nødvendige lag.

Manglende datapunkter:

- live typenames for bygning og vejmidte
- geometri-decoder for GeoJSON/GML
- spatial filtrering mod egen MAT-polygon
- afstandsberegning i EPSG:25832
- bygningspolygoner i stedet for tomme nabo-lister
- vejmidteafstand og adgangsvej-kontekst
- confidence/kildekvalitet

Implementering:

- Opdater eller erstat `GeoDanmarkNaboService` efter arkitektur-review.
- Hold adapteren server-side only.
- Brug `DATAFORDELER_API_KEY` via `src/lib/env.ts`.
- Brug MAT parcelpolygon som primær geometri.
- Brug adresse-bbox kun som fallback.
- Ekskluder egne bygninger via spatial intersection med egen parcel, ikke via
  usikre property-navne.
- Beregn:
  - `neighborBuildingCount40m`
  - `nearestNeighborBuildingDistanceM`
  - `nearestRoadCenterlineDistanceM`
  - `accessRoadNearby`
  - `buildingDensityWithin100m`
  - `neighborBuildings[]` med id, afstand, geometri-summary og kilde

Foreslået typeudvidelse:

```ts
export type NeighborBuilding = {
  sourceId: string;
  addressLabel: string | null;
  distanceM: number;
  footprintAreaM2: number | null;
  geometrySource: "geodanmark";
};

export type NeighborContext = {
  count40m: number;
  nearestDistanceM: number | null;
  nearestRoadCenterlineDistanceM: number | null;
  accessRoadNearby: boolean | null;
  buildingDensityWithin100m: number | null;
  buildings: NeighborBuilding[];
  coverage: "covered" | "source_unavailable" | "unknown";
};
```

Persistence:

- Rå resultater: `address_source_results`, `source_kind = "geodanmark_nabo"`.
- Typed summary columns bør tilføjes til `site_constraints`:
  - `neighbor_building_count_40m`
  - `neighbor_nearest_building_distance_m`
  - `road_nearest_centerline_distance_m`
  - `access_road_nearby`
  - `neighbor_context_confidence`

Rule engine:

- Flyt hårdkodede nabotærskler væk fra UI/helper-lag og ind i rule engine.
- `nearestDistanceM < requiredSetbackM` må kun være en warning/review, medmindre
  den sammenholdes med faktisk projekteret footprint og trusted parcelgeometri.
- Tæt nabobebyggelse skal kunne øge risiko for `partshoering_likely`, men ikke
  afgøre det alene.

Prioritet: P0. Dette er basis for DAWA-fri naboscreening og beliggenhedsplan.

### 4.4 MAT Nabomatrikler Og Berørte Skel

Status i ArchAI: delvist fundament via egen parcelgeometri, men nabomatrikler og
skelsegmenter mangler.

Formål:

- identificere tilstødende jordstykker
- klassificere skelsegmenter som naboskel, vejskel eller ukendt
- støtte naboorientering, beliggenhedsplan og afstandskontrol

Kilde:

- MAT WFS via Datafordeler
- egen parcelpolygon fra eksisterende `MatGeometryService`

Implementering:

- Opret `NeighborParcelService` i `src/integrations/mat/neighbor-parcels.ts`.
- Hent jordstykker i bbox omkring egen parcel.
- Valider WFS-output med explicit decoder.
- Beregn spatial adjacency:
  - deler skelsegment
  - ligger inden for tolerance, fx 0,25 m
  - berører kun hjørne
  - vejareal mellem parterne
- Returner matrikulær kontekst uden persondata.

Foreslået type:

```ts
export type NeighborParcel = {
  jordstykkeLokalId: string;
  matrikelnummer: string | null;
  ejerlavskode: number | null;
  relation: "shared_boundary" | "corner_touch" | "nearby" | "separated_by_road" | "unknown";
  sharedBoundaryLengthM: number | null;
  distanceM: number | null;
};
```

Persistence:

- Rå resultater i `address_source_results`, `source_kind = "mat_neighbor_parcels"`.
- Hvis bruges til myndighedsflow, bør en separat fremtidig tabel over
  høringskandidater overvejes. Første version kan nøjes med cache, fordi
  parterne skal valideres manuelt.

Prioritet: P0.

### 4.5 Ejerfortegnelsen / EJF For Høringsparter

Status i ArchAI: mangler og kræver review.

Formål:

- potentielt identificere ejere på berørte nabomatrikler
- støtte myndighedspakke ved dispensation eller partshøring

Kilde:

- Datafordeler Ejerfortegnelsen/EJF, hvis adgang, vilkår og dataminimering kan
  afklares.

Vigtig begrænsning:

Dette må ikke implementeres autonomt som almindelig registerintegration. Det kan
involvere persondata og myndighedsproces. Der skal laves human/architecture
review før teknisk implementering.

Første version uden EJF:

- Vis berørte nabomatrikler.
- Generer "høringspart-kandidater skal valideres af kommune/rådgiver".
- Lav manuel opgave i `building_tasks`, fx `naboorientering_party_review`.

Mulig senere implementering:

- Opret port: `NeighborPartyLookupPort`.
- Opret adapter: `src/integrations/datafordeler/ejf/neighbor-parties.ts`.
- Gem ikke unødvendige persondata i projektstate.
- Gem eventuelt kun reference, rolle og reviewstatus.

Prioritet: P2 efter juridisk review.

### 4.6 Plandata Kommuneplanretningslinjer For Støj, Lugt Og Konsekvensområder

Status i ArchAI: Plandata findes, men disse temaer er ikke systematisk udnyttet.

Formål:

- screene planlagte støjbelastede arealer
- finde konsekvensområder omkring produktionsvirksomheder og tekniske anlæg
- identificere lugtbelastede arealer, store husdyrbrug og transformationsområder
- give køber/bygherre et tidligt "kan blive politisk/myndighedsmæssigt svært"
  signal

Officiel kilde:

- Plandata WFS
- Plandata kodelister for digital kommuneplan

Relevante koder/temaer, der skal verificeres i implementation:

- `1109`: støjbelastede arealer
- `115201`: støj fra eksisterende produktionsvirksomheder
- `115202`: lugt fra eksisterende produktionsvirksomheder
- `110129` / `11012900`: lugtbelastede arealer
- `110130` / `11013000`: konsekvensområder for tekniske anlæg og støj i landzone
- `114200`: store husdyrbrug
- øvrige landskabs-, grøn kile-, fritids- og tekniske anlægstemaer efter
  kodeliste-verifikation

Implementering:

- Udvid Plandata-laget med `src/integrations/plandata/surroundings.ts`.
- Brug kun WFS-temaer anbefalet af Plandata, især `theme_pdk_*`.
- Hent både `vedtaget_v` og eventuelt `forslag_v` som separate statuser.
- Filtrer geografisk på parcelpolygon frem for kun adressepunkt.
- Returner tri-state pr. tema: `true`, `false`, `null`.
- Returner også kildeplan, status, planid, overskrift, tekstuddrag og geometri-
  overlap.

Foreslået type:

```ts
export type PlanningSurroundingsContext = {
  noiseDesignatedArea: boolean | null;
  productionNoiseConsequenceArea: boolean | null;
  odorConsequenceArea: boolean | null;
  odorDesignatedArea: boolean | null;
  technicalFacilityConsequenceArea: boolean | null;
  largeLivestockFarmArea: boolean | null;
  proposedPlanConflict: boolean | null;
  hits: PlanningSurroundingsHit[];
};
```

Persistence:

- Rå resultater i `address_source_results`, `source_kind = "plandata_surroundings"`.
- Typed columns bør tilføjes til `site_constraints`:
  - `planning_noise_area`
  - `planning_production_noise_consequence_area`
  - `planning_odor_area`
  - `planning_technical_facility_consequence_area`
  - `planning_large_livestock_area`
  - `planning_surroundings_review_required`

Rule engine:

- `planning_noise_area = true` -> warning/review.
- `planning_odor_area = true` -> warning/review.
- `productionNoiseConsequenceArea = true` -> review before purchase/design.
- `forslag_v` hits skal markeres som fremtidig planrisiko, ikke gældende krav.

Prioritet: P1.

### 4.7 Arealdata / DAI Udvidelse For Omgivelser

Status i ArchAI: delvist live, men endpoint/layer-verifikation mangler for flere
lag.

Formål:

- supplere Plandata med miljø- og arealanvendelseslag
- identificere omgivelser, der kan give konflikt, lugt, landskab eller
  miljøscreening

Kilde:

- Danmarks Miljøportal Arealdata, WMS/WFS/WMTS/filudtræk

Relevante udvidelser:

- miljøvurderinger/EA-Hub for større nærliggende projekter
- råstofområder og graveområder
- landbrugs-/natur-/beskyttelseslag, hvor de påvirker oplevelse og tilladelser
- potentielle konfliktlag, der ikke allerede er dækket af
  `arealdataContext`

Implementering:

- Udvid eksisterende `ArealdataService` eller opret fokuseret
  `ArealdataSurroundingsService`.
- Genbrug tri-state-kontrakt: `true`, `false`, `null`.
- Skeln mellem:
  - direkte overlap med parcel
  - nærliggende bufferhit
  - kun visuel kontekst
- Ingen "no hit = safe" ved endpointfejl.

Persistence:

- Brug `address_source_results`, `source_kind = "arealdata_surroundings"`.
- Flyt kun de felter, der bliver compliance-/riskkritiske, til typed columns.

Prioritet: P2, fordi Plandata og GeoDanmark giver mere direkte værdi først.

### 4.8 CVR / P-Enheder For Nærliggende Risikoaktiviteter

Status i ArchAI: mangler.

Formål:

- identificere nærliggende aktive produktionsenheder med brancher, der kan give
  støj, lugt, tung trafik eller miljøbekymring
- give due-diligence-indikation ved køb

Officiel kilde:

- CVR-data fra Erhvervsstyrelsen, især P-enheder med adresse og branchekode

Vigtige begrænsninger:

- CVR er ikke en støj- eller miljøgodkendelseskilde.
- Branchekode er kun indikator.
- Adressematch skal gøres forsigtigt mod DAR, og historiske/adresseafvigelser må
  give degraded state.
- Reklamebeskyttelse og persondataregler skal respekteres.

Implementering:

- Opret adapter bag feature flag:
  `src/integrations/cvr/production-units.ts`.
- Brug DAR-normaliseret adresse/geometri, ikke fritekst alene.
- Lav domain-owned branche-watchlist, fx i
  `src/domain/surroundings/risk-activity-codes.ts`.
- Watchlist skal reviewes fagligt og må ikke være AI-genereret.
- Returner kun aktive P-enheder inden for definerede buffere, fx 100 m, 250 m og
  500 m.

Persistence:

- Rå resultater i `address_source_results`, `source_kind = "cvr_nearby_units"`.
- Typed summary columns kun hvis feature bliver produktmoden:
  - `nearby_risk_activity_count_250m`
  - `nearest_risk_activity_distance_m`
  - `nearby_risk_activity_review_required`

Rule engine:

- CVR-hit giver kun warning/review, aldrig hard stop.

Prioritet: P3. Nyttig, men lavere autoritet end Plandata/støjkort.

### 4.9 Kommunale Støjkort, Byggesagsarkiver Og Lokale Særdata

Status i ArchAI: mangler.

Formål:

- håndtere kommunale datalag, PDF'er og arkiver, der ikke er landsdækkende
- give bruger en konkret manuel tjekliste, når national data er utilstrækkelig

Kilde:

- kommunale WFS/WMS/PDF-lag
- kommunale byggesagsarkiver
- kommunale støjhandlingsplaner
- brugerupload af rapporter eller afgørelser

Implementering:

- Første version skal være et kildekatalog og opgaveliste, ikke en automatisk
  national integration.
- Opret eventuelt `docs/municipal-source-catalog.md` eller database-seed senere.
- Brug dokumentupload + AI-ekstraktion kun som assistant:
  - schema-valideret resume
  - kildehenvisning
  - reviewstatus
  - ingen compliance truth uden evidence/rule

Prioritet: P2/P3.

### 4.10 Projektets Egen Støj Mod Naboer

Status i ArchAI: delvist omtalt via varmepumpe/energi-regler, men ikke som
selvstændig nabostøj-workflow.

Formål:

- advare om støj fra varmepumpe, ventilation, garageport, teknik, pooludstyr
  eller byggepladsdrift
- støtte placering og rådgiverbrief

Kilde:

- brugerens designvalg
- produktdata/uploadede datablad
- rådgiver-/akustikrapport
- BR18/Miljøstyrelsen-vejledninger som rule/evidence-katalog

Implementering:

- Opret domain helper for støjkildeplacering, ikke registerintegration.
- Integrer med design iteration, men kun efter server-side rule check.
- Brug uploadet datablad/rapport som evidence, schema-valideret.

Persistence:

- Ikke i `site_constraints` som registerdata.
- Bør høre til design iteration/evidence ledger, når dette modul findes.

Prioritet: P2 for `Maskinrummet`.

## 5. Foreslået Arkitektur

### 5.1 Dataflow

```txt
route/server function
  -> validate input
  -> withAuth()
  -> dynamic import surroundings-analysis service
  -> application service
  -> ports
  -> adapters: MST, GeoDanmark, MAT, Plandata, Arealdata, CVR
  -> Zod/decoder
  -> domain classifiers / rule engine
  -> repositories/cache
  -> typed site_constraints + address_source_results
  -> project state/view model
  -> UI display
```

### 5.2 Nye Filer

Foreslåede nye moduler:

- `src/domain/contracts/noise.types.ts`
- `src/domain/contracts/surroundings.types.ts`
- `src/domain/surroundings/noise-classifier.ts`
- `src/domain/surroundings/neighbor-classifier.ts`
- `src/domain/surroundings/risk-activity-codes.ts`
- `src/lib/rule-engine/rules/noise-rules.ts`
- `src/lib/rule-engine/rules/surroundings-rules.ts`
- `src/lib/surroundings-analysis.server.ts`
- `src/integrations/stoej/mst-noise.ts`
- `src/integrations/stoej/mst-noise.schemas.ts`
- `src/integrations/vejdata/mastra-noise-input.ts`
- `src/integrations/mat/neighbor-parcels.ts`
- `src/integrations/plandata/surroundings.ts`
- `src/integrations/arealdata/surroundings.ts`
- `src/integrations/cvr/production-units.ts`

Filer der kræver særlig forsigtighed:

- `src/lib/analysis-orchestrator.ts` er beskyttet. Hvis de nye services skal
  wires ind i adresseanalysen, skal ændringen kaldes ud til human review.
- `src/lib/project-store.ts` er beskyttet. Nye durable felter må kun tilføjes
  med tydelig review.
- `src/integrations/supabase/project-persistence.ts` er beskyttet.

Derfor bør første implementation være additive adapters, schemas, domain tests
og migrations. Wiring ind i beskyttede filer bør ske i et særskilt reviewet
ticket.

### 5.3 Application Service

Opret en service som ejer workflowet:

`src/lib/surroundings-analysis.server.ts`

Ansvar:

- modtage trusted address/project context
- hente eller genbruge MAT parcelpolygon
- kalde GeoDanmark, MAT-neighbor, Plandata surroundings, MST noise og eventuelle
  sekundære kilder
- samle en `SurroundingsAnalysisResult`
- køre domain classifiers/rule engine
- returnere tri-state og degraded states
- skrive raw source results via cache/repository
- levere typed patch til `site_constraints`

Den må ikke:

- skrive Supabase direkte uden repository
- indeholde UI-logik
- acceptere client-provided `hasNoiseRisk` eller `partshoeringLikely` som sandhed
- bruge AI som kilde til compliance

### 5.4 Ports

Brug ports, fordi kilderne er eksterne, ustabile og testkrævende:

```ts
export interface NoiseMapGateway {
  getNoiseForParcel(input: ParcelQuery): Promise<SourceResult<NoiseScreeningResult>>;
}

export interface NeighborGeometryGateway {
  getNeighborContext(input: ParcelQuery): Promise<SourceResult<NeighborContext>>;
}

export interface PlanningSurroundingsGateway {
  getPlanningSurroundings(input: ParcelQuery): Promise<SourceResult<PlanningSurroundingsContext>>;
}
```

Tests kan injicere fake gateways uden netværk eller Supabase.

## 6. Datamodel Og Persistence

### 6.1 Typed Columns

Følgende columns bør tilføjes til `site_constraints` i additive migration:

Noise:

- `noise_road_lden_db float`
- `noise_road_lnight_db float`
- `noise_rail_lden_db float`
- `noise_rail_lnight_db float`
- `noise_air_lden_db float`
- `noise_air_lnight_db float`
- `noise_industry_lden_db float`
- `noise_coverage_status text`
- `noise_model_year smallint`
- `noise_acoustic_review_required boolean`

Neighbor/surroundings:

- `neighbor_building_count_40m integer`
- `neighbor_nearest_building_distance_m float`
- `road_nearest_centerline_distance_m float`
- `access_road_nearby boolean`
- `neighbor_context_confidence text`
- `planning_noise_area boolean`
- `planning_production_noise_consequence_area boolean`
- `planning_odor_area boolean`
- `planning_technical_facility_consequence_area boolean`
- `planning_large_livestock_area boolean`
- `planning_surroundings_review_required boolean`

Constraints:

- Boolean columns that represent source uncertainty should remain nullable.
- `false` means verified no overlap/hit.
- `null` means unknown, source unavailable or not evaluated.
- Add comments to every column, matching existing migration style.

### 6.2 Raw Source Results

Use `address_source_results` for raw/intermediate payloads:

- `mst_noise`
- `vejdata_mastra_noise_input`
- `geodanmark_nabo`
- `mat_neighbor_parcels`
- `plandata_surroundings`
- `arealdata_surroundings`
- `cvr_nearby_units`

Suggested TTL:

- GeoDanmark/MAT geometry: 90 days
- Plandata surroundings: 30 days
- Arealdata surroundings: 30 days
- MST noise: 180 days, but refresh if model year changes
- Mastra/traffic: 90 days
- CVR nearby units: 30 days

TTL policy should live in `src/lib/cache-policy.ts`, not inline in adapters.

## 7. Rule Engine Konsekvenser

Nye rules bør være additive:

- `noise-rules.ts`
- `surroundings-rules.ts`
- eventuelt `neighbor-rules.ts`

Regeltyper:

- `warning`: købs-/designrisiko
- `review_required`: kræver rådgiver/kommune/akustiker
- `authority_discretion`: kommunen afgør
- `documentation_required`: manglende bilag eller støjredegørelse

Undgå i første version:

- absolute Hard Stop fra støjkort alene
- absolute Hard Stop fra nabobygning tæt på skel alene
- auto-konklusion om endelig naboorientering

Eksempler:

- Vejstøj over vejledende grænse -> "Akustisk vurdering anbefales før køb/design".
- Støjbelastet område i Plandata -> "Planmæssig støjrisiko, kontroller lokalplan
  og kommune".
- Produktion/lugt-konsekvensområde -> "Særligt myndigheds-/naboforhold".
- Nabobygning meget tæt på skel + projekt tæt på samme skel -> "Partshøring kan
  blive relevant".
- Ukendt støjdækning -> "Støjkort dækker ikke sikkert området".

## 8. Myndighed Og Naboorientering

Planlovens § 20 betyder, at dispensationer efter § 19 som udgangspunkt først
kan meddeles efter skriftlig orientering og frist på 2 uger til relevante parter,
med undtagelser hvor kommunen vurderer, at orientering er af underordnet
betydning.

ArchAI bør understøtte, ikke afgøre, processen:

- identificer hvilke forhold der kan udløse naboorientering/partshøring
- vis berørte nabomatrikler
- generer rådgiverbrief og bilagsliste
- lav opgaver i `building_tasks`
- track kommunens svar og høringsstatus
- marker endelig afgørelse som myndighedsdata/uploadet dokument

Foreslåede task keys:

- `naboorientering_party_review`
- `akustiker_stoejvurdering`
- `kommune_stoej_lugt_afklaring`
- `neighbor_setback_survey_review`
- `myndighed_partshoering_status`

## 9. AI-Brug

Tilladt:

- forklare støj- og naboforhold på dansk
- opsummere officielle kilder og uploadede rapporter
- skrive udkast til rådgiverbrief
- skrive udkast til naboorienteringsnotat
- foreslå manglende bilag

Ikke tilladt:

- opfinde dB-værdier
- konkludere at støjkrav er opfyldt uden evidence
- konkludere at naboorientering ikke er nødvendig
- bruge client-provided risikoflag som autoritet
- gemme AI-output som compliance truth uden schema og evidence

Alle AI-output, der gemmes, skal schema-valideres.

## 10. Implementeringsrækkefølge

### Fase 0 - Source Proof Og Arkitekturreview

Leverancer:

- verificer MiljøGIS/støjkort endpoints og lag
- verificer GeoDanmark entitets-WFS endpoint, auth og typenames
- verificer Plandata WFS typenames for kommuneplanretningslinjer
- beslut om EJF/ejerdata er ude af scope i første version
- beslut typed columns vs. separat table for høringskandidater

Acceptkriterier:

- ingen kode bygger på uverificerede typenames uden mock/degraded state
- alle nye kilder har kilde-URL, dækningsbeskrivelse og usikkerhedsmodel

### Fase 1 - DAWA-Fri Nabogeometri

Leverancer:

- live GeoDanmark neighbor/road adapter
- MAT neighbor parcel adapter
- EPSG:25832 distance utilities
- Zod/decoder tests
- raw cache i `address_source_results`
- typed summary patch til `site_constraints`

Acceptkriterier:

- unit tests uden netværk/Supabase
- live smoke bag `RUN_LIVE_DATAFORDELER_SMOKE=true`
- ingen DAWA/Dataforsyningen REST
- no-hit og endpointfejl adskilles

### Fase 2 - Plandata Surroundings

Leverancer:

- `PlandataSurroundingsService`
- kodelistebaseret filtrering for støj/lugt/tekniske anlæg/husdyrbrug
- typed columns og derivation
- rule-engine warnings

Acceptkriterier:

- vedtaget og forslag adskilles
- planid/status/kilde bevares
- UI viser ikke planforslag som gældende krav

### Fase 3 - Støjkort

Leverancer:

- `MstNoiseService`
- source coverage model
- typed noise columns
- `noise-rules.ts`
- risk overview kategori eller udvidelse af `naboer`/`plan`

Acceptkriterier:

- `unknown` vises aldrig som `ok`
- thresholds findes kun i domain/rule engine
- WMS-only kilde giver ikke pseudo-dB

### Fase 4 - Myndighedsworkflow

Leverancer:

- task generation for acoustic review and neighbor party review
- evidence ledger/document upload integration, hvis eksisterende dokumentmodul
  er klart
- rådgiverbrief-template
- høringsstatus i `building_tasks`

Acceptkriterier:

- ArchAI kan forklare næste skridt uden at afgøre kommunens skøn
- ingen persondata gemmes unødigt

### Fase 5 - Sekundære Indikatorer

Leverancer:

- Mastra traffic input adapter
- CVR/P-enhed adapter bag feature flag
- kommunalt kildekatalog/manual flow

Acceptkriterier:

- indikatorer markeres som lavere autoritet
- brancherisiko er domain-reviewet, ikke AI-genereret

## 11. Teststrategi

Tier 1 - Domain og pure functions:

- støjklassifikation for road/rail/air/industry
- `unknown`/degraded source behavior
- nabotæthed og afstandsklassifikation
- Plandata code mapping
- CVR branch watchlist mapping

Tier 2 - Application services:

- `handleSurroundingsAnalysis` med fake gateways
- cache-hit/cache-miss
- endpointfejl -> degraded source result
- typed `site_constraints` derivation

Tier 3 - Acceptance:

- adresse -> Matriklen -> "Støj og naboforhold" viser kilde, risiko og næste
  handling
- støjkort uden dækning viser `unknown`
- tæt nabogeometri genererer review task, ikke hard stop

Live smoke:

- `RUN_LIVE_DATAFORDELER_SMOKE=true` for GeoDanmark/MAT
- separat `RUN_LIVE_MST_NOISE_SMOKE=true` hvis støjendpoint kræver live smoke
- separat `RUN_LIVE_PLANDATA_SURROUNDINGS_SMOKE=true`

## 12. Åbne Beslutninger

- Skal støj have egen risikokategori i cockpit, eller foldes ind under
  `naboer`/`plan`?
- Skal høringskandidater have egen tabel, eller starte som `building_tasks` og
  cached source result?
- Må ArchAI bruge EJF/ejerdata, og under hvilken databehandler-/GDPR-model?
- Hvilket MiljøGIS endpoint og hvilke lag er stabile nok til automatiseret brug?
- Skal legacy GeoDanmark WFS fravælges helt til fordel for entitets-WFS?
- Skal CVR/P-enheder være en betalt/feature-flagged due-diligence udvidelse?

## 13. Definition Of Done For Første Produktversion

Første version er god nok, når ArchAI kan:

- hente live DAWA-fri nabogeometri fra GeoDanmark/MAT eller returnere tydeligt
  degraded state
- vise nabomatrikler og nærmeste nabobygning/vejafstand med kilde og usikkerhed
- screene Plandata for støj/lugt/konsekvensområder
- screene MST-støjkort, hvis datalag er teknisk tilgængelige
- gemme kritiske summary-værdier i `site_constraints`
- gemme rå kildeudtræk i `address_source_results`
- generere review tasks for støj, naboorientering og skelafstande
- køre rule engine server-side før AI forklarer design-/myndighedskonsekvens
- bestå:
  - `bunx tsc --noEmit`
  - `bun test`
  - `bunx eslint .`
  - `bun run build`

## 14. Kilder Verificeret Under Analysen

- Miljøstyrelsen, kortlægning af støj: https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej
- Miljøstyrelsen, støjgrænser: https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/stoejgraenser
- Datafordeler, GeoDanmark Vektor WFS: https://datafordeler.dk/dataoversigt/geodanmark-vektor/geodanmark-vektor-wfs/
- Datafordeler, GeoDanmark Vektor WFS entiteter: https://datafordeler.dk/dataoversigt/geodanmark-vektor/geodanmark-vektor-wfs-entiteter/
- Plandata, WFS-vejledning: https://www.plandata.dk/webservices/introduktion-til-webservices/wfs
- Plandata, kodelister til digital kommuneplan datamodel: https://www.plandata.dk/teknisk-information/kategorier-og-koder/kodelister-til-digital-kommuneplan-datamodel
- Plandata, udpegning af lugtbelastede arealer: https://www.plandata.dk/vejledning-til-kommuneplaner/udpegning-af-lugtbelastede-arealer
- Danmarks Miljøportal, Arealdata: https://miljoeportal.dk/systemer/arealdata/
- Vejdirektoratet/Mastra, trafikstøjdata: https://www.opendata.dk/vejdirektoratet/stojdata-mastra
- Erhvervsstyrelsen, CVR: https://erhvervsstyrelsen.dk/det-centrale-virksomhedsregister-cvr
- Retsinformation, Planloven LBK nr. 572 af 29/05/2024: https://www.retsinformation.dk/eli/lta/2024/572
