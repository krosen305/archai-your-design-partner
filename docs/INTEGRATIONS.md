# Integrations

> Dette dokument læses af Backend Agent og ved Datafordeler GraphQL-arbejde.
> CLAUDE.md har kompakt overblik — dette har fuld detalje.

## Services (`src/integrations/`)

Server-side services må **aldrig** importeres direkte i route-filer — brug `createServerFn`.

| Service                   | Fil                        | Status          | Noter                                                                                              |
| ------------------------- | -------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `GsearchService`          | `gsearch/client.ts`        | ✅ Live         | Adresse-autocomplete, Dataforsyningen GSearch v2, kræver `DATAFORSYNINGEN_TOKEN`                  |
| `BbrService`              | `bbr/client.ts`            | ✅ Live         | Bygningsregister, Datafordeler GraphQL v2. Returnerer varme, materialer, fredning + MAT-beskyttelse |
| `MatService`              | `mat/client.ts`            | ✅ Live         | Matrikelregister: grundareal + strandbeskyttelse/fredskov/klitfredning fra MAT_Jordstykke          |
| `DarService`              | `dar/client.ts`            | ✅ Live         | Adresseregister, Datafordeler GraphQL v1                                                           |
| `PlandataService`         | `plandata/client.ts`       | ✅ Live         | Lokalplaner + kommuneplanramme via WFS, ingen API-key                                              |
| `PdfExtractorService`     | `ai/pdf-extractor.ts`      | ✅ Live         | Lokalplan PDF → regler via Claude API, kræver `ANTHROPIC_API_KEY`                                  |
| `ByggeanalyseService`     | `ai/byggeanalyse.ts`       | ✅ Live         | Compliance AI-analyse inkl. regelkerne + inspirationsbilleder (max 4), kræver `ANTHROPIC_API_KEY`  |
| `NaboService`             | `bbr/neighbor-client.ts`   | ✅ Live         | Nabobygninger inden for 40m via DAWA REST (ARCH-103)                                               |
| Supabase                  | `supabase/`                | ✅ Live         | Auth, project-persistence (`projects`-tabel), Zustand-sync via `project-sync.ts`                  |
| `TinglysningService`      | `tinglysning/client.ts`    | 🟡 IS_MOCK=true | Servitutter, TingbogenV2 schema afventes (ARCH-26)                                                 |
| `NaturbeskyttelseService` | `sdfi/naturbeskyttelse.ts` | 🟡 IS_MOCK=true | Naturbeskyttelseslinjer via DAI WFS (ARCH-65) — strandbeskyttelse/fredskov/klitfredning dækkes nu af MAT |
| `DkJordService`           | `miljoe/dkjord.ts`         | 🟡 IS_MOCK=true | Forurenede grunde via DK-Jord WFS (ARCH-66)                                                        |
| `GeusService`             | `geus/client.ts`           | 🟡 IS_MOCK=true | Geoteknisk risikodata via GEUS WFS (ARCH-101)                                                      |
| `DhmService`              | `sdfi/dhm-client.ts`       | 🟡 IS_MOCK=true | DHM terrain-data via SDFI WCS (ARCH-102)                                                           |
| `FjernvarmeService`       | `plandata/fjernvarme.ts`   | 🟡 IS_MOCK=true | Fjernvarmedækning via Plandata WFS (ARCH-111)                                                       |
| `SaveService`             | `save/client.ts`           | 🟡 IS_MOCK=true | SAVE bevaringsværdi via Kulturmiljøregisteret (ARCH-29) — fredning suppleres af BBR byg070         |

GraphQL-skemaer: se `schema/` (gitignored). Regenerér: `curl "https://graphql.datafordeler.dk/{REGISTER}/v2/schema?apiKey=..."`.

## BbrKompliantData — felter

| Felt                    | BBR-felt   | Beskrivelse                                         |
| ----------------------- | ---------- | --------------------------------------------------- |
| `byggeaar`              | byg026     | Opførelsesår                                        |
| `bebygget_areal`        | byg041     | Bebygget areal (footprint) i m²                     |
| `samlet_areal`          | byg038     | Samlet bygningsareal i m²                           |
| `antal_etager`          | byg054     | Antal etager                                        |
| `anvendelseskode`       | byg021     | BBR anvendelseskode (110, 120, 140 osv.)            |
| `varmeinstallation`     | byg056     | Primær varmeinstallation (Fjernvarme, Varmepumpe…)  |
| `opvarmningsmiddel`     | byg057     | Primært brændstof (Naturgas, El, Fjernvarme…)       |
| `ydervaegs_materiale`   | byg032     | Facademateriale (Mursten/tegl, Træbeklædning…)      |
| `tagdaekning`           | byg033     | Tagdækningsmateriale (Tagsten, Stråtag…)            |
| `fredet`                | byg070     | Boolean — fredet bygning                            |
| `mat_strandbeskyttelse` | MAT_Jordstykke | Fra MAT strandbeskyttelse_omfang — live data   |
| `mat_fredskov`          | MAT_Jordstykke | Fra MAT fredskov_omfang — live data            |
| `mat_klitfredning`      | MAT_Jordstykke | Fra MAT klitfredning_omfang — live data        |

## Datafordeler GraphQL-constraints (BBR, MAT, DAR)

Disse fejler stille ved overtrædelse — læs dem inden du skriver queries:

- **Ét root-felt per query** (DAF-GQL-0010) — ingen parallelle root-felter
- **`virkningstid` påkrævet** på alle queries (DAF-GQL-0009)
- **Ingen aliases** (DAF-GQL-0008)
- **Introspection deaktiveret** (HC0046)
- **API-key som query-parameter** `?apiKey=...` — aldrig som `Authorization` header

## Service-mønster

Unwrap errors — returnér aldrig `{ data, error }` til kalderen:

```typescript
export const bbrService = {
  async getBuildings(id: string): Promise<Building[]> {
    const { data, error } = await supabase.from("buildings").select("*");
    if (error) throw error;
    return data;
  },
};
```
