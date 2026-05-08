/**
 * Agent system — core contracts
 *
 * Disse typer er den eneste kilde til sandhed for task-livscyklus.
 * Importer fra her i orchestrator, runner og viewer.
 */

// ─── Roller ───────────────────────────────────────────────────────────────────

export type AgentRole = "orchestrator" | "backend" | "frontend" | "design" | "qa";

// ─── Status transitions ───────────────────────────────────────────────────────
//
//  pending → running → done
//                    → failed → retrying → running  (op til maxAttempts)
//                             → abandoned           (ingen flere forsøg)
//  pending → skipped                                (dependency fejlede)

export type TaskStatus =
  | "pending" // Oprettet, venter på dependency
  | "running" // Udføres nu
  | "done" // Fuldført — output valideret
  | "failed" // Fejlede, kan evt. retry
  | "retrying" // Venter på retry (backoff)
  | "abandoned" // Fejlede, ingen flere forsøg
  | "skipped"; // Upstream dependency fejlede — cascade skip

// ─── Failure typer ────────────────────────────────────────────────────────────

export type FailureType =
  | "type_error" // bun build fejlede — TypeScript compile error
  | "test_failure" // bun test fejlede
  | "lint_error" // bunx eslint rapporterede fejl
  | "build_failure" // bun build fejlede (ikke type)
  | "dependency_failed" // Upstream agent fejlede
  | "invalid_output" // Agent-output matcher ikke forventet kontrakt
  | "timeout" // Agent brugte mere end maxDurationMs
  | "api_error"; // Ekstern API (Supabase, Anthropic, Datafordeler) fejlede

// ─── Retry policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number; // Basis-delay — fordobles per forsøg
  retryOn: FailureType[]; // Kun disse fejltyper triggerer retry
}

export const DEFAULT_RETRY_POLICIES: Record<AgentRole, RetryPolicy> = {
  orchestrator: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
  backend: {
    maxAttempts: 2,
    backoffMs: 3000,
    retryOn: ["type_error", "build_failure", "api_error"],
  },
  frontend: {
    maxAttempts: 2,
    backoffMs: 3000,
    retryOn: ["type_error", "build_failure"],
  },
  design: {
    maxAttempts: 2,
    backoffMs: 2000,
    retryOn: ["type_error", "lint_error"],
  },
  qa: {
    maxAttempts: 1,
    backoffMs: 0,
    retryOn: [], // QA genproveres aldrig automatisk — fejl er intentionelle
  },
};

// ─── Task contract ────────────────────────────────────────────────────────────

export interface TaskContract {
  id: string; // Unik inden for session, fx "task-001"
  agent: AgentRole;
  description: string; // Hvad agenten skal gøre — ét ansvarsområde
  dependsOn: string[]; // IDs på tasks der skal være 'done' før denne starter
  status: TaskStatus;
  retryCount: number;
  retryPolicy: RetryPolicy;

  // Timing
  createdAt: string; // ISO
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;

  // Output (udfyldes af agenten)
  outputSummary?: string; // Kort beskrivelse af hvad der blev gjort
  filesChanged?: string[]; // Relative paths
  typesExported?: string[]; // Nye typer i src/types/ — relevant for Backend → Frontend dep

  // Fejl (udfyldes ved failure)
  failure?: {
    type: FailureType;
    message: string;
    details?: string; // Stack trace, fil+linje etc.
  };
}

// ─── Session manifest ─────────────────────────────────────────────────────────

export interface SessionManifest {
  sessionId: string; // fx "arch-98-20260507-143022"
  triggerIssue?: string; // fx "ARCH-98"
  model: string; // Orchestrator model
  status: "running" | "done" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  tasks: TaskContract[];
  qaVerdict?: QAVerdict;
}

// ─── QA verdict ───────────────────────────────────────────────────────────────
// Skrives af QA-agenten og læses af CI (deploy.yml)

export interface QAVerdict {
  sessionId: string;
  status: "pass" | "fail";
  timestamp: string;
  checks: {
    build: "pass" | "fail" | "skip";
    tests: "pass" | "fail" | "skip";
    lint: "pass" | "fail" | "skip";
  };
  blockers: string[]; // Fejlbeskeder der forhindrer deploy
  warnings: string[]; // Ikke-blokerende observationer
  durationMs: number;
}
