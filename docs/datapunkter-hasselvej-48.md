# ArchAI — Datapunkt-rapport
**Adresse:** Hasselvej 48, 2830 Virum  
**adresseid:** `0a3f50a6-34da-32b8-e044-0003ba298018`  
**Koordinater:** 55.7937°N, 12.4803°E  
**Genereret:** 2026-05-08

**Status-nøgle:** ✅ LIVE · ⏳ MOCK (hardkodet testdata) · ❌ Ikke implementeret

---

## 1. Adresse — GSearch / Dataforsyningen

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adresseid (DAR-UUID) | GSearch API | ✅ LIVE | Cache-nøgle, BBR-opslag | `0a3f50a6-34da-32b8-e044-0003ba298018` |
| Adressetekst | GSearch API | ✅ LIVE | UI-display | Hasselvej 48, 2830 Virum |
| Postnummer | GSearch API | ✅ LIVE | UI-display | 2830 |
| Postby | GSearch API | ✅ LIVE | UI-display | Virum |
| Kommunekode | GSearch API | ✅ LIVE | Kommunenavn-opslag | 0173 |
| Koordinater (WGS84) | GSearch API | ✅ LIVE | Alle geo-opslag | 55.793675°N, 12.480285°E |
| adgangsadresseid | GSearch API | ✅ LIVE | BBR-opslag | *(tom — falder tilbage på adresseid)* |

---

## 2. Adressedetaljer — DAR via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adgangsadresseid | DAR v1 GraphQL | ✅ LIVE | BBR-lookup | null ⚠ |
| Ejerlavskode | DAR v1 GraphQL | ✅ LIVE | MAT + Tinglysning | null ⚠ *(kendes: 173551)* |
| Matrikelnummer | DAR v1 GraphQL | ✅ LIVE | MAT + Tinglysning | null ⚠ *(kendes: 6h)* |
| Grundareal (m²) | DAR v1 GraphQL | ✅ LIVE | Bebyggelsesprocent | null ⚠ |
| Kommunenavn | kommuner.ts map | ✅ LIVE | UI-display | Lyngby-Taarbæk |

> **⚠ Udestående:** DAR returnerer null for ejerlavskode/matrikelnummer på rækkehuse. Adressen er klassificeret som Række-, kæde- eller dobbelthus (BBR-kode 130) og har ikke direkte jordstykke-relation i DAR v1-schema. MAT og Tinglysning kan ikke opslås automatisk.

---

## 3. Grundareal — MAT via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Registreret areal (m²) | MAT v2 GraphQL | ✅ LIVE | Bebyggelsesprocent | null ⚠ |

> **⚠ Udestående:** MAT_Ejerlav ikke fundet for ejerlavskode 173551. Grundareal kan ikke hentes → bebyggelsesprocent kan ikke beregnes.

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
| Grundareal (m²) | BBR/MAT | ✅ LIVE | Bebyggelsesprocent | null ⚠ |
| Bebyggelsesprocent | Beregnet | ✅ LIVE | Compliance-flag | null ⚠ |
| Beregning mulig | BBR | ✅ LIVE | UI-indikator | **false** |

> **⚠ Udestående:** `beregning_mulig = false` pga. manglende grundareal. UI viser "DATA UFULDSTÆNDIG" i stedet for bebyggelsesprocent. Fejlmelding: *"Grundareal ikke tilgængeligt – bebyggelsesprocent kan ikke beregnes"*.

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

