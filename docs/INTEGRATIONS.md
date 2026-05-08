# Integrations

> Dette dokument læses af Backend Agent og ved Datafordeler GraphQL-arbejde.
> CLAUDE.md har kompakt overblik — dette har fuld detalje.

## Services (`src/integrations/`)

Server-side services må **aldrig** importeres direkte i route-filer — brug `createServerFn`.

| Service                   | Fil                        | Status          | Noter                                                                            |
| ------------------------- | -------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `GsearchService`          | `gsearch/client.ts`        | ✅ Live         | Adresse-autocomplete, Dataforsyningen GSearch v2, kræver `DATAFORSYNINGEN_TOKEN` |
| `BbrService`              | `bbr/client.ts`            | ✅ Live         | Bygningsregister, Datafordeler GraphQL v2, kræver `DATAFORDELER_API_KEY`         |
| `MatService`              | `mat/client.ts`            | ✅ Live         | Matrikelregister (grundareal), Datafordeler GraphQL v2                           |
| `DarService`              | `dar/client.ts`            | ✅ Live         | Adresseregister, Datafordeler GraphQL v1                                         |
| `PlandataService`         | `plandata/client.ts`       | ✅ Live         | Lokalplaner via WFS, ingen API-key                                               |
| `PdfExtractorService`     | `ai/pdf-extractor.ts`      | ✅ Live         | Lokalplan PDF → regler via Claude API, kræver `ANTHROPIC_API_KEY`                |
| `HusDnaGeneratorService`  | `ai/hus-dna-generator.ts`  | ✅ Live         | Billeder+tekst → Hus-DNA via Claude vision, kræver `ANTHROPIC_API_KEY`           |
| `TinglysningService`      | `tinglysning/client.ts`    | 🟡 IS_MOCK=true | Servitutter, live API afventes (ARCH-26)                                         |
| `DhmService`              | `sdfi/dhm-client.ts`       | 🟡 IS_MOCK=true | DHM terrain-data via SDFI WCS (ARCH-102)                                         |
| `NaturbeskyttelseService` | `sdfi/naturbeskyttelse.ts` | 🟡 IS_MOCK=true | Naturbeskyttelseslinjer via DAI WFS (ARCH-65)                                    |
| `DkJordService`           | `miljoe/dkjord.ts`         | 🟡 IS_MOCK=true | Forurenede grunde via DK-Jord WFS (ARCH-66)                                      |
| `GeusService`             | `geus/client.ts`           | 🟡 IS_MOCK=true | Geoteknisk risikodata via GEUS WFS (ARCH-101)                                    |
| `FjernvarmeService`       | `plandata/fjernvarme.ts`   | 🟡 IS_MOCK=true | Fjernvarmedækning via Plandata WFS (ARCH-111)                                    |
| `NaboService`             | `bbr/neighbor-client.ts`   | ✅ Live         | Nabobygninger inden for 40m via DAWA REST (ARCH-103)                             |
| Supabase                  | `supabase/`                | ✅ Live         | Auth middleware + typed client                                                   |

Schema-referencer: `bbr-schema.txt`, `mat-schema.txt` i rod-mappen.

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
