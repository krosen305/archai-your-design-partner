# ArchAI - Datapunkt-rapport

**Adresse:** Hasselvej 48, 2830 Virum  
**adresseid:** `0a3f50a6-34da-32b8-e044-0003ba298018`  
**adgangsadresseid:** `0a3f507d-4cf9-32b8-e044-0003ba298018`  
**Koordinater:** 55.7937N, 12.4803E  
**Genereret:** 14. maj 2026 kl. 12.12  
**Kilde:** `scripts/test-hasselvej-48.ts`

**Statusnøgle:** LIVE = live endpoint OK · MOCK = implementeret fallback/skippet · FEJL = endpoint/test fejlede

---

## 1. Adresse

| Datapunkt            | Kildesystem          | Status | Bruges til              | Hasselvej 48                           |
| -------------------- | -------------------- | ------ | ----------------------- | -------------------------------------- |
| adresseid (DAR UUID) | DAR/DAWA             | LIVE   | Cache-nøgle, DAR-opslag | `0a3f50a6-34da-32b8-e044-0003ba298018` |
| adgangsadresseid     | DAR/DAWA             | LIVE   | BBR/EBR-opslag          | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Adressetekst         | Adresse test fixture | LIVE   | UI-display              | Hasselvej 48, 2830 Virum               |
| Ejerlavskode         | MAT/DAR              | LIVE   | MAT-opslag              | 12352                                  |
| Matrikelnummer       | MAT/DAR              | LIVE   | MAT-opslag              | 5fo                                    |
| Koordinater          | Adresse test fixture | LIVE   | Geo-opslag              | 55.7937, 12.4803                       |

---

## 2. BBR

| Datapunkt            | Kildesystem                        | Status | Bruges til          | Hasselvej 48                         |
| -------------------- | ---------------------------------- | ------ | ------------------- | ------------------------------------ |
| Antal bygninger      | BBR v2 GraphQL                     | LIVE   | Bygningsvalg        | 8                                    |
| BBR Public IDs       | api.dataforsyningen.dk/bbr/bygning | FEJL   | FBB-opslag          | ingen                                |
| Primær bygning UUID  | BBR v2 GraphQL                     | LIVE   | Sporbarhed          | cb2f89dc-7278-4802-a53e-188cb7120f56 |
| Byggeår              | BBR v2 GraphQL                     | LIVE   | Renoveringsbehov    | 1937                                 |
| Bebygget areal       | BBR v2 GraphQL                     | LIVE   | Bebyggelsesprocent  | 68 m2                                |
| Samlet bygningsareal | BBR v2 GraphQL                     | LIVE   | Typologi            | 121 m2                               |
| Antal etager         | BBR v2 GraphQL                     | LIVE   | Planvalidering      | 2                                    |
| Anvendelseskode      | BBR v2 GraphQL                     | LIVE   | Boligklassificering | 130                                  |
| Varmeinstallation    | BBR v2 byg056                      | LIVE   | Energibaseline      | 2                                    |
| Opvarmningsmiddel    | BBR v2 byg057                      | LIVE   | Energibaseline      | 3                                    |
| Fredet               | BBR v2 byg070                      | LIVE   | Fredningsflag       | null                                 |
| FBB reference        | BBR v2 byg071                      | LIVE   | FBB-sporbarhed      | null                                 |

---

## 3. FBB - Fredede og Bevaringsværdige Bygninger

| Datapunkt           | Kildesystem                            | Status | Bruges til                    | Hasselvej 48               |
| ------------------- | -------------------------------------- | ------ | ----------------------------- | -------------------------- |
| FBB endpoint        | https://www.kulturarv.dk/geoserver/wfs | LIVE   | SAVE-opslag                   | FBB WFS HTTP 200           |
| Input IDs           | Integer FBB/BBR bygningsids            | LIVE   | CQL bygningsid IN             | 4602381, 4600919           |
| FBB bygning 4602381 | Kulturarv GeoServer WFS                | LIVE   | SAVE/fredning                 | SAVE 3, fredningsstatus 3  |
| FBB bygning 4600919 | Kulturarv GeoServer WFS                | LIVE   | SAVE/fredning                 | SAVE -1, fredningsstatus 5 |
| Bedste/laveste SAVE | FbbService.getSaveData                 | LIVE   | Regelkerne heritage.saveValue | 3 på bygning 4602381       |

**FBB-noter**

- BBR Public Service gav ingen IDs; bruger FBB adressefallback: 4602381, 4600919
- FBB WFS HTTP 200
- Input BBR/FBB bygningsids: 4602381, 4600919
- Rå WFS features: 2
- FbbService bygninger: 2
- Bygning 4602381: SAVE 3, fredningsstatus 3
- Bygning 4600919: SAVE -1, fredningsstatus 5
- Bedste/laveste SAVE: 3 på bygning 4602381

---

## 4. MAT

| Datapunkt         | Kildesystem    | Status | Bruges til         | Hasselvej 48 |
| ----------------- | -------------- | ------ | ------------------ | ------------ |
| Registreret areal | MAT v2 GraphQL | LIVE   | Bebyggelsesprocent | 441 m2       |
| Strandbeskyttelse | MAT v2 GraphQL | LIVE   | Compliance-flag    | null         |
| Fredskov          | MAT v2 GraphQL | LIVE   | Compliance-flag    | null         |
| Klitfredning      | MAT v2 GraphQL | LIVE   | Compliance-flag    | null         |

---

## 5. EBR og VUR

