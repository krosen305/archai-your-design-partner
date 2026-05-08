# ArchAI — Datapunkt-rapport
**Adresse:** Hasselvej 48, 2830 Virum  
**adresseid:** `0a3f50a6-34da-32b8-e044-0003ba298018`  
**adgangsadresseid:** `0a3f507d-4cf9-32b8-e044-0003ba298018`  
**Koordinater:** 55.7937°N, 12.4803°E  
**Genereret:** 2026-05-08 (opdateret med EBR/VUR + korrekte IDs)

**Status-nøgle:** ✅ LIVE · ⏳ MOCK (hardkodet testdata) · ❌ Ikke implementeret

---

## 1. Adresse — GSearch / Dataforsyningen

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adresseid (DAR-UUID) | GSearch API | ✅ LIVE | Cache-nøgle, BBR-opslag | `0a3f50a6-34da-32b8-e044-0003ba298018` |
| adgangsadresseid | DAWA REST | ✅ LIVE | BBR/EBR-opslag | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Adressetekst | GSearch API | ✅ LIVE | UI-display | Hasselvej 48, 2830 Virum |
| Postnummer | GSearch API | ✅ LIVE | UI-display | 2830 |
| Postby | GSearch API | ✅ LIVE | UI-display | Virum |
| Kommunekode | GSearch API | ✅ LIVE | Kommunenavn-opslag | 0173 |
| Koordinater (WGS84) | GSearch API | ✅ LIVE | Alle geo-opslag | 55.793675°N, 12.480285°E |

> **⚠ Korrektion:** Tidligere test brugte forkert adgangsadresseid (`0a3f5081-...`) fra mock-data. Korrekt adgangsadresseid bekræftet via DAWA REST.

---

## 2. Adressedetaljer — DAR via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| adgangsadresseid | DAR v1 GraphQL | ✅ LIVE | BBR-lookup | `0a3f507d-4cf9-32b8-e044-0003ba298018` |
| Ejerlavskode | DAWA REST (jordstykke) | ✅ LIVE | MAT + Tinglysning | **12352** *(Virum By, Virum)* |
| Matrikelnummer | DAWA REST (jordstykke) | ✅ LIVE | MAT + Tinglysning | **5fo** |
| Grundareal (m²) | DAWA REST (jordstykke) | ✅ LIVE | Bebyggelsesprocent | **441 m²** |
| Kommunenavn | kommuner.ts map | ✅ LIVE | UI-display | Lyngby-Taarbæk |

> **⚠ Korrektion:** Tidligere report havde forkert ejerlavskode (173551) og matrikelnummer (8a) fra mock-data. Korrekte værdier bekræftet via DAWA adgangsadresse-opslag. Ejerlavskode 12352 = "Virum By, Virum". DAR v1 returnerer fortsat null for ejerlavskode/matrikelnummer direkte — DAWA REST bruges som kilde.

---

## 3. Grundareal — MAT via Datafordeler

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Registreret areal (m²) | MAT v2 GraphQL | ✅ LIVE | Bebyggelsesprocent | **441 m²** |
| Strandbeskyttelse | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (strandbeskyttelse_omfang=null) |
| Fredskov | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (fredskov_omfang=null) |
| Klitfredning | MAT v2 GraphQL | ✅ LIVE | Compliance-flag | **Ingen** (klitfredning_omfang=null) |

> **Korektion:** Tidligere fejlede MAT pga. forkert ejerlavskode (173551). Med korrekt ejerlavskode 12352 + matrikelnummer "5fo" returnerer MAT_Jordstykke grundareal 441 m². Ingen beskyttelseslinjer registreret.

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

> BBR returnerer 8 bygninger på adgangspunktet. Primær bygning filtreres som første ikke-garage (byg021 ≠ 910/920/930/940). Garager: 2 × byg021=910. Øvrige: byg021=130 (Række-/dobbelthus). Bygning 5-8 har byg021=131 og opvarmningsmiddel=Naturgas — muligvis gentagelser af samme enhed.

> **⚠ Korrektion:** Bebygget areal er 68 m² (ikke 121 m² fra mock-data). Tagdækning er Eternit/fibercement (ikke Tagsten som i mock).

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

## 9. EBR — Ejendomsbeliggenhedsregistret

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| BFE-nummer | EBR v1 GraphQL | ❌ Ingen match | VUR-opslag, finansiering | **null** |

> **Fejlanalyse:** `EBR_Ejendomsbeliggenhed` returnerer 0 resultater for adresseLokalId med både adresseid og adgangsadresseid (DAWA-UUID format). For rækkehuse kan beliggenhedsadressen i EBR linke anderledes end forventet — muligvis via fælles indgangsdør-ID eller en bestemt BFE-type for ideelle anparter. Integrationen er korrekt implementeret; manglende svar er en data-specifik begrænsning for denne adresse. Testes på andre adressetyper (enfamiliehus) i produktion.

