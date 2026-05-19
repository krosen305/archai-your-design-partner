# Offentlige datakilder og gap-analyse

Dato: 2026-05-19  
Scope: køb af grund/ejendom, nedrivning af eksisterende hus og opførelse af nyt enfamiliehus i Danmark.  
Krav: prioriter gratis tilgængelige kilder. Kilder der ikke er gratis eller ikke har realistisk programmatisk adgang nævnes kun som gap/manuel kontrol.
Status: aktuel gap-analyse, ikke en implementeringsplan. konkrete opgaver styres i Linear, og integrationsstatus styres i `docs/INTEGRATIONS.md`.

## Executive summary

ArchAI har allerede en stærk kerne: DAR, BBR, MAT, EBR/VUR, Plandata, FBB, DAI-naturbeskyttelse og fjernvarme er helt eller delvist integreret. De største huller i dag er ikke "flere BBR-felter", men de risikodata der gør pre-purchase due diligence skarp: jordforurening, hydrologi/oversvømmelse, terræn, servitutter, vej/adgang, nabo-/skelgeometri, bredbånd/forsyning og udvidede plan-/beskyttelseslag.

Højeste prioritet:

1. Gør DK-Jord, GEUS/HIP og DHM live i stedet for mock.
2. Erstat deaktiveret DAWA-naboopslag med Datafordeler/GeoDanmark/BBR-geometri.
3. Udvid Plandata fra lokalplan/kommuneplan/fjernvarme til zonekort, landzonetilladelser, byggefelter, spildevandsplaner, varmeplaner og kommuneplanretningslinjer.
4. Udvid Arealdata/DAI-lag fra de nuværende fem naturbeskyttelseslag til §3-natur, Natura 2000, fredninger, fortidsminder, beskyttede sten- og jorddiger, drikkevandsinteresser, BNBO, råstofområder og støj-/miljølag.
5. Tilføj Tjekditnet bredbåndsdata, EMOData energimærke og en manuel/semiautomatisk Tingbogsproces.

## Nuværende datadækning i ArchAI

Kilde: `docs/INTEGRATIONS.md`, `docs/datapunkt-bibel-api-kald.md`, `src/lib/analysis-orchestrator.ts`, `src/lib/project-store.ts`.

| Område                    | Status i dag | Hvad vi har                                                                                 |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| Adresse og nøgler         | Live         | DAR-adresse, adgangsadresseid, koordinater, ejerlavskode, matrikelnummer, grundareal        |
| Eksisterende bygninger    | Live         | BBR bygninger, arealer, etager, anvendelse, byggeår, materialer, varme, fredningsflag       |
| Matrikel                  | Live         | MAT grundareal, strandbeskyttelse, fredskov, klitfredning                                   |
| Planforhold               | Live         | Plandata lokalplaner, plandokumentlink, kommuneplanramme, bebyggelsesprocent, etager, højde |
| Vurdering                 | Live         | EBR BFE-nr og VUR ejendoms-/grundværdi                                                      |
| Kulturarv                 | Live         | FBB/SAVE og fredningsstatus via Kulturarv/FBB                                               |
| Naturbeskyttelse          | Live, smal   | DAI WFS for strand-, skov-, sø-, åbeskyttelse og klitfredning                               |
| Fjernvarme                | Live         | Plandata varmeplansområde                                                                   |
| Lokalplan PDF-regler      | Live via AI  | PDF-udtræk fra Plandata dokumentlink                                                        |
| Jordforurening            | Mock         | DK-Jord V1/V2/olietank/områdeklassificering modeleret, men ikke live                        |
| Geoteknik/radon/grundvand | Mock         | GEUS-risiko modeleret, men ikke live                                                        |
| Terræn                    | Mock         | DHM WCS modeleret, men ikke live                                                            |
| Servitutter               | Mock         | Tingbog/servitutter ikke live; kræver manuel eller lukket/adgangsstyret kilde               |
| Nabobygninger             | Deaktiveret  | DAWA er forbudt; naboopslag returnerer ikke live                                            |
| Bredbånd/fiber            | Mangler      | Tjekditnet ikke integreret                                                                  |
| Støj/klima/kyst           | Mangler      | Ingen støjkort, KAMP/HIP, Kystplanlægger eller DMI Klimaatlas integration                   |

