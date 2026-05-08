/**
 * Evals framework — core types
 *
 * ADAPT: Importér dine faktiske output-typer fra src/types/ eller
 * src/integrations/ og erstat de generiske TInput/TOutput-parametre
 * i dine specifikke eval-cases.
 */

// ─── Scoring ─────────────────────────────────────────────────────────────────

export type ScoringStrategy = "exact" | "structural" | "semantic";

export interface ScoreResult {
  score: number; // 0–1
  passed: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

// ─── Eval case ───────────────────────────────────────────────────────────────

export interface EvalCase<TInput = unknown, TExpected = unknown> {
  /** Unikt ID — bruges i snapshots og CI-output */
  id: string;
  /** Kort beskrivelse af hvad casen tester */
  description: string;
  /** Input der sendes til den evaluerede funktion */
  input: TInput;
  /** Scoring-strategi */
  scoring: ScoringStrategy;
  /**
   * Til 'exact' og 'structural': forventet output-struktur.
   * Til 'semantic': rubrik af kriterier der evalueres af LLM-judge.
   */
  expected?: TExpected;
  rubric?: string[];
  /** Minimum score for at bestå — typisk 0.8 for semantic, 1.0 for exact */
  threshold: number;
  /** Kør kun når EVAL_LIVE=true (kræver live API-nøgler) */
  requiresLive?: boolean;
}

// ─── Eval result ─────────────────────────────────────────────────────────────

export interface EvalResult {
  caseId: string;
  description: string;
  score: number;
  passed: boolean;
  reason: string;
  durationMs: number;
  timestamp: string;
}

// ─── Snapshot (regression baseline) ─────────────────────────────────────────

export interface Snapshot {
  caseId: string;
  score: number;
  timestamp: string;
  /** SHA-256 af JSON.stringify(output) — opdages ved output-ændringer */
  outputHash: string;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

export interface EvalSuite<TInput = unknown, TExpected = unknown> {
  name: string;
  /** Funktion der producerer det output der evalueres */
  run: (input: TInput) => Promise<unknown>;
  cases: EvalCase<TInput, TExpected>[];
}
