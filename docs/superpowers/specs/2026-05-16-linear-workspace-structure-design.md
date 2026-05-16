# Linear Workspace Structure — ArchAI

**Date:** 2026-05-16
**Status:** Approved

## Beslutninger

- **Brugere:** Kasper som eneste menneskelig bruger. AI-agenter (Claude Code, Codex) håndteres via labels — ingen bot-brugere.
- **Projekter:** 5 tekniske domæner.
- **Labels:** To-akse model — Type + Routing.
- **Workflow states:** Uændret (Backlog → Todo → In Progress → In Review → Done).

## Projekter

| Projekt | Indhold |
|---|---|
| Compliance Engine | Rule engine, BBR/MAT/Plandata/geodata, Hard Stop-logik |
| Cockpit UI | Panels, tabs, komponenter, Byggeoenske-editor, kort |
| Data Layer | Supabase schema, migrations, project-store, auth, IS_MOCK→live |
| AI Features | Billedanalyse, HusDNA, lokalplan PDF, byggeanalyse |
| Infrastruktur & DX | CI/CD, testing, build, CLAUDE.md, Linear-workflow, tech debt |

## Labels

### Akse 1 — Type
| Label | Farve | Note |
|---|---|---|
| `Bug` | #EB5757 | Eksisterer |
| `Feature` | #BB87FC | Eksisterer |
| `Improvement` | #4EA7FC | Eksisterer |
| `Chore` | #8A8A8A | Ny: tech debt, cleanup, config |
| `Security` | #D97706 | Ny: auth, secrets, sårbarheder |

### Akse 2 — Routing
| Label | Farve | Note |
|---|---|---|
| `codex-safe` | #16A34A | Ny: Codex kan implementere autonomt |
| `needs-architecture` | #F2994A | Eksisterer |
| `claude-review` | #5E6AD2 | Eksisterer |
| `blocked` | #991B1B | Ny: afventer ekstern dependency |

## Oprydning

### Cancelles
- ARCH-120, 125, 126, 127, 128 — forældede Lovable UI-issues
- ARCH-13, 14, 15, 16, 68 — forældede EPICs (erstattes af Projects)
- ARCH-9, 35, 142, 67 — stale/planning artifacts

### Verificeres mod kode
- ARCH-191 — billede-analyse server functions (muligvis allerede done)
