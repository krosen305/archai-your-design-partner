import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type ServerLogSeverity = "degraded" | "ignored" | "fatal";

type ServerLogInput = {
  module: string;
  operation: string;
  severity: ServerLogSeverity;
  message: string;
  error?: unknown;
  trace?: AnalysisTraceContext | null;
  metadata?: Record<string, unknown>;
};

function normalizeError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function logServerEvent(input: ServerLogInput): void {
  const payload: Record<string, unknown> = {
    module: input.module,
    operation: input.operation,
    severity: input.severity,
    message: input.message,
  };

  if (input.trace?.runId) payload.traceId = input.trace.runId;
  if (input.trace?.addressId) payload.addressId = input.trace.addressId;
  if (input.metadata) payload.metadata = input.metadata;

  const errorMessage = normalizeError(input.error);
  if (errorMessage) payload.error = errorMessage;

  if (input.severity === "fatal") {
    console.error("[ServerLog]", payload);
    return;
  }

  console.warn("[ServerLog]", payload);
}
