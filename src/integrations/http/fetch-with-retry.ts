// SERVER-SIDE ONLY — shared fetch helper with timeout + limited retries.

import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";

export type RetryOptions = {
  timeoutMs: number;
  retries: number;
  retryDelayBaseMs: number;
  retryOnStatuses: number[];
};

export type FetchTraceOptions = {
  trace?: AnalysisTraceContext | null;
  service: string;
  operation: string;
  phase?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULTS: RetryOptions = {
  timeoutMs: 10_000,
  retries: 2,
  retryDelayBaseMs: 500,
  retryOnStatuses: [429, 502, 503, 504],
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  // +/- 20%
  const delta = ms * 0.2;
  return ms + (Math.random() * 2 - 1) * delta;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: Partial<RetryOptions>,
  traceOptions?: FetchTraceOptions,
): Promise<Response> {
  const o: RetryOptions = { ...DEFAULTS, ...(options ?? {}) };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(input, { ...init, signal: AbortSignal.timeout(o.timeoutMs) });
      await recordAnalysisEvent(traceOptions?.trace, {
        eventType: "api_call",
        phase: traceOptions?.phase,
        service: traceOptions?.service ?? "HTTP",
        operation: traceOptions?.operation ?? "fetch",
        status: res.ok ? "ok" : "error",
        attempt: attempt + 1,
        httpStatus: res.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        metadata: traceOptions?.metadata,
      });

      if (!o.retryOnStatuses.includes(res.status) || attempt === o.retries) return res;

      // Consume body so the next retry isn't blocked by unread stream.
      await res.arrayBuffer().catch(() => null);
      const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
      await sleep(delay);
      continue;
    } catch (e) {
      lastErr = e;
      await recordAnalysisEvent(traceOptions?.trace, {
        eventType: "api_call",
        phase: traceOptions?.phase,
        service: traceOptions?.service ?? "HTTP",
        operation: traceOptions?.operation ?? "fetch",
        status: "error",
        attempt: attempt + 1,
        durationMs: Math.max(0, Date.now() - startedAt),
        errorMessage: e instanceof Error ? e.message : String(e),
        metadata: traceOptions?.metadata,
      });

      if (attempt === o.retries) throw e;
      const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
      await sleep(delay);
    }
  }

  throw lastErr ?? new Error("fetchWithRetry: ukendt fejl");
}