## Fuld kildeliste

### 1. Identitet, adresse, matrikel og geometri

| Kilde                                               | Gratis?                                                           | Relevant data                                                                                  | Brug i ArchAI                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Datafordeler DAR                                    | Ja, nogle tjenester uden bruger; GraphQL/API-key for moderne flow | Adresse, adgangsadresseid, husnummer, koordinater, postnummer, kommune, adressepunkt           | Allerede live. Kritisk startnøgle.                                                  |
| Datafordeler MAT/Matriklen2                         | Ja med Datafordeler-adgang                                        | Jordstykke, ejerlav, matrikelnummer, areal, skel, matrikulære temaflader, strand/fredskov/klit | Delvist live. Tilføj parcelpolygon/geometri som SSOT for skelafstande.              |
| Datafordeler EBR                                    | Ja med adgang                                                     | BFE-nr, ejendomsbeliggenhed, relation adresse -> bestemt fast ejendom                          | Allerede live via BFE.                                                              |
| GeoDanmark Vektor                                   | Ja, frie geografiske data med Datafordeler-adgang                 | Bygningspolygoner, veje, vandløb/søer, tekniske anlæg, topografi                               | Mangler. Brug til naboer, afstande, adgangsvej, visuel kontekst og DAWA-erstatning. |
| DHM/Danmarks Højdemodel                             | Ja med API-key/OAuth                                              | Terræn/overflade, hældning, lavninger, koteforhold                                             | Mock i dag. Bør gøres live.                                                         |
| Skråfoto/ortofoto/topokort fra SDFI/Dataforsyningen | Gratis/åbne korttjenester, men vilkår varierer                    | Visuel due diligence, tagflader, terræn, nabokontekst                                          | Mangler. Nyttigt som kortlag, ikke nødvendigvis SSOT.                               |

### 2. Ejendom, økonomi og ejerforhold

| Kilde                                                             | Gratis?                                                                             | Relevant data                                                                             | Brug i ArchAI                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Datafordeler VUR                                                  | Gratis data, men adgang kræver anmodning hos Vurderingsstyrelsen                    | Offentlig ejendoms- og grundvurdering, vurderingsår                                       | Live i dag. Brug som økonomikontekst, ikke markedsværdi.                                             |
| Datafordeler EJF/Ejerfortegnelsen                                 | Frie grunddata på niveau 1, men kræver stærk adgang/token/certifikat                | Ikke-fortrolige ejer-/administratoroplysninger                                            | Mangler. Lav kun hvis juridisk/adgangsmæssigt nødvendigt.                                            |
| Tingbogen/tinglysning.dk                                          | Gratis manuel adgang med login; programmatisk API er ikke frit/offentligt i praksis | Adkomst, hæftelser, servitutter, byrder, vejret, byggelinjer, privatretlige begrænsninger | Mock i dag. Bør være manuel/semiautomatisk checkliste + dokumentupload, ikke automatisk afhængighed. |
| OIS/kommunale ejendomsoplysninger                                 | Delvist offentligt, men API/adgang varierer                                         | Ejendomsskat, ejendomsoplysninger, historik                                               | Ikke prioriteret hvis VUR/BBR/MAT dækker kernebehov.                                                 |
| Kommercielle salgsdata (Boliga, Boligsiden, DinGeo, ReData, etc.) | Typisk ikke frit til API/kommerciel brug                                            | Handelspriser, liggetid, markedsbenchmarks                                                | Nævn som ikke-gratis. Gå videre.                                                                     |

### 3. Eksisterende bygning og nedrivningsrisiko