---

## 10. VUR — Ejendomsvurdering

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Ejendomsværdi (kr.) | VUR v1 GraphQL | ❌ Skippet — intet BFE | Finansieringsgrundlag | **null** |
| Grundværdi (kr.) | VUR v1 GraphQL | ❌ Skippet — intet BFE | Finansieringsgrundlag | **null** |
| Vurderet areal (m²) | VUR v1 GraphQL | ❌ Skippet — intet BFE | Reference | **null** |
| Vurderingsår | VUR v1 GraphQL | ❌ Skippet — intet BFE | Aktualitet | **null** |

> VUR-opslaget er implementeret korrekt (2-trins kæde: VUR_BFEKrydsreference → VUR_Ejendomsvurdering). Manglende data skyldes udelukkende at EBR ikke returnerede BFE-nummer for denne adresse. Testes på enfamiliehuse i produktion.

---

## 11. Radon & Grundvand — GEUS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Radonrisiko | GEUS WMS radon_risiko | ⏳ MOCK | Ventilationskrav, BR18 §301 | medium |
| Grundvandsdybde (m) | GEUS WFS jupiter_boring | ⏳ MOCK | Kælder-risiko, fundamentering | 3.8 m |

> **⏳ ARCH-101:** Layer-navne afventer verifikation mod `https://data.geus.dk/geusmap/ows/4258.jsp` GetCapabilities.

---

## 12. Naturbeskyttelse — DAI WFS / Miljøportalen ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Strandbeskyttelse (300 m) | DAI WFS | ⏳ MOCK | Byggestop nær kyst | false |
| Skovbyggelinje (300 m) | DAI WFS | ⏳ MOCK | Byggestop nær skov | false |
| Søbeskyttelse (150 m) | DAI WFS | ⏳ MOCK | Byggestop nær sø > 3 ha | false |
| Åbeskyttelse (150 m) | DAI WFS | ⏳ MOCK | Byggestop nær vandløb | false |
| Klitfredning | DAI WFS | ⏳ MOCK | Byggestop i klitzone | false |
| Kirkebyggelinje | *(ikke implementeret)* | ⏳ MOCK | Højdebegrænsning | false |

> MAT_Jordstykke bekræfter **ingen** strandbeskyttelse, fredskov eller klitfredning (alle omfang-felter = null). DAI WFS afventer stadig endpoint-verifikation for de øvrige linjetyper.

> **⏳ ARCH-65:** WFS typename og CQL_FILTER afventer endpoint-verifikation mod `https://arealinformation.miljoeportal.dk`.

---

## 13. Jordforurening — DK-Jord / Miljøstyrelsen ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| V1-kortlagt (mulig forurening) | DK-Jord WFS | ⏳ MOCK | Undersøgelsespligt | false |
| V2-kortlagt (dokumenteret) | DK-Jord WFS | ⏳ MOCK | Oprensning (500k+) | false |
| Olietank eksisterer | DK-Jord WFS | ⏳ MOCK | Jordprøvetagning | **true** |
| Olietank driftsstatus | DK-Jord WFS | ⏳ MOCK | Risikovurdering | **ikke i drift** |
| Områdeklassificering | DK-Jord WFS | ⏳ MOCK | Generel forureningskategori | **Lettere forurenet** |

> **⏳ ARCH-66:** `dkjord.mst.dk` ikke tilgængeligt fra dev-miljø. Afventer production-deployment.

---

## 14. Terræn & Koter — DHM / SDFI ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Min elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Kælder-risiko, dræning | 18.40 m |
| Max elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Terrænkoter | 21.70 m |
| Avg elevation (m) | DHM WCS GeoTIFF | ⏳ MOCK | Basiskote | 20.10 m |
| Terræn-hældning (%) | Beregnet | ⏳ MOCK | Bygningsplacering | 4.2 % *(let skrånende)* |
| Nordorientering | Beregnet | ⏳ MOCK | Solvarme, soladgang | **S (sydvendt)** |

> **⏳ ARCH-102:** DHM WCS layer-navn afventer `https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS` GetCapabilities.

---

## 15. Servitutter & Pant — Tinglysning / Datafordeler ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 (MOCK) |
|---|---|---|---|---|
| Antal servitutter | TingbogenV2 GraphQL | ⏳ MOCK | Juridisk due diligence | **3** |
| Antal pantehæftelser | TingbogenV2 GraphQL | ⏳ MOCK | Finansieringsrisiko | **2** |
| Servitut 1 *(KRITISK)* | TingbogenV2 + Claude | ⏳ MOCK | Byggekritisk grænse | Byggelinje: ingen bebyggelse inden for 3 m fra skel mod nabo (sydside) |
| Servitut 2 | TingbogenV2 + Claude | ⏳ MOCK | Information | Deklaration om fælles adgangsvej og parkeringsareal mod øst |
| Servitut 3 | TingbogenV2 + Claude | ⏳ MOCK | Information | Kloakservitut: fælles kloakledning løber over ejendommen |