| Datapunkt      | Kildesystem    | Status | Bruges til   | Hasselvej 48  |
| -------------- | -------------- | ------ | ------------ | ------------- |
| BFE-nummer     | EBR v1 GraphQL | LIVE   | VUR-opslag   | 2073922       |
| Vurderingsår   | VUR v1 GraphQL | LIVE   | Aktualitet   | 2020          |
| Ejendomsværdi  | VUR v1 GraphQL | LIVE   | Finansiering | 3.450.000 kr. |
| Grundværdi     | VUR v1 GraphQL | LIVE   | Finansiering | 1.391.500 kr. |
| Vurderet areal | VUR v1 GraphQL | LIVE   | Reference    | 441 m2        |

---

## 6. WFS og øvrige endpoint-checks

| Integration               | Status | Resultat                                                                                                                                                                                                                                             |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naturbeskyttelse DAI WFS  | LIVE   | - dmp:STRANDBESKYTTELSESLINJE: HTTP 200, 0 features<br>- dmp:SKOVBYGGELINJE: HTTP 200, 0 features<br>- dmp:SOEBESKYTTELSESLINJE: HTTP 200, 0 features<br>- dmp:AABESKYTTELSESLINJE: HTTP 200, 0 features<br>- dmp:KLITFREDNING: HTTP 200, 0 features |
| Fredede bygninger DAI WFS | LIVE   | - dmp:FREDEDE_BYGNINGER: HTTP 200, 0 features                                                                                                                                                                                                        |
| Fjernvarme Plandata WFS   | LIVE   | - pdk:theme_pdk_varmeplansomraade_vedtaget_v: HTTP 200, 0 features                                                                                                                                                                                   |
| DHM WCS                   | FEJL   | - GetCapabilities: HTTP 404                                                                                                                                                                                                                          |
| GEUS WFS                  | LIVE   | - GetCapabilities: HTTP 200<br>- Radon layer nævnt: false<br>- Jupiter layers nævnt: true                                                                                                                                                            |
| DK-Jord WFS               | FEJL   | - GetCapabilities: HTTP 0                                                                                                                                                                                                                            |

---

## Sammenfatning

| Status | Antal |
| ------ | ----: |
| LIVE   |     9 |
| MOCK   |     0 |
| FEJL   |     2 |

### Alle testnoter

#### BBR v2 GraphQL + BBR Public Service - LIVE

- BBR Public Service ID-opslag fejlede: BBR Public Service HTTP 404: <!DOCTYPE html><html lang="da"><head><meta charset="UTF-8"><title>Dataforsyningen API Gateway</title><style>body{font-family:Roboto,sans-serif;font-size:11px;}h1{margin-bottom:.3rem;font-size:.75rem;line-height:.875rem;letter-spacing:.06rem;text-transform:uppercase;font-weight:700;}</style></head><b
- 8 Datafordeler-bygninger fundet
- 0 BBR Public Service integer IDs fundet
- BBR Public IDs: ingen
- Primær bygning UUID: cb2f89dc-7278-4802-a53e-188cb7120f56
- Byggeår: 1937
- Bebygget areal: 68 m2
- Samlet areal: 121 m2
- Etager: 2
- Anvendelse: 130
- Ydervæg (byg032): 1
- Tag (byg033): 2
- Varme (byg056): 2
- Opvarmning (byg057): 3
- Fredet (byg070): null
- FBB reference (byg071): null

#### FBB GeoServer WFS (FbbService) - LIVE

- BBR Public Service gav ingen IDs; bruger FBB adressefallback: 4602381, 4600919
- FBB WFS HTTP 200
- Input BBR/FBB bygningsids: 4602381, 4600919
- Rå WFS features: 2
- FbbService bygninger: 2
- Bygning 4602381: SAVE 3, fredningsstatus 3
- Bygning 4600919: SAVE -1, fredningsstatus 5
- Bedste/laveste SAVE: 3 på bygning 4602381

#### MAT v2 GraphQL - LIVE

- Ejerlav: Virum By, Virum (12352)
- Grundareal: 441 m2
- Strandbeskyttelse_omfang: null
- Fredskov_omfang: null
- Klitfredning_omfang: null

#### EBR v1 GraphQL - LIVE

- BFE-nummer: 2073922
- Match via husnummerLokalId: 0a3f507d-4cf9-32b8-e044-0003ba298018

#### VUR v1 GraphQL - LIVE

- Vurderingsår: 2020
- Ejendomsværdi: 3.450.000 kr.
- Grundværdi: 1.391.500 kr.
- Vurderet areal: 441 m2

#### DAI WFS (NaturbeskyttelseService) - LIVE

- dmp:STRANDBESKYTTELSESLINJE: HTTP 200, 0 features
- dmp:SKOVBYGGELINJE: HTTP 200, 0 features
- dmp:SOEBESKYTTELSESLINJE: HTTP 200, 0 features
- dmp:AABESKYTTELSESLINJE: HTTP 200, 0 features
- dmp:KLITFREDNING: HTTP 200, 0 features

#### DAI WFS (FREDEDE_BYGNINGER) - LIVE

- dmp:FREDEDE_BYGNINGER: HTTP 200, 0 features

#### Plandata WFS (FjernvarmeService) - LIVE

- pdk:theme_pdk_varmeplansomraade_vedtaget_v: HTTP 200, 0 features

#### DHM WCS (DhmService) - FEJL

- GetCapabilities: HTTP 404

#### GEUS WFS (GeusService) - LIVE

- GetCapabilities: HTTP 200
- Radon layer nævnt: false
- Jupiter layers nævnt: true

#### DK-Jord WFS (DkJordService) - FEJL

- GetCapabilities: HTTP 0
