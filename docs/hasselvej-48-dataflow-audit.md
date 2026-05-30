# Audit: adresseflow for Hasselvej 48, 2830 Virum

Dato: 2026-05-28

Formål: konkret gennemgang af hvilke kald ArchAI laver, hvilke input hvert kald
bruger, hvor input kommer fra, hvad der gemmes, og hvor flowet kan forsimples
eller gøres mere robust.

Testadresse:

- Adresse: `Hasselvej 48, 2830 Virum`
- `adresseid`: `0a3f50a6-34da-32b8-e044-0003ba298018`
- `adgangsadresseid`: `0a3f507d-4cf9-32b8-e044-0003ba298018`
- Koordinat fra GSearch: `55.79367462807111, 12.480285196048813`
- Kommune fra GSearch: `0173`
- Ejerlavskode fra MAT: `12352`
- Matrikelnummer fra MAT: `5fo`
- MAT registreret grundareal: `441 m2`
- MAT WFS polygonareal: `434.44 m2`
- VUR vurderet areal: `441 m2`
- BFE fra EBR/VUR: `2073922`

## Kilder og dokumentation

Datafordeler-kald er vurderet mod Datafordelerens dokumentation:

- Datafordelerens dokumentation:
  `https://confluence.sdfi.dk/display/DML/Datafordelerens+dokumentation`
- Datafordeler DHM WCS:
  `https://datafordeler.dk/dataoversigt/danmarks-hoejdemodel-dhm/dhm-wcs/`

Andre endpoint-kilder:

- GSearch v2:
  `https://github.com/Klimadatastyrelsen/gsearch/tree/v2.0/doc`
- Plandata WFS:
  `https://www.plandata.dk/webservices/introduktion-til-webservices/wfs`
- Danmarks Miljøportal Arealdata:
  `https://support.miljoeportal.dk/hc/da/articles/360016780777-Arealdata-Udstilling-af-data`
- Danmarks Miljøportal DKJord endpoint-varsling:
  `https://miljoeportal.dk/nyheder/2026/varsling-aendring-af-endpoint-for-geoserver-til-dkjord-jordforureninger/`
- FBB WMS/WFS:
  `https://slks.dk/omraader/kulturarv/databaserne/fredede-og-bevaringsvaerdige-bygninger/vejledning/udtraek-data-til-eget-gis-system`
- Tjekditnet:
  `https://digst.dk/tele/bredbaandsudrulning/bredbaandsdaekning/tjekditnetdk/`
- Tjekditnet datasæt/API:
  `https://datavejviser-indtastning.digst.govcloud.dk/dataset/tjek-dit-net`
- EMOData:
  `https://emoweb.dk/emodata/api-docs/`

## Live-flow i kort form

```mermaid
sequenceDiagram
    actor "Bruger" as User
    participant "Adresse UI" as UI
    participant "GSearch /adresse" as GSA
    participant "Project store + syncPatch" as Store
    participant "analyseAddress" as Orch
    participant "DAR Adresse/Husnummer" as DAR
    participant "MAT GraphQL" as MAT
    participant "BBR GraphQL" as BBR
    participant "Plandata WFS" as Plan
    participant "EBR -> VUR" as VUR
    participant "Layer 4 WFS/WCS" as Geo
    participant "Supabase caches/tracing" as DB

    User->>UI: "Hasselvej 48, 2830 Virum"
    UI->>GSA: "q + limit"
    GSA-->>UI: "adresseid, tekst, postnr, kommunekode, koordinat"
    UI->>Store: "Gem address, men adgangsadresseid er tom"
    UI->>Orch: "addressId, tom adgangsadresseid, koordinater"
    Orch->>DAR: "DAR_Adresse(id_lokalId = addressId)"
    DAR-->>Orch: "husnummer = adgangsadresseid"
    Orch->>DAR: "DAR_Husnummer(adgangsadresseid)"
    DAR-->>Orch: "jordstykke FK"
    Orch->>MAT: "MAT_Jordstykke + MAT_Ejerlav"
    MAT-->>Orch: "matrikel, ejerlavskode, grundareal"
    par "Layer 1"
        Orch->>MAT: "Slår ejerlav/matrikel op igen"
        Orch->>BBR: "husnummer = adgangsadresseid"
        Orch->>Plan: "POINT(lng lat)"
        Orch->>VUR: "EBR husnummer -> BFE -> VUR"
    end
    par "Layer 2-4 og forsyning"
        Orch->>Geo: "MAT WFS, FBB WFS, DAI, DKJord, GEUS, DHM, GeoDanmark"
        Orch->>DB: "Lokalplan/servitut/source-result cache"
    end
```

