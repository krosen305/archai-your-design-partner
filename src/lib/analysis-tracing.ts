// SERVER-SIDE ONLY - internal technical tracing for analysis/debugging.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";

export type AnalysisRunKind =
  | "precheck"
  | "full_analysis"
  | "byggeanalyse"
  | "ai_design"
  | "project_sync";

export type AnalysisRunStatus = "running" | "done" | "failed" | "partial";
export type AnalysisEventType =
  | "api_call"
  | "cache_read"
  | "cache_write"
  | "db_read"
  | "db_write"
  | "pipeline_step";
export type AnalysisEventStatus = "ok" | "error" | "skipped";

export type AnalysisTraceContext = {
  runId: string | null;
  runKind?: AnalysisRunKind;
  projectId?: string | null;
  addressId?: string | null;
  userId?: string | null;
  source?: string;
};

type StartRunInput = {
  runKind: AnalysisRunKind;
  projectId?: string | null;
  addressId?: string | null;
  userId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
};

type EventInput = {
  eventType: AnalysisEventType;
  phase?: string | null;
  service: string;
  operation: string;
  status?: AnalysisEventStatus;
  cacheHit?: boolean | null;
  attempt?: number | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

type TraceStepOptions<T> = {
  cacheHit?: boolean | ((value: T) => boolean);
  metadata?: Record<string, unknown> | ((value: T) => Record<string, unknown>);
};

let persistenceDisabled = false;

function nowMs() {
  return Date.now();
}

function truncate(value: string | null | undefined, max = 1200): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asJson(value: Record<string, unknown> | undefined): Json {
  if (!value) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return {};
  }
}

export async function startAnalysisRun(input: StartRunInput): Promise<AnalysisTraceContext> {
  const fallbackId = crypto.randomUUID();
  const context: AnalysisTraceContext = {
    runId: fallbackId,
    runKind: input.runKind,
    projectId: input.projectId ?? null,
    addressId: input.addressId ?? null,
    userId: input.userId ?? null,
    source: input.source ?? "server",
  };

  if (persistenceDisabled) return context;

  try {
    const { error } = await (supabaseAdmin.from as any)("analysis_runs").insert({
      id: fallbackId,
      run_kind: input.runKind,
      project_id: input.projectId ?? null,
      address_id: input.addressId ?? null,
      user_id: input.userId ?? null,
      source: input.source ?? "server",
      metadata: asJson(input.metadata),
    });

    if (error) throw error;
  } catch (e) {
    persistenceDisabled = true;
    logger.warn("[AnalysisTrace] tracing deaktiveret:", errorMessage(e));
  }

  return context;
}

export async function finishAnalysisRun(
  trace: AnalysisTraceContext | null | undefined,
  status: Exclude<AnalysisRunStatus, "running">,
  startedAtMs: number,
  error?: unknown,
): Promise<void> {
  if (!trace?.runId || persistenceDisabled) return;

  try {
    const { error: updateError } = await (supabaseAdmin.from as any)("analysis_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        duration_ms: Math.max(0, nowMs() - startedAtMs),
        error_message: error ? truncate(errorMessage(error)) : null,
      })
      .eq("id", trace.runId);

    if (updateError) throw updateError;
  } catch (e) {
    persistenceDisabled = true;
    logger.warn("[AnalysisTrace] finish fejlede:", errorMessage(e));
  }
}

export async function recordAnalysisEvent(
  trace: AnalysisTraceContext | null | undefined,
  input: EventInput,
): Promise<void> {
  if (!trace?.runId || persistenceDisabled) return;

  try {
    const { error } = await (supabaseAdmin.from as any)("analysis_events").insert({
      run_id: trace.runId,
      event_type: input.eventType,
      phase: input.phase ?? null,
      service: input.service,
      operation: input.operation,
      status: input.status ?? "ok",
      cache_hit: input.cacheHit ?? null,
      attempt: input.attempt ?? null,
      http_status: input.httpStatus ?? null,
      duration_ms: input.durationMs ?? null,
      error_message: truncate(input.errorMessage),
      metadata: asJson(input.metadata),
    });

    if (error) throw error;
  } catch (e) {
    persistenceDisabled = true;
    logger.warn("[AnalysisTrace] event fejlede:", errorMessage(e));
  }
}

export async function traceStep<T>(
  trace: AnalysisTraceContext | null | undefined,
  input: Omit<EventInput, "status" | "durationMs" | "errorMessage" | "cacheHit" | "metadata">,
  fn: () => Promise<T>,
  options?: TraceStepOptions<T>,
): Promise<T> {
  const startedAt = nowMs();

  try {
    const value = await fn();
    const metadata =
      typeof options?.metadata === "function" ? options.metadata(value) : options?.metadata;
    const cacheHit =
      typeof options?.cacheHit === "function" ? options.cacheHit(value) : options?.cacheHit;

    await recordAnalysisEvent(trace, {
      ...input,
      status: "ok",
      durationMs: Math.max(0, nowMs() - startedAt),
      cacheHit,
      metadata,
    });

    return value;
  } catch (e) {
    await recordAnalysisEvent(trace, {
      ...input,
      status: "error",
      durationMs: Math.max(0, nowMs() - startedAt),
      errorMessage: errorMessage(e),
    });
    throw e;
  }
}

export function createChildTrace(
  trace: AnalysisTraceContext | null | undefined,
): AnalysisTraceContext | null {
  if (!trace?.runId) return null;
  return { ...trace };
}
