# Lint Warning Backlog

Captured 2026-05-22. `bunx eslint .` produces **0 errors, 600 warnings**.
All prettier/prettier formatting errors (118) were fixed with `eslint --fix`.

This document groups remaining warnings by rule and explains why they are
accepted as technical debt rather than fixed immediately.

---

## Summary

| Rule | Count | Location | Priority |
|---|---|---|---|
| `no-console` | ~279 | `agent/`, `scripts/`, `evals/`, integration clients, tests | Low — intentional for CLI/scripts |
| `@typescript-eslint/no-explicit-any` | ~249 | Integration clients, OpenLayers map components, tests | Medium — needs typed replacements |
| `react-refresh/only-export-components` | ~39 | `src/components/ui/`, `src/router.tsx`, `BudgetKalkulator.tsx` | Low — shadcn/ui pattern |
| `react-hooks/exhaustive-deps` | ~12 | `MatrikelMap.tsx`, `MatrikelMapCompact.tsx` | Medium — OL map refs excluded by design |

---

## Group 1: `no-console` — 279 warnings

**Rule:** `no-console` (only `console.warn` and `console.error` are allowed)

**Accepted in:** CLI scripts, agent infrastructure, evals runner, and integration test files where structured logging is impractical.

**Files:**
- `agent/ci-gate.ts` — CI gate CLI tool
- `agent/tracer.ts` — agent tracing infrastructure
- `evals/runner.ts` — eval suite runner (CLI tool)
- `scripts/inspect-datafordeler-dar.ts` — DAR inspection script
- `scripts/test-hasselvej-48.ts` — integration test script
- `scripts/test-vur.ts` — VUR integration test script
- `src/lib/logger.ts` — uses `console` as intentional logger transport fallback
- `src/integrations/*/**.test.ts` — test files that log debug payloads

**Action:** No change needed in `scripts/`, `evals/`, `agent/`. For `src/lib/logger.ts` the console calls are the intentional log transport and should stay. Integration test files can add `// eslint-disable-next-line no-console` inline if needed.

---

## Group 2: `@typescript-eslint/no-explicit-any` — ~249 warnings

**Rule:** `@typescript-eslint/no-explicit-any`

**Accepted in:** Integration adapter clients where external API shapes are parsed dynamically, OpenLayers map internals (ol library types are complex), and test mocks.

**Primary locations:**
- `src/components/cockpit/MatrikelMap.tsx` — OpenLayers layer/source generics (OL types are complex unions)
- `src/integrations/bbr/client.ts`, `dar/client.ts`, `mat/client.ts`, `ebr/client.ts`, `vur/client.ts`, `plandata/client.ts` — Datafordeler GraphQL response parsing at the boundary decoder layer
- `src/integrations/mat/grundareal-resolver.ts` — resolver intermediate types
- `src/integrations/ai/hus-dna-generator.ts` — AI response intermediate shapes
- `src/lib/analysis-orchestrator.test.ts`, `src/lib/project-update-builder.test.ts` — test mocks
- `src/integrations/*/**.test.ts` — test mock shapes

**Action:** Refactor in dedicated tickets. Integration client `any` types should be replaced with typed Zod decoders at the response boundary. OpenLayers `any` types should be replaced with `ol` library generics where stable.

---

## Group 3: `react-refresh/only-export-components` — ~39 warnings

**Rule:** `react-refresh/only-export-components`

**Accepted in:** `src/components/ui/` (shadcn/ui generated components) and `src/router.tsx`. These files export both React components and non-component utilities (variant maps, context objects, constants) as part of their public API, which is the shadcn/ui pattern.

**Files:**
- `src/components/ui/badge.tsx` — exports `badgeVariants` constant alongside `Badge` component
- `src/components/ui/button.tsx` — exports `buttonVariants` constant alongside `Button` component
- `src/components/ui/form.tsx` — exports multiple context objects alongside form components
- `src/components/ui/navigation-menu.tsx` — exports `navigationMenuTriggerStyle` helper
- `src/components/ui/sidebar.tsx` — exports multiple context utilities
- `src/components/ui/toggle.tsx` — exports `toggleVariants` constant
- `src/components/cockpit/BudgetKalkulator.tsx` — exports typed constant arrays alongside component
- `src/router.tsx` — exports both router instance and `RouterContext` type

**Action:** shadcn/ui files should not be restructured — this is the intended pattern. For `BudgetKalkulator.tsx` the constants should be extracted to a companion `budgetkalkulator-constants.ts` in a future refactor. For `src/router.tsx` the `RouterContext` type export can remain.

---

## Group 4: `react-hooks/exhaustive-deps` — ~12 warnings

**Rule:** `react-hooks/exhaustive-deps`

**Accepted in:** `MatrikelMap.tsx` and `MatrikelMapCompact.tsx` where OpenLayers map instances are managed via `useRef` and intentionally excluded from dependency arrays to prevent infinite re-render cycles.

**Specific warnings:**
- `useEffect` missing `geo` dependency — the `geo` prop is a stable coordinate pair and adding it would cause the OL map to re-initialize on every render.
- `baseCenter` conditional in `useEffect` — intentionally stabilised outside the effect to avoid recompute on every render.
- `onPlacementChange` missing dependency in `MatrikelMapCompact` — callback prop that may change identity; should be wrapped in `useCallback` at the call site.

**Action:** The `geo` and map-ref patterns should be stabilised with `useRef` or `useMemo` wrappers instead of suppressing the warning. The `onPlacementChange` case should be fixed by wrapping the prop in `useCallback` at the parent component. Target: ARCH-backlog.

---

## Notes

- `.claude/worktrees/**` er tilføjet til `ignores` i `eslint.config.js` så worktree-kopier ikke duplikerer warnings.
- Den 1 fejlende test i `bun test src` er en pre-eksisterende AI/network integration-test fejl (billede-analyse med ugyldig API-nøgle), ikke relateret til lint-ændringer.