| Kilde                                     | Gratis?                                                                             | Relevant data                                                                                              | Brug i ArchAI                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Datafordeler BBR GraphQL                  | Ja med Datafordeler API-key/OAuth                                                   | Byggeår, arealer, etager, anvendelse, tekniske anlæg, varme, tag/ydervæg, olietanke, afløb, installationer | Live, men udvid med olietanke/tekniske anlæg/afløb hvis ikke allerede med i BBR-query. |
| FBB/Fredede og Bevaringsværdige Bygninger | Gratis web/WFS i dag; FBB ændres medio 2026                                         | Fredning, SAVE, bygningskultur, bevaringsværdi                                                             | Live. Kritisk at lave transitionsplan til GeoFA for bevaringsværdige bygninger.        |
| GeoFA bevaringsværdige bygninger          | På vej, gratis/offentlig forventning                                                | Fremtidig kommunal database for bevaringsværdige bygninger efter FBB-ændring                               | Gap. Skal overvåges og designes ind som ny kilde.                                      |
| EMOData/Energimærkningsregisteret         | Gratis/tilgængelig efter forespørgsel til Energistyrelsen; Tjek Energimærke manuelt | Energimærke, rapport, forslag, gyldighed, energiforbrug                                                    | Mangler. Relevant ved køb og ved "renover vs rive ned".                                |
| Kommunale byggesagsarkiver/Weblager       | Ofte gratis manuelt, ingen national standard/API                                    | Tegninger, tidligere tilladelser, ulovlige forhold, statik, kloaktegninger                                 | Mangler. Lav kommune-deep-link/checkliste, ikke generel API først.                     |
| Byggeskadefond/tilstandsrapport/elrapport | Ikke fri national API for alle data                                                 | Byggeteknisk risiko                                                                                        | Ikke gratis/API-egnet. Manuel upload hvis bruger har dokumenter.                       |
| Miljøscreening/asbest/PCB/bly             | Ingen national bygningsregisterkilde                                                | Nedrivningsaffald og saneringsrisiko, afledt af byggeår/materialer                                         | Afled heuristik fra BBR + brugerupload; ikke registerdata.                             |

### 4. Plan, zoner og myndighedsrammer

| Kilde                                               | Gratis?                               | Relevant data                                                                                                                                           | Brug i ArchAI                                                                         |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Plandata WFS                                        | Ja, åben WFS                          | Lokalplaner, kommuneplanrammer, retningslinjer, byggefelter, zonekort, landzonetilladelser, spildevandsplaner, varmeforsyningsplaner, udbygningsaftaler | Delvist live. Udvid kraftigt.                                                         |
| Plandata dokumenter                                 | Ja                                    | Lokalplan-PDF, bestemmelser, bilag, kort                                                                                                                | Live via PDF extractor. Udvid med prioritering af lokalplandelområder og byggefelter. |
| BR18/Bygningsreglementet                            | Gratis web                            | Nationale krav: afstand til skel, højde, brand, energi, tilgængelighed, LCA                                                                             | Mangler som struktureret regelkilde. Brug som default når plan mangler.               |
| Fingerplan/landsplandirektiver/nationale interesser | Ja via Plandata/WFS                   | Hovedstadsrestriktioner, kystnærhed, sommerhusområder, nationale interesser                                                                             | Mangler. Relevant især i landzone/kystnærhed.                                         |
| Byg og Miljø                                        | Offentlig selvbetjening, ikke fri API | Ansøgningsflow for nedrivning/byggetilladelse                                                                                                           | Manuel proces/checkliste.                                                             |

### 5. Natur, kulturarv og juridiske beskyttelser

