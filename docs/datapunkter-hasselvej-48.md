# ArchAI - Datapunkt-rapport

**Adresse:** Hasselvej 48, 2830 Virum  
**adresseid:** `0a3f50a6-34da-32b8-e044-0003ba298018`  
**adgangsadresseid:** `0a3f507d-4cf9-32b8-e044-0003ba298018`  
**Koordinater:** 55.7937N, 12.4803E  
**Genereret:** 26. maj 2026 kl. 21.29  
**Kilde:** `scripts/test-hasselvej-48.ts`

**Statusnøgle:** LIVE = live endpoint OK · MOCK = implementeret fallback/skippet · FEJL = endpoint/test fejlede

---

## 1. Adresse

| Datapunkt            | Kildesystem          | Status | Bruges til              | Hasselvej 48                           |
| -------------------- | -------------------- | ------ | ----------------------- | -------------------------------------- |
| adresseid (DAR UUID) | DAR/DAWA             | LIVE   | Cache-nøgle, DAR-opslag | `0a3f50a6-34da-32b8-e044-0003ba298018` |
| adgangsadresseid     | DAR/DAWA             | LIVE   | BBR/EBR-opslag          | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Adressetekst         | Adresse test fixture | LIVE   | UI-display              | Hasselvej 48, 2830 Virum               |
| Ejerlavskode         | MAT/DAR              | FEJL   | MAT-opslag              | 12352                                  |
| Matrikelnummer       | MAT/DAR              | FEJL   | MAT-opslag              | 5fo                                    |
| Koordinater          | Adresse test fixture | LIVE   | Geo-opslag              | 55.7937, 12.4803                       |

---

## 2. BBR

| Datapunkt            | Kildesystem                        | Status | Bruges til          | Hasselvej 48 |
| -------------------- | ---------------------------------- | ------ | ------------------- | ------------ |
| Antal bygninger      | BBR v2 GraphQL                     | FEJL   | Bygningsvalg        | 0            |
| BBR Public IDs       | api.dataforsyningen.dk/bbr/bygning | FEJL   | FBB-opslag          | ingen        |
| Primær bygning UUID  | BBR v2 GraphQL                     | FEJL   | Sporbarhed          | null         |
| Byggeår              | BBR v2 GraphQL                     | FEJL   | Renoveringsbehov    | null         |
| Bebygget areal       | BBR v2 GraphQL                     | FEJL   | Bebyggelsesprocent  | null m2      |
| Samlet bygningsareal | BBR v2 GraphQL                     | FEJL   | Typologi            | null m2      |
| Antal etager         | BBR v2 GraphQL                     | FEJL   | Planvalidering      | null         |
| Anvendelseskode      | BBR v2 GraphQL                     | FEJL   | Boligklassificering | null         |
| Varmeinstallation    | BBR v2 byg056                      | FEJL   | Energibaseline      | null         |
| Opvarmningsmiddel    | BBR v2 byg057                      | FEJL   | Energibaseline      | null         |
| Fredet               | BBR v2 byg070                      | FEJL   | Fredningsflag       | null         |
| FBB reference        | BBR v2 byg071                      | FEJL   | FBB-sporbarhed      | null         |

---

## 3. FBB - Fredede og Bevaringsværdige Bygninger

| Datapunkt           | Kildesystem                            | Status | Bruges til                    | Hasselvej 48                              |
| ------------------- | -------------------------------------- | ------ | ----------------------------- | ----------------------------------------- |
| FBB endpoint        | https://www.kulturarv.dk/geoserver/wfs | LIVE   | SAVE-opslag                   | FBB WFS HTTP 200                          |
| Input IDs           | Integer FBB/BBR bygningsids            | LIVE   | CQL bygningsid IN             | 4600919, 4602381                          |
| FBB registreringer  | Kulturarv GeoServer WFS                | LIVE   | SAVE/fredning                 | Ingen FBB features for de testede BBR IDs |
| Bedste/laveste SAVE | FbbService.getSaveData                 | LIVE   | Regelkerne heritage.saveValue | null                                      |

**FBB-noter**

- BBR Public Service gav ingen IDs; bruger FBB adressefallback: 4600919, 4602381
- FBB WFS HTTP 200
- Input BBR/FBB bygningsids: 4600919, 4602381
- Rå WFS features: 2
- FbbService bygninger: 0
- Ingen FBB-registreringer for de testede BBR IDs
- Bedste/laveste SAVE: null

---

## 4. MAT

| Datapunkt         | Kildesystem    | Status | Bruges til         | Hasselvej 48 |
| ----------------- | -------------- | ------ | ------------------ | ------------ |
| Registreret areal | MAT v2 GraphQL | FEJL   | Bebyggelsesprocent | null m2      |
| Strandbeskyttelse | MAT v2 GraphQL | FEJL   | Compliance-flag    | null         |
| Fredskov          | MAT v2 GraphQL | FEJL   | Compliance-flag    | null         |
| Klitfredning      | MAT v2 GraphQL | FEJL   | Compliance-flag    | null         |

---

## 5. EBR og VUR

| Datapunkt      | Kildesystem    | Status | Bruges til   | Hasselvej 48 |
| -------------- | -------------- | ------ | ------------ | ------------ |
| BFE-nummer     | EBR v1 GraphQL | FEJL   | VUR-opslag   | null         |
| Vurderingsår   | VUR v1 GraphQL | MOCK   | Aktualitet   | null         |
| Ejendomsværdi  | VUR v1 GraphQL | MOCK   | Finansiering | null         |
| Grundværdi     | VUR v1 GraphQL | MOCK   | Finansiering | null         |
| Vurderet areal | VUR v1 GraphQL | MOCK   | Reference    | null m2      |

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
| LIVE   |     5 |
| MOCK   |     1 |
| FEJL   |     5 |

### Alle testnoter

#### BBR v2 GraphQL + BBR Public Service - FEJL

- The operation timed out.

#### FBB GeoServer WFS (FbbService) - LIVE

- BBR Public Service gav ingen IDs; bruger FBB adressefallback: 4600919, 4602381
- FBB WFS HTTP 200
- Input BBR/FBB bygningsids: 4600919, 4602381
- Rå WFS features: 2
- FbbService bygninger: 0
- Ingen FBB-registreringer for de testede BBR IDs
- Bedste/laveste SAVE: null

#### MAT v2 GraphQL - FEJL

- The operation timed out.

#### EBR v1 GraphQL - FEJL

- The operation timed out.

#### VUR v1 GraphQL - MOCK

- Skippet: intet BFE-nummer fra EBR

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
