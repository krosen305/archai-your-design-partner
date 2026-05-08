# Agent System

Letvægts agent-tracing til ArchAI's multi-agent workflow.

## Filer

| Fil            | Formål                                                     |
| -------------- | ---------------------------------------------------------- |
| `contracts.ts` | Typer: `TaskContract`, `SessionManifest`, `QAVerdict`      |
| `tracer.ts`    | CLI til at skrive/læse session-manifests i `agent-traces/` |
| `ci-gate.ts`   | CI deploy-gate: blokerer deploy ved `fail` QA-verdict      |

Trace-filer gemmes i `agent-traces/` (gitignored).

## Brug

```bash
# Vis hjælp
bun run agent/tracer.ts

# List seneste sessioner
bun run agent/tracer.ts list

# Vis detaljer for en session
bun run agent/tracer.ts view --session arch-98-20260507-1430

# QA gate (bruges af deploy.yml)
bun run agent/ci-gate.ts
```

## CI integration

`deploy.yml` kører `bun run agent/ci-gate.ts` før deploy.
Ingen verdict → tillad. Forældet verdict (>2t) → tillad. `fail` → blokér.
