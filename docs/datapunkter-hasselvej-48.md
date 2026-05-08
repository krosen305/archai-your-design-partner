# ArchAI — Datapunkt-rapport
**Adresse:** Hasselvej 48, 2830 Virum  
**adresseid:** `0a3f50a6-34da-32b8-e044-0003ba298018`  
**adgangsadresseid:** `0a3f507d-4cf9-32b8-e044-0003ba298018`  
**Koordinater:** 55.7937°N, 12.4803°E  
**Genereret:** 2026-05-08 (live-test opdateret — DAI WFS + Fjernvarme aktiveret)

**Status-nøgle:** ✅ LIVE · ⏳ MOCK (hardkodet testdata) · ❌ Ikke implementeret · 🔒 Kræver særskilt abonnement

---

## 1. Adresse — GSearch / Dataforsyningen

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adresseid (DAR-UUID) | GSearch API | ✅ LIVE | Cache-nøgle, BBR-opslag | `0a3f50a6-34da-32b8-e044-0003ba298018` |
| adgangsadresseid | DAR v1 / DAWA REST | ✅ LIVE | BBR/EBR-opslag | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Adressetekst | GSearch API | ✅ LIVE | UI-display | Hasselvej 48, 2830 Virum |
| Postnummer | GSearch API | ✅ LIVE | UI-display | 2830 |
| Postby | GSearch API | ✅ LIVE | UI-display | Virum |
| Kommunekode | GSearch API | ✅ LIVE | Kommunenavn-opslag | 0173 |
| Koordinater (WGS84) | GSearch API | ✅ LIVE | Alle geo-opslag | 55.7937°N, 12.4803°E |

---

## 2. Adressedetaljer — DAR + MAT via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adgangsadresseid | DAR v1 GraphQL | ✅ LIVE | BBR-lookup | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Ejerlavskode | MAT v2 via DAR | ✅ LIVE | MAT + Tinglysning | **12352** *(Virum By, Virum)* |
| Matrikelnummer | MAT v2 via DAR | ✅ LIVE | MAT + Tinglysning | **5fo** |
| Grundareal (m²) | MAT v2 via DAR | ✅ LIVE | Bebyggelsesprocent | **441 m²** |
| Kommunenavn | kommuner.ts map | ✅ LIVE | UI-display | Lyngby-Taarbæk |

> DAR v1 returnerer null for ejerlavskode/matrikelnummer direkte — MAT-opslag via `jordstykke`-FK i DAR_Husnummer er primær kilde.

---

## 3. Grundareal + Beskyttelsesregistreringer — MAT via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Registreret areal (m²) | MAT v2 GraphQL | ✅ LIVE | Bebyggelsesprocent | **441 m²** |
| Strandbeskyttelse (registreret) | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (omfang=null) |
| Fredskov (registreret) | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (omfang=null) |
| Klitfredning (registreret) | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (omfang=null) |

> MAT angiver om PARCELLET SELV er registreret inden for beskyttede arealer (kilde: matrikelregisteret). Komplementær til DAI WFS's spatiale tjek (sektion 12).

---

## 4. Bygningsdata — BBR via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Byggeår | BBR v2 GraphQL | ✅ LIVE | Renoveringsbehov, historik | **1937** |
| Bebygget areal (m²) | BBR v2 GraphQL | ✅ LIVE | Bebyggelsesprocent | **68 m²** |
| Samlet bygningsareal (m²) | BBR v2 GraphQL | ✅ LIVE | Typologivurdering | **121 m²** |
| Antal etager | BBR v2 GraphQL | ✅ LIVE | Validering mod lokalplan | **2** |
| Anvendelseskode | BBR v2 GraphQL | ✅ LIVE | Bolig/erhverv-klassificering | **130** |
| Anvendelsestekst | BBR v2 GraphQL | ✅ LIVE | UI-display | **Række-, kæde- eller dobbelthus** |
| Grundareal (m²) | MAT v2 GraphQL | ✅ LIVE | Bebyggelsesprocent | **441 m²** |
| Bebyggelsesprocent | Beregnet | ✅ LIVE | Compliance-flag | **~15 %** (68/441) |
| Beregning mulig | BBR | ✅ LIVE | UI-indikator | **true** |
| Varmeinstallation | BBR v2 byg056 | ✅ LIVE | Energibaseline, fjernvarme-match | **Centralvarme (én fyringsenhed)** (kode 2) |
| Opvarmningsmiddel | BBR v2 byg057 | ✅ LIVE | Energibaseline, varmekilde-valg | **Gas** (kode 3) |
| Ydervæg materiale | BBR v2 byg032 | ✅ LIVE | AI-analyse, materialematch | **Mursten/tegl** (kode 1) |
| Tagdækning | BBR v2 byg033 | ✅ LIVE | AI-analyse, materialematch | **Eternit/fibercement** (kode 2) |
| Fredet | BBR v2 byg070 | ✅ LIVE | Compliance-blocker (SKS) | **null** (ikke fredet) |

