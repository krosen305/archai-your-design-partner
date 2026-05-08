import type { ScoreResult } from "../types.ts";

/**
 * Exact scoring — bruges til deterministic output (compliance flags,
 * strukturerede BBR-transformationer).
 *
 * Score: 1.0 hvis deepEqual, 0.0 ellers.
 * Giver binær signal — god til regressioner på regel-logik.
 */
export function scoreExact(actual: unknown, expected: unknown): ScoreResult {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    score: match ? 1.0 : 0.0,
    passed: match,
    reason: match
      ? "Output matcher expected præcist"
      : `Output afviger fra expected.\nActual:   ${JSON.stringify(actual, null, 2)}\nExpected: ${JSON.stringify(expected, null, 2)}`,
  };
}

/**
 * Structural scoring — bruges til output der altid skal have bestemte
 * felter og typer, men hvor præcise værdier kan variere (BBR-parsing,
 * adressestruktur).
 *
 * Score: andel af forventede felter der er til stede og korrekt typet.
 */
export function scoreStructural(
  actual: unknown,
  expectedShape: Record<string, "string" | "number" | "boolean" | "array" | "object" | "defined">,
): ScoreResult {
  if (typeof actual !== "object" || actual === null) {
    return { score: 0, passed: false, reason: "Output er ikke et objekt" };
  }

  const obj = actual as Record<string, unknown>;
  const results: Record<string, boolean> = {};

  for (const [key, expectedType] of Object.entries(expectedShape)) {
    const value = obj[key];
    if (expectedType === "defined") {
      results[key] = value !== undefined && value !== null;
    } else if (expectedType === "array") {
      results[key] = Array.isArray(value);
    } else {
      results[key] = typeof value === expectedType;
    }
  }

  const passing = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  const score = total === 0 ? 0 : passing / total;

  const failing = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  return {
    score,
    passed: score >= 1.0,
    reason:
      failing.length === 0
        ? "Alle felter er til stede og korrekt typet"
        : `Manglende eller forkert typede felter: ${failing.join(", ")}`,
    details: results,
  };
}
