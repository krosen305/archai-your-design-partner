/**
 * Agent tracer — fil-baseret koordinering og observability
 *
 * Alle trace-filer skrives til agent-traces/ (gitignored, claudecodeignored).
 * Ingen runtime-afhængigheder — kun Bun's native FS-API.
 *
 * Brug:
 *   bun run agent/tracer.ts start --session arch-98 --issue ARCH-98
 *   bun run agent/tracer.ts task-start --session arch-98 --task task-001
 *   bun run agent/tracer.ts task-done  --session arch-98 --task task-001 --summary "..."
 *   bun run agent/tracer.ts task-fail  --session arch-98 --task task-001 --type type_error --msg "..."
 *   bun run agent/tracer.ts qa-verdict --session arch-98 --status pass
 *   bun run agent/tracer.ts view       --session arch-98
 *   bun run agent/tracer.ts list
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type {
  SessionManifest,
  TaskContract,
  TaskStatus,
  FailureType,
  QAVerdict,
} from "./contracts.ts";
import { DEFAULT_RETRY_POLICIES } from "./contracts.ts";

const TRACES_DIR = join(process.cwd(), "agent-traces");

function ensureDir() {
  mkdirSync(TRACES_DIR, { recursive: true });
}

function sessionPath(sessionId: string) {
  return join(TRACES_DIR, `${sessionId}.json`);
}

function verdictPath() {
  return join(TRACES_DIR, "latest-verdict.json");
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

export function readSession(sessionId: string): SessionManifest {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) throw new Error(`Session ikke fundet: ${sessionId}`);
  return JSON.parse(readFileSync(path, "utf-8")) as SessionManifest;
}

export function writeSession(manifest: SessionManifest): void {
  ensureDir();
  writeFileSync(sessionPath(manifest.sessionId), JSON.stringify(manifest, null, 2));
}

export function createSession(opts: {
  sessionId: string;
  triggerIssue?: string;
  model: string;
  tasks: Omit<TaskContract, "status" | "retryCount" | "retryPolicy" | "createdAt">[];
}): SessionManifest {
  const manifest: SessionManifest = {
    sessionId: opts.sessionId,
    triggerIssue: opts.triggerIssue,
    model: opts.model,
    status: "running",
    startedAt: new Date().toISOString(),
    tasks: opts.tasks.map((t) => ({
      ...t,
      status: "pending" as TaskStatus,
      retryCount: 0,
      retryPolicy: DEFAULT_RETRY_POLICIES[t.agent],
      createdAt: new Date().toISOString(),
    })),
  };
  writeSession(manifest);
  return manifest;
}

// ─── Task updates ─────────────────────────────────────────────────────────────

export function taskStart(sessionId: string, taskId: string): void {
  const manifest = readSession(sessionId);
  const task = manifest.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ikke fundet: ${taskId}`);

  const blockers = task.dependsOn.filter((depId) => {
    const dep = manifest.tasks.find((t) => t.id === depId);
    return dep?.status !== "done";
  });

  if (blockers.length > 0) {
    const depStatuses = blockers.map((id) => {
      const dep = manifest.tasks.find((t) => t.id === id);
      return `${id}=${dep?.status ?? "ukendt"}`;
    });
    throw new Error(`Dependency ikke opfyldt: ${depStatuses.join(", ")}`);
  }

  task.status = "running";
  task.startedAt = new Date().toISOString();
  writeSession(manifest);
}

export function taskDone(
  sessionId: string,
  taskId: string,
  result: {
    outputSummary: string;
    filesChanged?: string[];
    typesExported?: string[];
  },
): void {
  const manifest = readSession(sessionId);
  const task = manifest.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ikke fundet: ${taskId}`);

  task.status = "done";
  task.completedAt = new Date().toISOString();
  task.durationMs = task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : undefined;
  task.outputSummary = result.outputSummary;
  task.filesChanged = result.filesChanged;
  task.typesExported = result.typesExported;

  const allDone = manifest.tasks.every((t) => t.status === "done" || t.status === "skipped");
  const anyFailed = manifest.tasks.some((t) => t.status === "abandoned");
  if (allDone) manifest.status = anyFailed ? "partial" : "done";

  writeSession(manifest);
}

export function taskFail(
  sessionId: string,
  taskId: string,
  failure: { type: FailureType; message: string; details?: string },
): void {
  const manifest = readSession(sessionId);
  const task = manifest.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ikke fundet: ${taskId}`);

  task.failure = failure;
  task.completedAt = new Date().toISOString();
  task.durationMs = task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : undefined;

  const policy = task.retryPolicy;
  const shouldRetry =
    policy.retryOn.includes(failure.type) && task.retryCount < policy.maxAttempts - 1;

  if (shouldRetry) {
    task.status = "retrying";
    task.retryCount += 1;
  } else {
    task.status = "abandoned";
    cascadeSkip(manifest, taskId);
    manifest.status = "failed";
  }

  writeSession(manifest);
}

function cascadeSkip(manifest: SessionManifest, failedTaskId: string): void {
  for (const task of manifest.tasks) {
    if (task.dependsOn.includes(failedTaskId) && task.status === "pending") {
      task.status = "skipped";
      task.failure = {
        type: "dependency_failed",
        message: `Upstream task '${failedTaskId}' fejlede`,
      };
      cascadeSkip(manifest, task.id);
    }
  }
}

// ─── QA verdict ───────────────────────────────────────────────────────────────

export function writeQAVerdict(verdict: QAVerdict): void {
  ensureDir();
  writeFileSync(
    join(TRACES_DIR, `verdict-${verdict.sessionId}.json`),
    JSON.stringify(verdict, null, 2),
  );
  writeFileSync(verdictPath(), JSON.stringify(verdict, null, 2));
}

export function readLatestVerdict(): QAVerdict | null {
  const path = verdictPath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as QAVerdict;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (!ms) return "–";
  return ms > 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: TaskStatus): string {
  return {
    pending: "○",
    running: "◎",
    done: "✓",
    failed: "✗",
    retrying: "↻",
    abandoned: "✗",
    skipped: "⊘",
  }[status];
}

function printSession(manifest: SessionManifest): void {
  const total = manifest.tasks.length;
  const done = manifest.tasks.filter((t) => t.status === "done").length;
  const failed = manifest.tasks.filter(
    (t) => t.status === "abandoned" || t.status === "failed",
  ).length;

  console.log(`\n━━━ ${manifest.sessionId} ━━━`);
  console.log(
    `Status: ${manifest.status}  |  ${done}/${total} done${failed > 0 ? `  |  ${failed} fejlede` : ""}`,
  );
  if (manifest.triggerIssue) console.log(`Issue: ${manifest.triggerIssue}`);
  console.log("");

  for (const task of manifest.tasks) {
    const icon = statusIcon(task.status);
    const dur = formatDuration(task.durationMs);
    const retry = task.retryCount > 0 ? ` (forsøg ${task.retryCount + 1})` : "";
    console.log(`  ${icon} [${task.agent.padEnd(11)}] ${task.id}${retry}  ${dur}`);
    if (task.outputSummary) {
      console.log(`      → ${task.outputSummary}`);
    }
    if (task.filesChanged?.length) {
      console.log(`      Filer: ${task.filesChanged.join(", ")}`);
    }
    if (task.failure && task.status !== "skipped") {
      console.log(`      ✗ ${task.failure.type}: ${task.failure.message}`);
    }
  }

  if (manifest.qaVerdict) {
    const v = manifest.qaVerdict;
    console.log(
      `\n  QA: ${v.status === "pass" ? "✓ PASS" : "✗ FAIL"}  build=${v.checks.build}  tests=${v.checks.tests}  lint=${v.checks.lint}`,
    );
    if (v.blockers.length > 0) {
      v.blockers.forEach((b) => console.log(`  ✗ ${b}`));
    }
  }
  console.log("");
}

function listSessions(): void {
  ensureDir();
  const files = readdirSync(TRACES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("verdict-") && f !== "latest-verdict.json")
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("Ingen sessioner endnu.");
    return;
  }

  console.log("\nSeneste sessioner:");
  for (const file of files.slice(0, 10)) {
    try {
      const m = JSON.parse(readFileSync(join(TRACES_DIR, file), "utf-8")) as SessionManifest;
      const done = m.tasks.filter((t) => t.status === "done").length;
      const total = m.tasks.length;
      console.log(
        `  ${m.status === "done" ? "✓" : m.status === "failed" ? "✗" : "◎"} ${m.sessionId.padEnd(40)} ${done}/${total}  ${m.triggerIssue ?? ""}`,
      );
    } catch {
      console.log(`  ? ${file}`);
    }
  }
}

// ─── CLI dispatch ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i += 2) {
  if (args[i]?.startsWith("--")) {
    flags[args[i].slice(2)] = args[i + 1] ?? "";
  }
}

switch (cmd) {
  case "list":
    listSessions();
    break;

  case "view":
    if (!flags.session) {
      console.error("--session påkrævet");
      process.exit(1);
    }
    printSession(readSession(flags.session));
    break;

  case "task-start":
    taskStart(flags.session!, flags.task!);
    console.log(`✓ ${flags.task} → running`);
    break;

  case "task-done":
    taskDone(flags.session!, flags.task!, {
      outputSummary: flags.summary ?? "",
      filesChanged: flags.files ? flags.files.split(",") : undefined,
      typesExported: flags.types ? flags.types.split(",") : undefined,
    });
    console.log(`✓ ${flags.task} → done`);
    break;

  case "task-fail":
    taskFail(flags.session!, flags.task!, {
      type: (flags.type ?? "build_failure") as FailureType,
      message: flags.msg ?? "",
      details: flags.details,
    });
    console.log(`✗ ${flags.task} → ${flags.type}`);
    break;

  case "qa-verdict": {
    const verdict: QAVerdict = {
      sessionId: flags.session!,
      status: (flags.status ?? "fail") as "pass" | "fail",
      timestamp: new Date().toISOString(),
      checks: {
        build: (flags.build ?? "skip") as "pass" | "fail" | "skip",
        tests: (flags.tests ?? "skip") as "pass" | "fail" | "skip",
        lint: (flags.lint ?? "skip") as "pass" | "fail" | "skip",
      },
      blockers: flags.blockers ? flags.blockers.split("|") : [],
      warnings: flags.warnings ? flags.warnings.split("|") : [],
      durationMs: parseInt(flags.duration ?? "0"),
    };
    writeQAVerdict(verdict);
    console.log(`QA verdict: ${verdict.status.toUpperCase()}`);
    if (verdict.blockers.length > 0) {
      verdict.blockers.forEach((b) => console.log(`  ✗ ${b}`));
    }
    break;
  }

  default:
    console.log(`
ArchAI Agent Tracer

Kommandoer:
  list                                          Vis alle sessioner
  view    --session <id>                        Vis session detaljer
  task-start  --session <id> --task <id>        Marker task som running
  task-done   --session <id> --task <id>        Marker task som done
               --summary "..." --files "a,b"
  task-fail   --session <id> --task <id>        Marker task som failed
               --type <failureType> --msg "..."
  qa-verdict  --session <id> --status pass|fail QA-gate til CI
               --build pass|fail --tests pass|fail --lint pass|fail
               --blockers "fejl1|fejl2"
`);
}