> BBR returnerer 8 bygninger på adgangspunktet. Primær bygning er første ikke-garage (byg021 ≠ 910/920/930/940).

---

## 5. Lokalplaner — Plandata WFS

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Antal lokalplaner | Plandata WFS | ✅ LIVE | Plangrundlag-oversigt | **1 vedtagen** |
| Plan-nummer | Plandata WFS | ✅ LIVE | Reference i ansøgning | **198** |
| Plan-navn | Plandata WFS | ✅ LIVE | UI-display | for rækkehusene på Hasselvej og Akacievej i Virum Bydel |
| Kommune | Plandata WFS | ✅ LIVE | Jurisdiktion | **Lyngby-Taarbæk** |
| Dato vedtaget | Plandata WFS | ✅ LIVE | Gyldighedshistorik | **27. november 2006** |
| Status | Plandata WFS | ✅ LIVE | Vedtaget vs. forslag | **V (vedtaget)** |
| PDF-dokument | Plandata WFS | ✅ LIVE | AI-udtræk + download | [Lokalplan 198 PDF](https://dokument.plandata.dk/20_1024788_APPROVED_1183979047629.pdf) |

---

## 6. Kommuneplanramme — Plandata WFS

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Max bebyggelsesprocent | Plandata WFS | ✅ LIVE | Compliance-grænse | **60 %** |
| Max etager | Plandata WFS | ✅ LIVE | Etage-compliance | **2** |
| Max bygningshøjde (m) | Plandata WFS | ✅ LIVE | Højde-compliance | *(ikke defineret i rammen)* |
| Anvendelse generel | Plandata WFS | ✅ LIVE | Zone-klassificering | **Boligområde** |
| Særlige forhold | Plandata WFS | ✅ LIVE | Planbestemmelser | *(tomt)* |

---

## 7. Lokalplan PDF-udtræk — Anthropic Claude

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Max etager | Claude Sonnet 4.6 | ✅ LIVE | AI-validering vs. BBR | *(caches i Supabase)* |
| Max bebyggelsesprocent | Claude Sonnet 4.6 | ✅ LIVE | AI-validering vs. BBR | *(caches i Supabase)* |
| Tagform | Claude Sonnet 4.6 | ✅ LIVE | Arkitektonisk compliance | *(caches i Supabase)* |
| Facadematerialer | Claude Sonnet 4.6 | ✅ LIVE | Materialkrav | *(caches i Supabase)* |
| Byggelinjer (m fra skel) | Claude Sonnet 4.6 | ✅ LIVE | Afstandskrav | *(caches i Supabase)* |
| Særlige bestemmelser | Claude Sonnet 4.6 | ✅ LIVE | Uforudsete restriktioner | *(caches i Supabase)* |

> Caches i Supabase `address_analysis`. Regex-fallback forsøges først (0 tokens).

---

## 8. Nabobygninger — DAWA REST API

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Antal naboer inden for 40 m | DAWA REST | ✅ LIVE | Tæthed, skel-afstand | **8 bygninger** |
| Nærmeste nabo (m) | DAWA REST | ✅ LIVE | Servitut-afstand, privathed | **7.0 m** |
| Nabo 1–8 | DAWA REST | ✅ LIVE | — | Hasselvej 46 (7m), 44 (15m), 50 (17m) ... |

---

## 9. EBR — Ejendomsbeliggenhedsregistret

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| BFE-nummer | EBR v1 GraphQL | ✅ LIVE | VUR-opslag, finansiering | **2073922** |

> **Fix 2026-05-08:** EBR har to adresse-felter: `adresseLokalId` (NULL for rækkehuse) og `husnummerLokalId` (virker altid). Vi filtrerede på det forkerte felt. Nu bruges `husnummerLokalId = DAR_Husnummer.id_lokalId`.

---

## 10. VUR — Ejendomsvurdering

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Ejendomsværdi (kr.) | VUR v1 GraphQL | ✅ LIVE | Finansieringsgrundlag | **3.450.000 kr.** |
| Grundværdi (kr.) | VUR v1 GraphQL | ✅ LIVE | Finansieringsgrundlag | **1.391.500 kr.** |
| Vurderet areal (m²) | VUR v1 GraphQL | ✅ LIVE | Reference | **441 m²** |
| Vurderingsår | VUR v1 GraphQL | ✅ LIVE | Aktualitet | **2020** |

---

## 11. Naturbeskyttelseslinjer — DAI WFS ✅ NY LIVE

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Strandbeskyttelse (300 m zone) | DAI WFS dmp:STRANDBESKYTTELSESLINJE | ✅ LIVE | Byggestop nær kyst | **false** (0 features) |
| Skovbyggelinje (300 m zone) | DAI WFS dmp:SKOVBYGGELINJE | ✅ LIVE | Byggestop nær skov | **false** (0 features) |
| Søbeskyttelse (150 m zone) | DAI WFS dmp:SOEBESKYTTELSESLINJE | ✅ LIVE | Byggestop nær sø > 3 ha | **false** (0 features) |
| Åbeskyttelse (150 m zone) | DAI WFS dmp:AABESKYTTELSESLINJE | ✅ LIVE | Byggestop nær vandløb | **false** (0 features) |
| Klitfredning (zone) | DAI WFS dmp:KLITFREDNING | ✅ LIVE | Byggestop i klitzone | **false** (0 features) |
| Kirkebyggelinje | *(ikke i DAI WFS)* | ❌ | Højdebegrænsning | — |

> Endpoint: `https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer`  
> Geometry-filter: `INTERSECTS(Shape, SRID=4326;POINT(lng lat))`  
> Alle 5 typenames verificerede med HTTP 200 (2026-05-08).  
> OBS: strandbeskyttelse + klitfredning dækkes OGSÅ af MAT (sektion 3) — komplementære kilder.

---

## 12. Fredning & Bevarelse — DAI WFS ✅ NY LIVE

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Fredet bygning (DAI spatial) | DAI WFS dmp:FREDEDE_BYGNINGER | ✅ LIVE | Hård fredning — kræver SKS-dispensation | **false** (0 features) |
| Fredet (BBR byg070) | BBR v2 GraphQL | ✅ LIVE | Komplementær fredningskilde | **null** (ikke fredet) |
| SAVE-bevaringsværdi (1–9) | Kulturmiljøregisteret (SKS) | ❌ Ikke implementeret | Bevaringskrav | — |

> DAI WFS `dmp:FREDEDE_BYGNINGER` verificeret HTTP 200 (2026-05-08). SAVE-score kræver separat endpoint (Kulturmiljøregisteret / `api.fredningsregistret.dk`).

---

## 13. Fjernvarmedækning — Plandata WFS ✅ NY LIVE

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Fjernvarme dækket | Plandata WFS `pdk:theme_pdk_varmeplansomraade_vedtaget_v` | ✅ LIVE | Varmekilde-valg, energiramme | **false** (0 features) |

> Typename var forkert i koden (`pdk:theme_pdk_varmeforsyning_vedtaget` eksisterer ikke).  
> Korrekt typename bekræftet via GetCapabilities + DescribeFeatureType: `pdk:theme_pdk_varmeplansomraade_vedtaget_v`, geometri-felt: `geometri` (MultiSurface).  
> BBR byg056=2 (Centralvarme) + byg057=3 (Gas) stemmer — ingen fjernvarme registreret.

---

## 14. Servitutter & Pant — Tinglysning 🔒

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Antal servitutter | TingbogenV2 REST | ⏳ MOCK | Juridisk due diligence | **3** (mock) |
| Antal pantehæftelser | TingbogenV2 REST | ⏳ MOCK | Finansieringsrisiko | **2** (mock) |
| Servitutter (AI-klassificeret) | TingbogenV2 + Claude | ⏳ MOCK | Byggekritiske servitutter | *(mock data)* |

> 🔒 **ARCH-30:** TingbogenV2 returnerer HTTP 404 for alle URL-varianter — kræver særskilt tilmelding til TINGBOG-servicen på datafordeler.dk (ikke inkluderet i standard API-nøgle-abonnement).

---

## 15. Terræn & Koter — DHM 🔒

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Min/Max/Avg elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Kælder-risiko, dræning | 18.40 / 21.70 / 20.10 m (mock) |
| Terræn-hældning (%) | Beregnet | ⏳ MOCK | Bygningsplacering | 4.2 % (mock) |
| Nordorientering | Beregnet | ⏳ MOCK | Solvarme | **S (sydvendt)** (mock) |

> 🔒 **ARCH-102:** DHM WCS endpoint `https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS` returnerer HTTP 404 — sandsynligvis samme problematik som TingbogenV2 (kræver særskilt Datafordeler-abonnement).

---

## 16. Radon & Grundvand — GEUS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Radonrisiko | GEUS WFS | ⏳ MOCK | Ventilationskrav, BR18 §301 | medium (mock) |
| Grundvandsdybde (m) | GEUS WFS jupiter_boringer_ws | ⏳ MOCK | Kælder-risiko, fundamentering | 3.8 m (mock) |

> **ARCH-101 (revideret):** GEUS WFS endpoint er live (HTTP 200). Layer `radon_risiko` eksisterer **ikke** i GEUS WFS. Tilgængelige layers: `jupiter_boringer_ws` (boringer/grundvand), `jupiter_boringer_seneste_pejling` m.fl.  
> Radondata er sandsynligvis tilgængeligt som WMS-raster (ikke WFS) — kræver ny strategi.

---

## 17. Jordforurening — DK-Jord ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| V1/V2-kortlagt, olietank, områdeklasse | DK-Jord WFS | ⏳ MOCK | Forureningsrisiko | *(mock data)* |

> **ARCH-66:** `dkjord.mst.dk` er ikke tilgængeligt fra dev-miljø (connection refused). Kan fungere fra production/Cloudflare Workers.

---

## Sammenfatning

### Live-integrationer (11) — kører i produktion
| # | System | Datapunkter |
|---|---|---|
| 1 | GSearch/Dataforsyningen | Adresse, koordinater, kommunekode |
| 2 | DAR v1 | adgangsadresseid, ejerlavskode, matrikelnummer |
| 3 | MAT v2 | Grundareal 441 m², strandbeskyttelse/fredskov/klitfredning (registreret) |
| 4 | BBR v2 | Byggeår, areal, etager, anvendelse, varme, materialer, fredning |
| 5 | Plandata WFS | Lokalplaner, kommuneplanramme |
| 6 | DAWA REST | Nabobygninger (8 inden for 40 m) |
| 7 | Anthropic Claude | PDF-udtræk fra lokalplan |
| 8 | EBR v1 + VUR v1 | BFE 2073922, ejendomsværdi **3,45 mio.**, grundværdi **1,39 mio.** (2020) ✨ **FIX** |
| 9 | DAI WFS | Naturbeskyttelseslinjer (5 typer) ✨ **NY** |
| 10 | DAI WFS | Fredede bygninger (SaveService) ✨ **NY** |
| 11 | Plandata WFS | Fjernvarmedækning ✨ **NY** (typename fikset) |

### Mock-integrationer (4) — afventer
| # | System | Linear | Status |
|---|---|---|---|
| 1 | GEUS radon+grundvand | ARCH-101 | Endpoint virker, men radon-layer mangler — ny strategi (WMS?) |
| 2 | DK-Jord forurening | ARCH-66 | Connection refused i dev — kan virke i prod |
| 3 | DHM Terræn | ARCH-102 | 🔒 Kræver særskilt Datafordeler-abonnement |
| 4 | Tinglysning servitutter | ARCH-30 | 🔒 Kræver særskilt Datafordeler-abonnement |

### Servicegrupperingernes overlaps — kritisk analyse
| Datapunkt | Dækkes af | Konsekvens |
|---|---|---|
| Strandbeskyttelse | MAT v2 (registreret parcel) + DAI WFS (spatial zone) | Komplementære — MAT er parcel-kilde, DAI er spatial kilde. Begge relevante. |
| Klitfredning | MAT v2 (registreret parcel) + DAI WFS (spatial zone) | Komplementære — samme logik som ovenfor. |
| Fredskov | MAT v2 kun | DAI WFS har ikke fredskov-lag — MAT er eneste kilde. |
| Fredning | BBR byg070 + DAI WFS FREDEDE_BYGNINGER | Komplementære — BBR er BBR-registrering, DAI WFS er spatial kilde. |
| Skovbyggelinje | DAI WFS kun | Ikke i MAT — DAI er eneste kilde (300 m fra offentlig skov). |
| Søbeskyttelse, Åbeskyttelse | DAI WFS kun | Ikke i nogen anden kilde. |