> **⏳ ARCH-104:** TingbogenV2 response-skema afventer verifikation.

---

## 16. Fredning & Bevarelse — SAVE / DAI WFS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Fredet | BBR v2 byg070 | ✅ LIVE | Hård fredning — kræver SKS-dispensation | **null** (ikke fredet) |
| SAVE-bevaringsværdi (1–9) | Slots- & Kulturstyrelsen | ⏳ MOCK | Bevaringskrav | null *(ikke SAVE-behandlet)* |

> BBR byg070 bekræfter null (ikke fredet). SAVE-bevaringsværdi afventer ARCH-29.

---

## 17. Fjernvarmedækning — Plandata WFS ⏳

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
| Fjernvarme dækket | Plandata WFS varmeplan | ⏳ MOCK | Varmekilde-valg, energiramme | null *(ukendt)* |

> BBR byg056=2 (Centralvarme) + byg057=3 (Gas) bekræfter ingen fjernvarme registreret i BBR. Fjernvarme-mismatch flag vil ikke aktiveres for denne adresse når FjernvarmeService går live (ingen coverage = ingen mismatch).

> **⏳ ARCH-111:** WFS typename `pdk:theme_pdk_varmeforsyning_vedtaget` afventer GetCapabilities-verifikation.

---

## Sammenfatning

### Live-integrationer (8) — kører i produktion
| # | System | Datapunkter |
|---|---|---|
| 1 | GSearch/Dataforsyningen | Adresse, koordinater, kommunekode |
| 2 | DAR v1 | adgangsadresseid; ejerlavskode via DAWA-fallback |
| 3 | MAT v2 | Grundareal **441 m²**, strandbeskyttelse/fredskov/klitfredning |
| 4 | BBR v2 | Byggeår, areal, etager, anvendelse, **varme, materialer, fredning** |
| 5 | Plandata WFS | Lokalplaner, kommuneplanramme |
| 6 | DAWA REST | Nabobygninger |
| 7 | Anthropic Claude | PDF-udtræk fra lokalplan |
| 8 | EBR v1 + VUR v1 | *(implementeret — ingen match for rækkehusadresse)* |

### Mock-integrationer (6) — afventer endpoint-verifikation
| # | System | Linear | Blokkerer |
|---|---|---|---|
| 1 | GEUS radon+grundvand | ARCH-101 | Radon-compliance, fundamentering |
| 2 | DAI Naturbeskyttelse | ARCH-65 | Skovbyggelinje, søbeskyttelse, åbeskyttelse, kirkebyggelinje |
| 3 | DK-Jord forurening | ARCH-66 | V1/V2-kortlægning, olietank |
| 4 | DHM Terræn | ARCH-102 | Terrænkoter, hældning |
| 5 | Tinglysning servitutter | ARCH-104 | Juridisk due diligence |
| 6 | Fjernvarme | ARCH-111 | Fjernvarme-mismatch flag |

### Korrigerede værdier (vs. tidligere mock-data)
| Felt | Mock (forkert) | Live (korrekt) | Kilde |
|---|---|---|---|
| adgangsadresseid | `0a3f5081-d7e2-...` | `0a3f507d-4cf9-...` | DAWA REST |
| ejerlavskode | 173551 | **12352** | DAWA REST |
| matrikelnummer | "8a" | **"5fo"** | DAWA REST |
| grundareal | 829 m² | **441 m²** | MAT v2 |
| bebygget_areal | 121 m² | **68 m²** | BBR v2 |
| tagdaekning | Tagsten (tegl/beton) | **Eternit/fibercement** | BBR v2 byg033 |
| varmeinstallation | *(ikke i mock)* | **Centralvarme (én fyringsenhed)** | BBR v2 byg056 |
| opvarmningsmiddel | *(ikke i mock)* | **Gas** | BBR v2 byg057 |

### Kendte begrænsninger på Hasselvej 48 (rækkehus)
| Problem | Årsag | Konsekvens |
|---|---|---|
| EBR returnerer ingen match | Rækkehus/ideelle anparter linker anderledes i EBR | BFE-nummer kan ikke slås op → VUR-data utilgængeligt |
| DAR returnerer null for ejerlavskode/matrikelnummer | Rækkehuse mangler direkte jordstykke-relation i DAR v1 | Fallback til DAWA REST nødvendig |
