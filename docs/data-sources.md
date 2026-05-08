# Data Sources Discovery — ARCH-103

> Udført 2026-05-07. Tester kendte danske datakiler for forsyningsdata og nabobygninger.

## A. Forsyningsstatus

### Fiberdækning (`fiber_available`)

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Kilde**      | Bredbaandskort.dk — Klimadatastyrelsen                   |
| **API**        | Ingen offentlig REST/WMS API fundet. Kortet er web-only. |
| **Auth**       | N/A                                                      |
| **Konklusion** | **Ingen programmatisk adgang.** Manuel input i UI.       |

### Fjernvarme (`district_heating_available`)

|                |                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Kilde**      | Kommunale varmeplandata via Plandata WFS                                                                                         |
| **API**        | Ingen centraliseret national API. Varmeplandata ligger i Plandata som kommunale lag.                                             |
| **Auth**       | Plandata WFS er åben (ingen auth)                                                                                                |
| **Endpoint**   | `https://wfs2-miljoegis.mim.dk/geoserver/ows?service=WFS&...` — kommunale varmeforsyningsplaner                                  |
| **Konklusion** | **Muligt via Plandata WFS** — kræver kommunekode-specifik layer-parameter. Estimeret implementeringstid: 2-3 timer. Se ARCH-111. |

### El — netselskab (`electricity_connection_point`)

|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| **Kilde**      | Energi Data Service (energidataservice.dk)                               |
| **API**        | REST, ingen token til generelle data                                     |
| **Endpoint**   | `https://www.energidataservice.dk/`                                      |
| **Auth**       | Gratis til generelle data; målepunktsdata kræver Eloverblik bearer token |
| **Konklusion** | **Ingen adresse→netselskab-opslag.** Kun grid/markedsdata. Manuel input. |

### Gas (`gas_available`)

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Kilde**      | Evida (Naturgas Fyn + DONG) via backend-gasdata.evida.dk |
| **API**        | REST/Swagger tilgængeligt                                |
| **Endpoint**   | `https://backend-gasdata.evida.dk/swagger/index.html`    |
| **Auth**       | Kræver virksomhedsspecifik API-nøgle. Ikke offentlig.    |
| **Konklusion** | **Ingen offentlig adgang.** Manuel input.                |

### Vand / Kloak (`water_connection_point`, `sewer_connection_point`)

|                |                                                                     |
| -------------- | ------------------------------------------------------------------- |
| **Kilde**      | DANVA, kommunale forsyningsselskaber, kommunale spildevandsplaner   |
| **API**        | Ingen national API. Spildevandsplaner ligger som kommunale WFS-lag. |
| **Konklusion** | **Ingen standardiseret API.** Manuel input.                         |

---

## B. Nabobygninger (`neighbor_buildings_distance`)

**Status: Implementeret** — ingen discovery nødvendig.

|                    |                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Kilde**          | DAWA REST API (dawa.aws.dk) — åben, ingen auth                                                                  |
| **Endpoint**       | `GET /adgangsadresser?cirkel={lon},{lat},{radius_m}&format=json&struktur=mini`                                  |
| **Auth**           | Ingen                                                                                                           |
| **Implementering** | `src/integrations/bbr/neighbor-client.ts` — `NaboService.getNaboer()`                                           |
| **Output**         | `NeighborBuildingData` med count, nearestDistanceM, buildings[]                                                 |
| **Radius**         | 40 m                                                                                                            |
| **Begrænsning**    | Afstand er fra adressepunkt til adressepunkt — ikke fra bygningskant til skel. Acceptabel approximation for v1. |

---

## Konklusion og næste skridt

| Datapunkt                      | Tilgængeligt?          | Handling                                      |
| ------------------------------ | ---------------------- | --------------------------------------------- |
| `fiber_available`              | Nej                    | Manuel input i UI (checkbox)                  |
| `district_heating_available`   | Delvist — Plandata WFS | ARCH-111: implementér Plandata fjernvarme WFS |
| `electricity_connection_point` | Nej                    | Manuel input i UI                             |
| `gas_available`                | Nej (lukket API)       | Manuel input i UI                             |
| `water_connection_point`       | Nej                    | Manuel input i UI                             |
| `sewer_connection_point`       | Nej                    | Manuel input i UI                             |
| `neighbor_buildings_distance`  | Ja — DAWA REST         | ✅ Implementeret (ARCH-103)                   |

**Anbefaling for forsyningsdata**: Tilføj et "Forsyningsstatus" trin i wizard-flowet hvor brugeren angiver fjernvarme og fiber manuelt (checkbox, ~30 sek). Fjernvarme kan eventuelt prepopuleres fra Plandata WFS (ARCH-111).
