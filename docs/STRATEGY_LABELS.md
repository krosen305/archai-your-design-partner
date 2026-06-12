# Strategy Labels

Status: recommended label policy as of 2026-06-12.

Use these labels in Linear and GitHub so independent agents can understand the
authority boundary before starting work.

## Core Labels

| Label | Meaning |
| --- | --- |
| `screening-core` | Directly supports address-based feasibility screening. |
| `source-ledger` | Improves source status, confidence, citations or evidence traceability. |
| `risk-register` | Improves blocker/dispensation/manual-review/cost-risk/unknown classification. |
| `reporting` | Improves professional screening report, export or print-ready output. |
| `localplan-screening` | Improves Plandata/local-plan extraction, citations or plan constraints. |
| `data-quality` | Improves degraded states, cache freshness, source coverage or validation. |
| `manual-control` | Adds or improves professional manual-check workflows. |

## Gate Labels

| Label | Meaning |
| --- | --- |
| `needs-strategy-review` | Do not implement until product direction is clarified. |
| `needs-architecture` | Requires architecture review before implementation. |
| `legal-wording-review` | Output could be mistaken for legal/municipal decision. |
| `protected-file-review` | Touches protected files such as `AGENTS.md`, `CLAUDE.md`, `package.json` or protected state/orchestration files. |
| `legacy-do-not-extend` | Existing feature is paused/legacy; do not build on it without explicit approval. |
| `paused-design` | Related to Hus-DNA, inspiration images, floor plans, BIM or drawing tools; paused unless explicitly revived. |

## Label Rules

- A task with `paused-design` or `legacy-do-not-extend` must not be implemented
  by an autonomous agent unless the issue also contains explicit strategy
  approval.
- A task with `needs-strategy-review` must stop at analysis or ask for human
  direction.
- A task touching compliance semantics, AI confidence, public register data,
  persistence or protected files should also carry `needs-architecture`.
- A task that changes user-facing feasibility wording should carry
  `legal-wording-review`.

## Recommended Defaults

For the current MVP, most implementation work should carry one or more of:

- `screening-core`
- `source-ledger`
- `risk-register`
- `reporting`
- `localplan-screening`
- `data-quality`
- `manual-control`

If none of those labels fit, the work is probably not NOW.