Se også den generelle flow-visualisering i `docs/adresse-dataflow.md`.

## Faktisk kald-række og input

| Trin | Endpoint/service                       | Input                                            | Input kommer fra        | Output i Hasselvej-run                                             |
| ---- | -------------------------------------- | ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------ |
| 1    | GSearch v2 `/adresse`                  | `q="Hasselvej 48, 2830 Virum"`                   | Brugerinput             | `adresseid`, adresse, `kommunekode=0173`, koordinat                |
| 1b   | GSearch v2 `/husnummer` testet manuelt | Samme `q`                                        | Brugerinput             | `id=0a3f507d-...`, samme som senere DAR `adgangsadresseid`         |
| 2    | `project-store` + `syncPatch`          | GSearch suggestion                               | UI                      | Gemmer address, men `adgangsadresseid=""`                          |
| 3    | `fetchCompliance`                      | `addressId`, tom `adgangsadresseid`, koordinater | Project store           | Validated server input                                             |
| 4    | DAR `DAR_Adresse`                      | `id_lokalId = adresseid`                         | GSearch `/adresse`      | `husnummer=0a3f507d-...`                                           |
| 5    | DAR `DAR_Husnummer`                    | `id_lokalId = husnummer`                         | DAR Adresse             | `jordstykke` FK                                                    |
| 6    | MAT `MAT_Jordstykke`                   | `id_lokalId = jordstykke`                        | DAR Husnummer           | `matrikelnummer=5fo`, `registreretAreal=441`                       |
| 7    | MAT `MAT_Ejerlav`                      | `id_lokalId = ejerlavLokalId`                    | MAT Jordstykke          | `ejerlavskode=12352`                                               |
| 8    | MAT `getGrundareal`                    | `ejerlavskode=12352`, `matrikelnummer=5fo`       | Enrichment              | `registreretAreal=441`, `jordstykkeLokalId=2468837`                |
| 9    | BBR `BBR_Bygning`                      | `husnummer=adgangsadresseid`                     | DAR enrichment          | Byggeår 1937, bebygget areal 68, samlet areal 129, bygning-UUID'er |
| 10   | Plandata WFS lokalplan                 | Punkt fra GSearch-koordinat                      | GSearch                 | Lokalplan `1024788`, plan nr. `198`                                |
| 11   | Plandata WFS kommuneplanramme          | Punkt fra GSearch-koordinat                      | GSearch                 | Kommuneplanramme `11709010`, bebyggelsesprocent 60                 |
| 12   | EBR                                    | `husnummerLokalId=adgangsadresseid`              | DAR enrichment          | `bfeNr=2073922`                                                    |
| 13   | VUR                                    | `bfeNr -> recordId -> propertyId`                | EBR                     | Ejendomsværdi 3.450.000, grundværdi 1.391.500, vurderet areal 441  |
| 14   | Lokalplan PDF extraction/cache         | `addressId`, lokalplan PDF URL                   | GSearch + Plandata      | Cache hit fra `address_analysis`                                   |
| 15   | Servitut extraction/cache              | `addressId`, ejerlav, matrikel                   | GSearch + MAT           | Cache hit, mock-data                                               |
| 16   | MAT WFS geometri                       | `jordstykkeLokalId=2468837`                      | MAT Layer 1             | Parcelpolygon, areal 434.44 m2, bbox, centroid                     |
| 17   | FBB WFS                                | BBR bygning-UUID'er                              | BBR                     | SAVE 3 på primær bygning, ikke fredet                              |
| 18   | DKJord WFS                             | Parcelpolygon fra cache eller punkt              | MAT WFS/cache + GSearch | Fejl: gammel endpoint/typenames                                    |
| 19   | DAI Naturbeskyttelse                   | Punkt                                            | GSearch                 | Returnerede "success", men endpoint gav HTML/ikke-reel WFS-respons |
| 20   | DAI Arealdata                          | Parcelpolygon fra cache eller punkt              | MAT WFS/cache + GSearch | Fejl, bl.a. fordi polygon ikke lå i cache                          |
| 21   | GEUS                                   | BBox omkring punkt                               | GSearch                 | Cache hit, mock-resultat                                           |
| 22   | DHM WCS                                | UTM bbox fra punkt/grundareal                    | GSearch + MAT           | Cache hit, mock-resultat                                           |
| 23   | GeoDanmark WFS                         | Parcel bbox eller fallback bbox                  | MAT WFS + GSearch       | Fejl/resultatstatus skjult som intern SourceResult                 |
| 24   | Fjernvarme/Plandata                    | Punkt                                            | GSearch                 | `false`                                                            |
| 25   | Tjekditnet                             | `adgangsadresseid`                               | DAR enrichment          | `no_hit`                                                           |
| 26   | EMOData                                | BBR bygning-ID                                   | BBR                     | Sprunget over pga. manglende credentials                           |

