# ArchAI Evals

Regression-testing og kvalitetsmåling af AI-workflows.

## Kør evals

```bash
# Alle mock-baserede evals (ingen API-nøgler krævet)
bun run evals

# Kun én suite
bun run evals --suite=compliance
bun run evals --suite=pdf-extractor

# Live API-kald (kræver ANTHROPIC_API_KEY + DATAFORDELER_API_KEY)
EVAL_LIVE=true bun run evals

# Opdatér snapshots (ny golden baseline)
EVAL_UPDATE_SNAPSHOTS=true bun run evals
```

Tilføj til `package.json`:
```json
"scripts": {
  "evals": "bun run evals/runner.ts",
  "evals:live": "EVAL_LIVE=true bun run evals/runner.ts",
  "evals:update": "EVAL_UPDATE_SNAPSHOTS=true bun run evals/runner.ts"
}
```

## Mappestruktur

```
evals/
├── runner.ts                    # Main runner — start her
├── types.ts                     # Core typer
├── scoring/
│   ├── exact.ts                 # Deterministic: exact + structural match
│   ├── semantic.ts              # LLM-judge via Claude Haiku
│   └── snapshots.ts             # Regression detection
├── fixtures/
│   ├── bbr/bbr.fixture.ts       # BBR-testdata (4 scenarier)
│   └── lokalplan/
│       └── lokalplan.fixture.ts # Lokalplan + Hus-DNA inputs
├── cases/
│   ├── compliance-flags.eval.ts # Deterministic, kræver ikke live
│   ├── pdf-extractor.eval.ts    # Semantic, kræver EVAL_LIVE
│   ├── hus-dna-generator.eval.ts
│   └── analysis-orchestrator.eval.ts
└── snapshots/                   # Auto-genereret — commit til git
    └── *.snap.json
```

## Scoring-strategier

| Strategi | Hvornår | Signal |
|---|---|---|
| `exact` | Deterministic output (compliance flags, BBR-parsing) | Binær — fejler ved mindste afvigelse |
| `structural` | Output-form skal være korrekt, værdier kan variere | % af korrekte felter |
| `semantic` | AI-genereret output, rubrik-baseret (Haiku-judge) | 0–1 baseret på rubrik-kriterier |

**Threshold-konventioner:**
- `exact`: `1.0` — ingen tolerance
- `structural`: `0.85`–`1.0` — afhænger af antal felter
- `semantic`: `0.75`–`0.8` — ~20% margin for AI-variation

## Regression detection

Første gang en eval kører, gemmes et snapshot i `evals/snapshots/<caseId>.snap.json`. Efterfølgende kørsler sammenligner:

- Score-fald > 10% → **REGRESSION** (eval fejler, CI stopper)
- Output-hash ændret men score OK → advarsler i output men CI fortsætter

Commit snapshots til git — de er din golden baseline.

```bash
# Bevidst ny baseline (fx efter prompt-opdatering der forbedrer kvalitet):
EVAL_UPDATE_SNAPSHOTS=true bun run evals
git add evals/snapshots/
git commit -m "ARCH-N: Opdatér eval snapshots efter prompt-optimering"
```

## Tilføj en ny eval

**1. Opret fixture** (hvis ny input-type):
```typescript
// evals/fixtures/min-service/min-service.fixture.ts
export const MIN_FIXTURE = {
  normalCase: { /* input */ },
  edgeCase:   { /* input */ },
}
```

**2. Opret eval case** i eksisterende eller ny suite-fil:
```typescript
// evals/cases/min-service.eval.ts
import type { EvalSuite } from '../types.ts'

export const minServiceSuite: EvalSuite = {
  name: 'Min service',
  run: async (input) => minService.process(input),
  cases: [
    {
      id: 'min-service-normal',
      description: 'Hvad casen tester',
      scoring: 'semantic',     // eller 'exact' / 'structural'
      threshold: 0.8,
      requiresLive: true,      // udelad hvis mock er tilstrækkeligt
      input: MIN_FIXTURE.normalCase,
      rubric: [
        'Output er på dansk',
        'Konkret kriterie der kan evalueres binært',
      ],
    },
  ],
}
```

**3. Registrér i runner.ts:**
```typescript
import { minServiceSuite } from './cases/min-service.eval.ts'
const ALL_SUITES = [..., minServiceSuite]
```

**4. Kør og gem snapshot:**
```bash
EVAL_LIVE=true EVAL_UPDATE_SNAPSHOTS=true bun run evals --suite=min-service
```

## Hvilke workflows evalueres først

Prioriteret rækkefølge baseret på risiko og impact:

| Prioritet | Suite | Begrundelse |
|---|---|---|
| 1 | `compliance-flags` | Deterministic, ingen API-afhængighed — kør altid |
| 2 | `pdf-extractor` | Blokerer ARCH-25 (IS_MOCK=true) — høj risiko ved aktivering |
| 3 | `analysis-orchestrator` | End-to-end signal — opdager integrationsfejl |
| 4 | `hus-dna-generator` | Kreativt output — lavere kritikalitet |

## CI/CD integration

Tilføj til `.github/workflows/ci.yml`:

```yaml
- name: Kør mock-evals
  run: bun run evals
  # Mock-evals kræver ingen secrets og koster $0

- name: Kør live evals (kun på main)
  if: github.ref == 'refs/heads/main'
  run: EVAL_LIVE=true bun run evals
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    DATAFORDELER_API_KEY: ${{ secrets.DATAFORDELER_API_KEY }}
```

## Tilslut IS_MOCK=true services

Når en service aktiveres (IS_MOCK fjernes), opdatér dens eval:

1. Fjern `requiresLive: true` hvis mock-data er tilstrækkeligt
2. Tilføj rigtige test-PDF-URL'er / adresse-ID'er til fixtures
3. Kør `EVAL_LIVE=true EVAL_UPDATE_SNAPSHOTS=true bun run evals` for ny baseline
4. Commit snapshots

## Tokenoptimering via evals

Evals måler om kvaliteten holder ved model-skift:

```bash
# Test om Haiku kan erstatte Sonnet på PDF-udtrækning
ANTHROPIC_MODEL_OVERRIDE=claude-haiku-4-5-20251001 EVAL_LIVE=true bun run evals --suite=pdf-extractor

# Sammenlign scores — acceptabelt fald: < 5pp
```

ADAPT: Tilføj `ANTHROPIC_MODEL_OVERRIDE`-support til dine service-implementeringer.