| Kilde                              | Gratis?                    | Relevant data                                                                                                                              | Brug i ArchAI                                         |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Danmarks Miljøportal Arealdata/DAI | Ja, WMS/WFS/WMTS/filudtræk | Over 1000 arealdatasæt: natur, miljø, arealanvendelse, jordtyper, beskyttelser                                                             | Delvist live. Bør være hovedkilde for mange blockers. |
| MAT temaflader                     | Ja med Datafordeler        | Strandbeskyttelse, fredskov, klitfredning på jordstykke                                                                                    | Live, typede Hard Stops.                              |
| DAI naturbeskyttelseslinjer        | Ja                         | Strand-, skov-, sø-, åbeskyttelse, klitfredning                                                                                            | Live for fem lag.                                     |
| DAI udvidede lag                   | Ja                         | §3 natur, Natura 2000, fredninger, habitat/fuglebeskyttelse, kirkebyggelinje, fortidsmindebeskyttelseslinje, beskyttede sten- og jorddiger | Mangler. Høj værdi for due diligence.                 |
| Fund og Fortidsminder WMS/WFS      | Ja                         | Fredede fortidsminder, kulturarvsarealer, arkæologiske fund                                                                                | Mangler. Kritisk ved jordarbejde/nybyg.               |
| GeoFA/friluftsdata                 | Ja/offentligt              | Stier, rekreative arealer, kommunale fagdata                                                                                               | Lavere prioritet, nyttigt for kontekst.               |

### 6. Jord, forurening, geoteknik og grundvand

| Kilde                              | Gratis?                        | Relevant data                                                                       | Brug i ArchAI                                                         |
| ---------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| DK-Jord / Danmarks Miljøportal     | Ja, WFS/WMS; drift kan variere | V1/V2-kortlægning, områdeklassificering, nuancering, jordforureningslokaliteter     | Mock i dag. Skal live.                                                |
| GEUS Jupiter                       | Ja, WMS/WFS/download           | Boringer, jordlag, grundvand, drikkevand, råstof, miljø og geotekniske data         | Mock i dag. Skal live som nærmeste boringer + dybder + jordlag.       |
| HIP                                | Ja, frie data/webservices      | Terrænnært grundvand, vandløb, jordens vandindhold, havvandsstand, historik/fremtid | Mangler. Bedre end simpel GEUS "groundwaterDepth" alene.              |
| GEUS jordartskort/radon            | Gratis data/korttjenester      | Jordart, radonrisiko, geologisk kontekst                                            | Mock/uklart. Bør integreres som risikoscreening.                      |
| DAI drikkevandsinteresser/BNBO/OSD | Ja                             | Særlige drikkevandsinteresser, boringsnære beskyttelsesområder                      | Mangler. Relevant for jordvarme, nedsivning, forurening, tilladelser. |
| Regionale/kommunale jordattester   | Ofte gratis manuelt            | Juridisk attest/status                                                              | Semiautomatisk link/upload, ikke første API-prioritet.                |

### 7. Klima, vand, kyst og terrænrisiko

| Kilde                           | Gratis?                                    | Relevant data                                                                                      | Brug i ArchAI                                                |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| DHM WCS                         | Ja med Datafordeler API-key/OAuth          | Koter, hældning, terrænmodel, overflademodel                                                       | Mock i dag. Skal live.                                       |
| KAMP                            | Gratis offentligt screeningsværktøj        | Skybrud/bluespot, havvand på land, vandløbsoversvømmelse, højt grundvand, påvirkede bygninger/veje | Mangler. Brug enten direkte datalag eller rapport/deep-link. |
| HIP                             | Ja                                         | Grundvand og hydrologiske fremskrivninger                                                          | Mangler. Se ovenfor.                                         |
| DMI Klimaatlas                  | Gratis, API/download, 1x1 km grid          | Fremtidig nedbør, temperatur, vandstand, stormflod, solindstråling, scenarier                      | Mangler. Brug på kommune/gridniveau som risikokontekst.      |
| Kystdirektoratet/Kystplanlægger | Gratis WMS                                 | Oversvømmelsesfare/skade, erosionsfare/skade, kysttekniske forhold, eksisterende anlæg/tilladelser | Mangler. Kritisk for kystnære grunde.                        |
| Kystatlas                       | Gratis visning/download/WMS/WFS ifølge KDI | Kysttyper, erosion, bølger, sedimenttransport                                                      | Mangler.                                                     |

### 8. Forsyning og infrastruktur