## Vigtigste fund

### P0/P1: Uklar eller risikabel datahåndtering

1. `adgangsadresseid` findes server-side, men gemmes ikke tilbage på adressen.

   GSearch `/adresse` giver `adresseid`, men vores mapping sætter
   `adgangsadresseid` til tom streng. Serveren finder korrekt
   `adgangsadresseid` via DAR, og alle de vigtige kald bruger det korrekt i
   samme analyse. Det bliver bare ikke skrevet tilbage til `address` i
   project-store/projektet. Det gør UI/debugging forvirrende og betyder, at
   næste analyse starter med samme hul.

   Anbefaling: Når `analyseAddress` har beriget adressen, returner et
   `enrichedAddress`-felt eller en eksplicit `addressPatch`, og lad cockpit-flowet
   persistente `adgangsadresseid`, `ejerlavskode`, `matrikelnummer` og
   `grundareal`.

2. `DarService.getAddressDetails` udleder forkert kommune for denne adresse.

   GSearch gav `kommunekode=0173`, og Plandata havde `komnr=173`. Den direkte
   DAR/MAT enrichment returnerede derimod `kommunekode="0012"` og
   `kommunenavn="0012"`, fordi kommunen tilsyneladende udledes af
   `ejerlavskode=12352`. Det er ikke en sikker relation.

   Anbefaling: Stop med at udlede kommune fra ejerlavskode. Brug GSearch/DAR
   adresse/husnummer-kommunefelt, hvis feltet er nødvendigt, og markér det som
   ukendt hvis Datafordeler-responsen ikke indeholder det.

3. DAI Naturbeskyttelse kan vise "ingen begrænsning", selv om endpoint-kaldet er
   teknisk forkert.

   I live-diagnostikken svarede det brugte DAI endpoint med HTML i stedet for
   reel WFS/JSON for testede lag. Koden ender med at mappe per-layer fejl til
   `false`. For compliance betyder `false` og `unknown/error` noget vidt
   forskelligt.

   Anbefaling: Naturbeskyttelse/Arealdata skal returnere typed degraded state
   med `status=error` eller `unknown`, ikke `false`, når endpointet ikke svarer
   med validerbar WFS/JSON.

4. DKJord-integrationen bruger et lukket/gammelt endpoint.

   Den nuværende kode bruger `https://dkjord.mst.dk/wfs`. Miljøportalens
   endpoint-varsling peger på `https://jord.miljoeportal.dk/geo/wfs` for WFS.
   Det nye endpoint svarer, men bruger andre type names, fx
   `DKJord:View_V1Flader`, og geometri-feltet hedder `Fladegeometri`.

   Anbefaling: Opdatér DKJord-adapteren til nyt endpoint, nye type names og
   nyt geometri-felt. Sæt samtidig test på `GetCapabilities` eller
   `DescribeFeatureType`, så et fremtidigt endpoint-skift opdages.

