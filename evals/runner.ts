/**
 * Eval runner
 *
 * Kør alle suites:   bun run evals
 * Kør én suite:      bun run evals --suite pdf-extractor
 * Kør live APIs:     EVAL_LIVE=true bun run evals
 * Opdatér snapshots: EVAL_UPDATE_SNAPSHOTS=true bun run evals
 */

import { scoreExact, scoreStructural } from "./scoring/exact.ts";
import { scoreSemantic } from "./scoring/semantic.ts";
import { checkRegression, saveSnapshot } from "./scoring/snapshots.ts";
import type { EvalCase, EvalResult, EvalSuite, ScoreResult } from "./types.ts";

// ─── Importer suites ──────────────────────────────────────────────────────────
// ADAPT: Tilføj nye suites her
import { complianceSuite } from "./cases/compliance-flags.eval.ts";
import { pdfExtractorSuite } from "./cases/pdf-extractor.eval.ts";
import { husDnaSuite } from "./cases/hus-dna-generator.eval.ts";
import { orchestratorSuite } from "./cases/analysis-orchestrator.eval.ts";
import { ruleEngineSuite } from "./cases/rule-engine.eval.ts";

const ALL_SUITES: EvalSuite[] = [
  complianceSuite,
  pdfExtractorSuite,
  husDnaSuite,
  orchestratorSuite,
  ruleEngineSuite,
];

// ─── Config ───────────────────────────────────────────────────────────────────

const IS_LIVE = process.env["EVAL_LIVE"] === "true";
const UPDATE_SNAPSHOTS = process.env["EVAL_UPDATE_SNAPSHOTS"] === "true";
const SUITE_FILTER = process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1];

// ─── Run ─────────────────────────────────────────────────────────────────────

async function runCase(
  evalCase: EvalCase,
  run: (input: unknown) => Promise<unknown>,
): Promise<{ result: EvalResult; output: unknown }> {
  const start = Date.now();

  if (evalCase.requiresLive && !IS_LIVE) {
    return {
      result: {
        caseId: evalCase.id,
        description: evalCase.description,
        score: 0,
        passed: true, // Springer over — ikke en fejl
        reason: "Sprunget over (kræver EVAL_LIVE=true)",
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
      output: null,
    };
  }

  let output: unknown;
  try {
    output = await run(evalCase.input);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      result: {
        caseId: evalCase.id,
        description: evalCase.description,
        score: 0,
        passed: false,
        reason: `Kast under kørsel: ${reason}`,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
      output: null,
    };
  }

  let scoreResult: ScoreResult;
  switch (evalCase.scoring) {
    case "exact":
      scoreResult = scoreExact(output, evalCase.expected);
      break;
    case "structural":
      scoreResult = scoreStructural(
        output,
        evalCase.expected as Record<
          string,
          "string" | "number" | "boolean" | "array" | "object" | "defined"
        >,
      );
      break;
    case "semantic":
      scoreResult = await scoreSemantic(output, evalCase.rubric ?? []);
      break;
  }

  const passed = scoreResult.score >= evalCase.threshold;

  return {
    result: {
      caseId: evalCase.id,
      description: evalCase.description,
      score: scoreResult.score,
      passed,
      reason: scoreResult.reason,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    },
    output,
  };
}

async function runSuite(suite: EvalSuite): Promise<EvalResult[]> {
  console.log(`\n━━━ ${suite.name} ${"━".repeat(Math.max(0, 50 - suite.name.length))}`);
  const results: EvalResult[] = [];

  for (const evalCase of suite.cases) {
    const { result, output } = await runCase(evalCase, suite.run);

    // Regression check
    if (output !== null) {
      const regression = checkRegression(evalCase.id, result.score, output);

      if (regression.isRegression) {
        result.passed = false;
        result.reason = `${regression.message}\n${result.reason}`;
      }

      if (UPDATE_SNAPSHOTS || regression.previous === null) {
        saveSnapshot(evalCase.id, result.score, output);
      }

      if (regression.previous !== null) {
        console.log(`  ↳ Snapshot: ${regression.message}`);
      }
    }

    const icon = result.passed ? "✓" : "✗";
    const scoreStr = `${(result.score * 100).toFixed(0)}%`;
    const skipped = result.reason.includes("Sprunget over");

    if (skipped) {
      console.log(`  ○ ${evalCase.id} — sprunget over`);
    } else if (result.passed) {
      console.log(`  ${icon} ${evalCase.id} (${scoreStr}) — ${result.durationMs}ms`);
    } else {
      console.log(`  ${icon} ${evalCase.id} (${scoreStr}) — FEJL: ${result.reason.split("\n")[0]}`);
    }

    results.push(result);
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\nArchAI Evals${IS_LIVE ? " [LIVE]" : " [MOCK]"}${UPDATE_SNAPSHOTS ? " [UPDATE SNAPSHOTS]" : ""}`,
  );
  console.log(`${"═".repeat(60)}`);

  const suites = SUITE_FILTER
    ? ALL_SUITES.filter((s) => s.name.toLowerCase().includes(SUITE_FILTER.toLowerCase()))
    : ALL_SUITES;

  if (suites.length === 0) {
    console.error(`Ingen suite fundet med navn: ${SUITE_FILTER}`);
    process.exit(1);
  }

  const allResults: EvalResult[] = [];
  for (const suite of suites) {
    const results = await runSuite(suite);
    allResults.push(...results);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  const skipped = allResults.filter((r) => r.reason.includes("Sprunget over"));
  const active = allResults.filter((r) => !r.reason.includes("Sprunget over"));
  const passed = active.filter((r) => r.passed);
  const failed = active.filter((r) => !r.passed);
  const avgScore =
    active.length > 0 ? active.reduce((sum, r) => sum + r.score, 0) / active.length : 0;

  console.log(`\n${"═".repeat(60)}`);
  console.log(
    `Resultat: ${passed.length}/${active.length} bestået  |  Avg score: ${(avgScore * 100).toFixed(0)}%  |  Sprunget over: ${skipped.length}`,
  );

  if (failed.length > 0) {
    console.log(`\nFejlede:`);
    for (const r of failed) {
      console.log(`  ✗ ${r.caseId}: ${r.reason.split("\n")[0]}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Uventet fejl i eval runner:", err);
  process.exit(1);
});