| Kilde                          | Gratis?                                                        | Relevant data                                                                                                                | Brug i ArchAI                                                              |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Plandata varmeforsyningsplaner | Ja                                                             | Fjernvarmeområde, varmeplanstatus                                                                                            | Live for fjernvarmedækning. Udvid med planstatus og forsyningsnoter.       |
| Tjekditnet                     | Ja, download/API-funktion uden selskabsnavne                   | Adressebaseret fastnet/mobil bredbånd: teknisk mulige og udbudte hastigheder for fiber, kabel-tv, xDSL, fast trådløst, mobil | Mangler. Vigtigt for købsbeslutning, især landzone.                        |
| Energi Data Service            | Ja                                                             | Markeds-/net-/CO2-/prisdata, ikke direkte adresse->netselskab                                                                | Ikke egnet til adressebaseret tilslutning. Brug kun kontekst.              |
| Eloverblik                     | Gratis for ejer/bruger med samtykke                            | Målepunktsdata og forbrug                                                                                                    | Ikke offentlig due-diligence-kilde. Manuel samtykke/upload.                |
| Evida gasdata                  | Ikke frit; kræver virksomhedsspecifik API-nøgle                | Gasnet/dækning                                                                                                               | Nævn og gå videre.                                                         |
| Vand/spildevand                | Kommunalt/forsyning, ingen national standard                   | Kloakering, separatkloak, nedsivning, stikledninger                                                                          | Plandata spildevandsplaner + kommunale WFS/PDF hvor muligt. Ellers manuel. |
| LER                            | Ikke frit til generel API; kræver forespørgsel/betaling/proces | Ledninger før gravearbejde                                                                                                   | Ikke integrer som gratis kilde. Lav opgave i Building Timeline.            |
| Vejdirektoratet/vejdata        | Delvist åbent                                                  | Trafik, vejstatus, uheld, hastighed, statsveje                                                                               | Mangler. Relevant for adgang, støj, byggepladslogistik.                    |

### 9. Støj, omgivelser og naboforhold

| Kilde                              | Gratis?                                    | Relevant data                                                                 | Brug i ArchAI                                              |
| ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Miljøstyrelsens Støj-Danmarkskort  | Gratis visning, datalag via miljøGIS       | Vej-, bane-, lufthavns- og virksomhedsstøj; dog ikke alle veje/områder        | Mangler. Vigtigt pre-purchase, men med tydelig usikkerhed. |
| GeoDanmark + BBR                   | Ja                                         | Nabobygninger, afstande, bygningstæthed, vand/vej/topografi                   | Mangler som DAWA-erstatning.                               |
| Plandata kommuneplanretningslinjer | Ja                                         | Stilleområder, landskabsinteresser, grønne kiler, trafikanlæg, tekniske anlæg | Mangler.                                                   |
| DAI/Arealdata                      | Ja                                         | Potentielt forurenende virksomheder, natur, landbrug, råstoffer, grundvand    | Delvist/mangler.                                           |
| CVR/P-enheder                      | Ja, men adressematch skal gøres forsigtigt | Nærliggende virksomheder/risikoaktiviteter                                    | Lav prioritet; kan give støj/lugt/forureningsindikator.    |

## Gap-analyse mod ArchAI i dag