## 7. Lokalplan PDF-udtræk — Anthropic Claude Sonnet 4.6

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Max etager | Claude Sonnet 4.6 | ✅ LIVE | AI-validering vs. BBR | *(kræver live app-kald)* |
| Max bebyggelsesprocent | Claude Sonnet 4.6 | ✅ LIVE | AI-validering vs. BBR | *(kræver live app-kald)* |
| Tagform | Claude Sonnet 4.6 | ✅ LIVE | Arkitektonisk compliance | *(kræver live app-kald)* |
| Facadematerialer | Claude Sonnet 4.6 | ✅ LIVE | Materialkrav | *(kræver live app-kald)* |
| Byggelinjer (m fra skel) | Claude Sonnet 4.6 | ✅ LIVE | Afstandskrav | *(kræver live app-kald)* |
| Særlige bestemmelser | Claude Sonnet 4.6 | ✅ LIVE | Uforudsete restriktioner | *(kræver live app-kald)* |
| PDF-kilde | — | — | — | [Lokalplan 198 PDF](https://dokument.plandata.dk/20_1024788_APPROVED_1183979047629.pdf) |

> Resultat caches i Supabase `address_analysis`-tabellen. Regex-fallback forsøges først (0 tokens).

---

## 8. Nabobygninger — DAWA REST API

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Antal naboer inden for 40 m | DAWA REST | ✅ LIVE | Tæthed, skel-afstand | **8 bygninger** |
| Nærmeste nabo (m) | DAWA REST | ✅ LIVE | Servitut-afstand, privathed | **7.0 m** |
| Nabo 1 | DAWA REST | ✅ LIVE | — | Hasselvej 46 — 7.0 m |
| Nabo 2 | DAWA REST | ✅ LIVE | — | Hasselvej 44 — 15.0 m |
| Nabo 3 | DAWA REST | ✅ LIVE | — | Hasselvej 50 — 17.0 m |
| Nabo 4 | DAWA REST | ✅ LIVE | — | Hasselvej 51 — 27.0 m |
| Nabo 5 | DAWA REST | ✅ LIVE | — | Hasselvej 53 — 30.0 m |
| Nabo 6-8 | DAWA REST | ✅ LIVE | — | *(yderligere 3 inden for 40 m)* |

---

## 9. Radon & Grundvand — GEUS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Radonrisiko | GEUS WMS radon_risiko | ⏳ MOCK | Ventilationskrav, BR18 §301 | medium |
| Grundvandsdybde (m) | GEUS WFS jupiter_boring | ⏳ MOCK | Kælder-risiko, fundamentering | 3.8 m |

> **⏳ ARCH-101:** Layer-navne afventer verifikation mod `https://data.geus.dk/geusmap/ows/4258.jsp` GetCapabilities.

---

## 10. Naturbeskyttelse — DAI WFS / Miljøportalen ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Strandbeskyttelse (300 m) | DAI WFS | ⏳ MOCK | Byggestop nær kyst | false |
| Skovbyggelinje (300 m) | DAI WFS | ⏳ MOCK | Byggestop nær skov | false |
| Søbeskyttelse (150 m) | DAI WFS | ⏳ MOCK | Byggestop nær sø > 3 ha | false |
| Åbeskyttelse (150 m) | DAI WFS | ⏳ MOCK | Byggestop nær vandløb | false |
| Klitfredning | DAI WFS | ⏳ MOCK | Byggestop i klitzone | false |
| Kirkebyggelinje | *(ikke implementeret)* | ⏳ MOCK | Højdebegrænsning | false |

> **⏳ ARCH-65:** WFS typename og CQL_FILTER afventer endpoint-verifikation mod `https://arealinformation.miljoeportal.dk`.

---

## 11. Jordforurening — DK-Jord / Miljøstyrelsen ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| V1-kortlagt (mulig forurening) | DK-Jord WFS | ⏳ MOCK | Undersøgelsespligt | false |
| V2-kortlagt (dokumenteret) | DK-Jord WFS | ⏳ MOCK | Oprensning (500k+) | false |
| Olietank eksisterer | DK-Jord WFS | ⏳ MOCK | Jordprøvetagning | **true** |
| Olietank driftsstatus | DK-Jord WFS | ⏳ MOCK | Risikovurdering | **ikke i drift** |
| Områdeklassificering | DK-Jord WFS | ⏳ MOCK | Generel forureningskategori | **Lettere forurenet** |

> **⏳ ARCH-66:** `dkjord.mst.dk` ikke tilgængeligt fra dev-miljø. Afventer production-deployment.

---

## 12. Terræn & Koter — DHM / SDFI ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Min elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Kælder-risiko, dræning | 18.40 m |
| Max elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Terrænkoter | 21.70 m |
| Avg elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Basiskote | 20.10 m |
| Terræn-hældning (%) | Beregnet | ⏳ MOCK | Bygningsplacering | 4.2 % *(let skrånende)* |
| Nordorientering | Beregnet | ⏳ MOCK | Solvarme, soladgang | **S (sydvendt)** |

> **⏳ ARCH-102:** DHM WCS layer-navn afventer `https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS` GetCapabilities.

---

## 13. Servitutter & Pant — Tinglysning / Datafordeler ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Antal servitutter | TingbogenV2 GraphQL | ⏳ MOCK | Juridisk due diligence | **3** |
| Antal pantehæftelser | TingbogenV2 GraphQL | ⏳ MOCK | Finansieringsrisiko | **2** |
| Servitut 1 *(KRITISK)* | TingbogenV2 + Claude | ⏳ MOCK | Byggekritisk grænse | Byggelinje: ingen bebyggelse inden for 3 m fra skel mod nabo (sydside) |
| Servitut 2 | TingbogenV2 + Claude | ⏳ MOCK | Information | Deklaration om fælles adgangsvej og parkeringsareal mod øst |
| Servitut 3 | TingbogenV2 + Claude | ⏳ MOCK | Information | Kloakservitut: fælles kloakledning løber over ejendommen |

> **⏳ ARCH-104:** TingbogenV2 response-skema afventer verifikation. Feltnavn `TingbogenDokument` vs. `Tinglysningsdokument` ubekræftet.

---

## 14. Fredning & Bevarelse — SAVE / DAI WFS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Fredet | DAI WFS FREDEDE_BYGNINGER | ⏳ MOCK | Hård fredning — kræver SKS-dispensation | false |
| SAVE-bevaringsværdi (1–9) | Slots- & Kulturstyrelsen | ⏳ MOCK | Bevaringskrav | null *(ikke SAVE-behandlet)* |

> **⏳ ARCH-29:** DAI WFS typename og Kulturmiljøregister-endpoint afventer verifikation.

---

## 15. Fjernvarmedækning — Plandata WFS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Fjernvarme dækket | Plandata WFS varmeplan | ⏳ MOCK | Varmekilde-valg, energiramme | null *(ukendt)* |

> **⏳ ARCH-111:** WFS typename `pdk:theme_pdk_varmeforsyning_vedtaget` afventer GetCapabilities-verifikation.

---

## Sammenfatning

### Live-integrationer (7) — kører i produktion
| # | System | Datapunkter |
|---|---|---|
| 1 | GSearch/Dataforsyningen | Adresse, koordinater, kommunekode |
| 2 | DAR v1 | Ejerlavskode, matrikelnummer, grundareal *(med rækkehus-limitation)* |
| 3 | MAT v2 | Grundareal *(fejler for denne adresse)* |
| 4 | BBR v2 | Byggeår, areal, etager, anvendelse |
| 5 | Plandata WFS | Lokalplaner, kommuneplanramme |
| 6 | DAWA REST | Nabobygninger |
| 7 | Anthropic Claude | PDF-udtræk fra lokalplan |

### Mock-integrationer (7) — afventer endpoint-verifikation
| # | System | Linear | Blokkerer |
|---|---|---|---|
| 1 | GEUS radon+grundvand | ARCH-101 | Radon-compliance, fundamentering |
| 2 | DAI Naturbeskyttelse | ARCH-65 | Strandbeskyttelse, skovbyggelinje osv. |
| 3 | DK-Jord forurening | ARCH-66 | V1/V2-kortlægning, olietank |
| 4 | DHM Terræn | ARCH-102 | Terrænkoter, hældning |
| 5 | Tinglysning servitutter | ARCH-104 | Juridisk due diligence |
| 6 | SAVE fredning | ARCH-29 | Fredning, bevaringsværdi |
| 7 | Fjernvarme | ARCH-111 | Varmekilde-valg |

### Kendte datafejl på Hasselvej 48 (rækkehus-adresse)
| Problem | Årsag | Konsekvens |
|---|---|---|
| DAR returnerer null for ejerlavskode/matrikelnummer | Rækkehuse har ikke altid direkte jordstykke i DAR v1 | MAT og Tinglysning kan ikke opslås |
| MAT-opslag fejler (ejerlavskode 173551) | Muligvis nyere skema-mapping | Grundareal = null |
| Bebyggelsesprocent = null | Manglende grundareal | UI viser "DATA UFULDSTÆNDIG" |
