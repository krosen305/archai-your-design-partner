# Agent Startup

Status: current startup protocol as of 2026-06-13.

Use this file to start Codex, Claude Code or another independent coding agent
with a narrow prompt.

## Minimal Prompt Pattern

Use this as the default prompt:

```md
Read `docs/AGENT_STARTUP.md`.
Then take `<TASK_ID_OR_PHASE>` from `docs/SCREENING_MVP_TASKS.md`.
Work on branch `<agent>/<short-task-name>`.
Respect the file boundaries and stop if the task would overlap another active branch.
Answer the strategy preflight before code changes.
```

Example:

```md
Read `docs/AGENT_STARTUP.md`.
Then take Phase 0 from `docs/SCREENING_MVP_TASKS.md`.
Work on branch `codex/screening-ui-reframe`.
Respect the file boundaries and stop if the task would overlap another active branch.
Answer the strategy preflight before code changes.
```

## Required Reading Order

Every independent agent must read these before implementation:

1. `docs/AGENT_STARTUP.md`
2. `docs/LLM_OPERATING_BRIEF.md`
3. `docs/PRODUCT_STRATEGY.md`
4. `docs/NOW_NEXT_LATER.md`
5. `docs/SCREENING_MVP_TASKS.md`
6. `AGENTS.md`
7. `CLAUDE.md`

Agents should not infer current strategy from `docs/archive/**`, old PRs,
historical implementation plans or partially built legacy features.

## Strategy Preflight

Before code changes, answer:

1. Does this support `address -> documented preliminary building screening report`?
2. Which product surface owns this work: `Screening`, `Kildebog`,
   `Risikoregister` or `Rapport`?
3. Is this source/evidence/risk/report related?
4. Does this revive paused legacy scope such as Hus-DNA, inspiration images,
   floor plans, BIM, authority drawings, permit packages or tender workflows?
5. Could output be mistaken for a legal ruling or municipal decision?
6. Which files are in scope?
7. Which files are explicitly out of scope?

If the answer is unclear, stop and ask for strategy review.

## Multi-Agent Coordination

You may run Codex and Claude Code at the same time, but only with strict
boundaries:

- one agent per branch
- one task/phase per branch
- one owner per file at a time
- no shared edits to the same route/component/service/domain helper
- no parallel edits to protected files
- no direct push to `main` unless explicitly approved
- merge one PR at a time

Preferred split:

- Codex: narrow UI, copy, component, test and smoke tasks.
- Claude Code: architecture, domain boundaries, compliance semantics and
  application-service plans.

This is a default bias, not a hard rule. The task document is authoritative.

## Branch Naming

Use:

```txt
codex/<short-task-name>
claude/<short-task-name>
```

Examples:

```txt
codex/screening-ui-reframe
claude/risk-taxonomy-plan
codex/source-ledger-ui
claude/report-service-boundary
```

## File Boundary Rules

Each task must list:

- allowed files
- files to avoid
- protected files
- expected tests/checks

If a task would require files outside its boundary, the agent must stop and say
what changed.

## Handoff Format

At the end of a task, the agent should report:

```md
Branch:
Task:
Product surface:
Files changed:
Verification run:
Known gaps:
Protected files touched:
Recommended next task:
```

## Required Verification

At minimum:

```bash
bun run strategy:lint
git diff --check
```

For code changes, add the smallest relevant subset:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

Before declaring broad implementation work done, run the full checklist unless
the user accepts a known baseline failure.

## Archive Rule

Files under `docs/archive/**` are historical context only. They must not be used
as current instructions unless a current canonical document explicitly revives
that scope.