| Gap                              | Risiko for bruger                                          | Nuværende status                     | Foreslået løsning                                                      | Prioritet |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- | --------- |
| Jordforurening live              | Oprensning, jordflytning, forsinkelse, finansieringsrisiko | DK-Jord mock                         | Live DK-Jord WFS/DAI-lag + typede felter i `site_constraints`          | P0        |
| Terræn og hydrologi              | Højt grundvand, skybrud, kælder/dræn, fundering            | GEUS/DHM mock, HIP mangler           | DHM + HIP + KAMP-lag; gem screeningsresultat og usikkerhed             | P0        |
| Naboer/skel/afstande uden DAWA   | Forkert placering, skeloverskridelse, nabohøring           | NaboService deaktiveret              | MAT parcelpolygon + GeoDanmark bygningspolygoner + BBR relationer      | P0        |
| Udvidede planlag                 | Landzone, byggefelter, spildevand, zonekort overses        | Kun lokalplan/kommuneplan/fjernvarme | Flere Plandata typenames og typed constraints                          | P0        |
| Servitutter                      | Privatretlige byggestop/vejret/ledningsret overses         | Mock                                 | Manuel Tingbogscheck + upload/extract; evt. ikke-gratis API fravælges  | P0/P1     |
| FBB 2026-transition              | SAVE/bevaringsværdi kan blive ustabil kilde                | FBB live                             | Abstrakt HeritageService med FBB + GeoFA/kommunal fallback             | P1        |
| Energimærke                      | Købs-/renoveringsbeslutning mangler energirapport          | Mangler                              | EMOData/Tjek Energimærke integration eller manuel rapportupload        | P1        |
| Bredbånd/fiber                   | Landzonegrund kan være digitalt ubrugelig/dyr              | Mangler                              | Tjekditnet adgangsadresseid join                                       | P1        |
| Natur/kulturarv ud over 5 linjer | §3, diger, fortidsminder, Natura 2000 overses              | Smal DAI                             | Arealdata lagpakke + stop/warning-regler                               | P1        |
| Kyst/erosion/stormflod           | Kystnær pre-purchase risiko undervurderes                  | Mangler                              | Kystplanlægger/Kystatlas + DMI Klimaatlas                              | P1        |
| Støj                             | Boligkomfort/værdi og planbegrænsninger overses            | Mangler                              | Miljøstyrelsens støjkort + kommunale planlag, tydelig dækningsadvarsel | P2        |
| Forsyning vand/kloak/el/gas      | Tilslutningsudgifter og tidsplan undervurderes             | Fjernvarme live, øvrigt mangler      | Plandata spildevand + Tjekditnet + manuelle tasks for LER/forsyninger  | P2        |
| Byggesagsarkiv                   | Gamle tegninger/tilladelser/ulovlige forhold overses       | Mangler                              | Kommune-link katalog + brugerupload + AI-ekstrakt                      | P2        |

## Datamodel-huller

`site_constraints` dækker i dag planhøjde/etager/bebyggelsesprocent, SAVE/fredning, strand/fredskov/klit og en generisk `soil_contamination_status`. For at undgå JSONB-sump bør næste bølge være typed columns eller tilhørende typed tabeller:

- `jordforurening_v1`, `jordforurening_v2`, `omraadeklassificering`, `jordforurening_nuancering`
- `grundvand_depth_winter_m`, `grundvand_depth_summer_m`, `grundvand_model_uncertainty_m`
- `terrain_slope_pct`, `terrain_low_point_m`, `bluespot_rain_mm`, `flood_risk_source`
- `zone_type` (`byzone`, `landzone`, `sommerhusomraade`)
- `landzone_permit_required`
- `lokalplan_byggefelt_present`, `within_building_field`
- `spildevand_status`, `kloakopland_type`, `nedsivning_restricted`
- `natura2000`, `paragraph3_nature`, `protected_dige`, `fortidsminde`, `fortidsminde_buffer`
- `noise_road_lden_db`, `noise_rail_lden_db`, `noise_air_lden_db`
- `broadband_fiber_down_mbit`, `broadband_cable_down_mbit`, `broadband_mobile_5g_down_mbit`

## Anbefalet implementeringsrækkefølge

1. **Matriklen datakvalitet**: parcelpolygon, skelafstande, GeoDanmark bygninger og DAWA-fri naboanalyse.
2. **Miljørisiko**: DK-Jord live + typed `site_constraints` felter.
3. **Vand/terræn**: DHM live, HIP/KAMP screeningslag, simple risk scores.
4. **Plandata expansion**: zonekort, landzonetilladelser, byggefelter, spildevand, planretningslinjer.
5. **Beskyttelseslag expansion**: DAI/Arealdata §3, Natura 2000, diger, fortidsminder, fredninger, drikkevand/BNBO.
6. **Servitut reality**: manuel Tingbogscheck, dokumentupload og AI-ekstraktion, uden at love gratis API.
7. **Forsyning**: Tjekditnet join via adgangsadresseid; behold vand/kloak/el/gas som kommunal/manual der hvor data ikke er åbne.
8. **Købskontekst**: EMOData energimærke, støjkort, kyst-/klimarisici og kommunalt byggesagsarkiv som due diligence panel.