5. Mock-cache skjuler, at live-kald ikke blev lavet.

   GEUS og DHM kom tilbage som `cache_hit`, men de cachede rækker var markeret
   som mock. Det er fint i udvikling, men det er farligt, hvis UI eller analyse
   læser det som myndighedsdata.

   Anbefaling: `address_source_results.is_mock=true` bør give en tydelig
   service state som `mock_cache_hit`, eller ignoreres når live-mode er slået
   til.

6. Parcelpolygonen hentes, men gemmes ikke, og downstream-kald får derfor
   `polygon=no`.

   MAT WFS geometri lykkedes og returnerede polygon, areal, centroid og bbox.
   Efter kørslen stod `address_analysis.jordstykke_polygon_at` stadig tom. Flere
   downstream-kald forsøger at læse polygon fra cache og falder derfor tilbage
   til punkt eller fejler.

   Anbefaling: Gem MAT WFS parcelpolygonen i `address_analysis.jordstykke_polygon`
   straks efter geometri-kaldet, eller send polygonen direkte videre i memory til
   DKJord, Plandata extended, Arealdata og GeoDanmark.

7. Fejl i `SourceResult` mister for meget detaljeret forklaring.

   `analysis_events` kan vise et endpoint-event som `ok`, mens selve
   `SourceResult` er `status=error`. Samtidig bevares fejlårsagen ikke tydeligt
   i payload eller trace-summary. Det gør det svært at se, om vi har "ingen
   fund", "endpoint nede", "forkert schema" eller "forkert input".

   Anbefaling: Gem struktureret fejlårsag, endpoint-kind, HTTP-status,
   content-type og eventuel schema-validation-kode i source-result payload og
   tracing.

### P2: Forenkling og dubletter

1. GSearch `/husnummer` kan give `adgangsadresseid` tidligere.

   For Hasselvej 48 returnerede GSearch `/husnummer` id
   `0a3f507d-4cf9-32b8-e044-0003ba298018`, hvilket matcher DAR
   `DAR_Adresse.husnummer`. Det betyder, at vi kan fylde
   `adgangsadresseid` allerede ved adressevalg.

   Forsigtig note: `/adresse` og `/husnummer` er ikke det samme begreb. Ved
   etage-/døradresser er `adresseid` stadig den konkrete adresse, mens
   `adgangsadresseid` er husnummeret. Derfor bør vi ikke erstatte `/adresse`
   blindt, men vi kan supplere med `/husnummer` eller mappe hvis GSearch kan
   levere begge sikkert.

2. MAT grundareal hentes to gange med samme værdi.

   Enrichment finder `registreretAreal=441` fra `MAT_Jordstykke`. Layer 1 slår
   derefter ejerlav/matrikel op igen og får samme `registreretAreal=441`, plus
   `jordstykkeLokalId` og beskyttelsesfelter.

   Anbefaling: Udvid enrichment-kaldet til også at hente `id_lokalId` og de
   relevante MAT-beskyttelsesfelter. Så kan Layer 1 springe det ekstra MAT-opslag
   over, når enrichment allerede er komplet og valideret.

3. VUR `vurderetAreal=441` matcher MAT `registreretAreal=441`, men bør ikke
   være primær kilde.

   Værdien stemmer for Hasselvej 48. VUR-arealet er dog vurderingsdata og ikke
   samme autoritative felt som MAT registreret areal. Det egner sig godt som
   sanity check, ikke som kilde til grundareal.

4. MAT polygonareal `434.44 m2` er ikke en erstatning for registreret areal
   `441 m2`.

   Forskellen er forventelig, fordi geometri-areal og matrikulært registreret
   areal ikke nødvendigvis er identiske. Det bør vises som geometri-metrik eller
   kvalitetsflag, ikke bruges til bebyggelsesprocent.

5. Koordinat fra GSearch og centroid fra MAT WFS er forskellige datapunkter.

   GSearch-koordinatet er adresse-/vejpunktnært. MAT WFS centroid er
   parcelcentroid. De kan begge være rigtige, men bruges til forskellige ting.
   Punkt-baserede plan- og miljøopslag bør bevidst vælge enten adressepunkt eller
   parcelgeometri.

6. `address_analysis.compliance_result` findes, men orchestrator læser ikke den
   cache.

   For testadressen lå der en ældre `compliance_result_at`, men flowet kører
   registerdata live og bruger ikke compliance-result cache som autoritet. Det
   er sundt for compliance, men feltet kan forvirre.

   Anbefaling: Enten deprecér feltet tydeligt, eller brug det kun som
   UI/read-model med tydelig timestamp og kilde, aldrig som compliance-kilde.

## Hvad gemmes hvor og hvornår

| Tidspunkt                       | Tabel/store                    | Hvad gemmes                                           | Observation                                                        |
| ------------------------------- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Adressevalg                     | `project-store` og projektsync | `address` fra GSearch                                 | `adgangsadresseid` gemmes som tom streng                           |
| Cockpit live-run                | `analysis_runs`                | Run-id, bruger/projekt hvis tilgængelig               | Direkte test-run havde `projectId=null`, men tracing blev oprettet |
| Under analyse                   | `analysis_events`              | Hvert større integrationstrin                         | Viser timings; nogle SourceResult-fejl fremstår for skjult         |
| Lokalplan extraction            | `address_analysis`             | PDF URL og lokalplanudtræk                            | Cache hit fra tidligere run                                        |
| Servitutter                     | `address_analysis`             | Servitut-resultat                                     | Cache hit, mock                                                    |
| Parcelpolygon                   | `address_analysis`             | Burde gemme `jordstykke_polygon`                      | Blev ikke opdateret, selv om MAT WFS lykkedes                      |
| Source-result caches            | `address_source_results`       | GEUS, DHM, Plandata ext, Arealdata ext m.m.           | GEUS/DHM var mock-cache hits; Arealdata fejl blev skrevet          |
| Reelt cockpit-flow efter result | `project-store`/projektsync    | BBR, flags, service states, lokalplaner, geodata m.m. | Gemmer analyseoutput, men ikke beriget `address`                   |

## Konkrete anbefalinger i prioriteret rækkefølge

1. Persistér beriget adresse efter `analyseAddress`: især
   `adgangsadresseid`, `ejerlavskode`, `matrikelnummer`, `grundareal` og evt.
   `jordstykke_lokal_id`.
2. Fjern kommune-afledning fra ejerlavskode; brug kun en faktisk kommunekilde.
3. Ret DAI/Arealdata/Naturbeskyttelse til `unknown/error` ved endpoint- eller
   schemafejl, aldrig `false`.
4. Opdatér DKJord til `jord.miljoeportal.dk/geo/wfs`,
   `DKJord:View_*`-typer og `Fladegeometri`.
5. Cache eller viderefør MAT WFS parcelpolygonen i samme run, så downstream
   geokald kan bruge parcelgeometri.
6. Udvid MAT enrichment, så Layer 1 ikke behøver et ekstra MAT-opslag for samme
   matrikel, når enrichment allerede har alle nødvendige felter.
7. Skeln tydeligt mellem `cache_hit`, `mock_cache_hit`, `no_hit`, `unknown` og
   `error` i service states.
8. Tilføj trace-events for cache reads i `address_source_results`, ikke kun de
   eksterne endpoint-kald.
9. Overvej GSearch `/husnummer` som supplerende autocomplete/enrichment-kald for
   at fylde `adgangsadresseid` tidligere, men behold `/adresse` som
   adresse-/enheds-id.

## Kort konklusion

Selve hovedkæden for Hasselvej 48 virker: GSearch giver en adresse, DAR finder
husnummeret, MAT finder matrikel og areal, BBR/VUR/Plandata/FBB giver brugbare
data. De største problemer er ikke i den første succesfulde kæde, men i
datakontrakten omkring beriget adresse, i miljø-/geokald der kan degradere for
stille, og i caches der gør det uklart, om vi kigger på live autoritetsdata,
mock-data eller gamle resultater.