## Kilder

- Datafordeler dataoversigt: https://datafordeler.dk/dataoversigt/
- Datafordeler dokumentation: https://confluence.sdfi.dk/display/DML/Datafordelerens+dokumentation
- Datafordeler BBR: https://datafordeler.dk/dataoversigt/bygnings-og-boligregistret-bbr/
- Datafordeler BBR GraphQL: https://datafordeler.dk/dataoversigt/bygnings-og-boligregistret-bbr/bbr-graphql/
- Datafordeler DAR: https://datafordeler.dk/dataoversigt/danmarks-adresseregister-dar/
- Datafordeler MAT2: https://datafordeler.dk/dataoversigt/matriklen2-mat2/
- Datafordeler EBR: https://datafordeler.dk/dataoversigt/ejendomsbeliggenhedsregistret-ebr/
- Datafordeler VUR: https://datafordeler.dk/dataoversigt/ejendomsvurdering-vur/
- Datafordeler EJF: https://datafordeler.dk/dataoversigt/ejerfortegnelsen-ejf/
- Datafordeler GeoDanmark Vektor WFS: https://datafordeler.dk/dataoversigt/geodanmark-vektor/geodanmark-vektor-wfs/
- Datafordeler DHM WCS: https://datafordeler.dk/dataoversigt/danmarks-hoejdemodel-dhm/dhm-wcs/
- Plandata WFS: https://www.plandata.dk/webservices/introduktion-til-webservices/wfs
- Danmarks Miljøportal Arealdata: https://miljoeportal.dk/systemer/arealdata/
- Danmarks Miljøportal DKJord: https://miljoeportal.dk/systemer/dkjord/
- Miljøstyrelsen forurenede grunde: https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/jord/forurenede-grunde
- GEUS Jupiter webservices: https://www.geus.dk/produkter-ydelser-og-faciliteter/data-og-kort/national-boringsdatabase-jupiter/webservices-for-udviklere
- HIP: https://klimatilpasning.dk/kommuner-og-forsyning/vaerktoejer/hip
- KAMP: https://klimatilpasning.dk/vaerktoejer/kamp/
- Kystplanlægger data: https://kystplanlaegger.dk/webgis-og-data/vis-data
- DMI Klimaatlas FAQ/API: https://www.dmi.dk/klima-atlas/oftestilledespoergsmaal
- Miljøstyrelsens støjkort: https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej
- Tjekditnet API-funktion PDF: https://tjekditnet.dk/sites/default/files/2025-06/API-funktionen%20p%C3%A5%20Tjekditnet.dk%20-%20uden%20selskabsnavne.pdf
- Energistyrelsen energimærkningsdata: https://ens.dk/analyser-og-statistik/energimaerkningsdata
- Slots- og Kulturstyrelsen FBB: https://slks.dk/omraader/kulturarv/databaserne/fredede-og-bevaringsvaerdige-bygninger
- GeoDanmark GeoFA bevaringsværdige bygninger: https://www.geodanmark.dk/projekt/ny-database-for-bevaringsvaerdige-bygninger-i-geofa/
- Fund og Fortidsminder WMS/WFS PDF: https://slks.dk/fileadmin/user_upload/SLKS/Nyheder/Kulturarv/Fund_og_Fortidsminder_Web_Map_Service_og_Web_Frature_Service.pdf
- Tinglysningsretten om Tingbogen: https://www.domstol.dk/tinglysningsretten/aktuelt/2023/5/ejendomsvurderinger-og-servitutter-i-tingbogen/
