// SERVER-SIDE ONLY — shared fetch helper with timeout + limited retries.

import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";

export type RetryOptions = {
  timeoutMs: number;
  retries: number;
  retryDelayBaseMs: number;
  retryOnStatuses: number[];
  /**
   * Hvis false springes retries over når fetch fejler med
   * AbortError/TimeoutError (typisk vores egen AbortSignal.timeout).
   * Sekventielle retries på timeout forværrer UX uden at hjælpe — bedre at
   * fejle hurtigt og lade caller falde tilbage til degraded data. 5xx-retries
   * påvirkes ikke af denne option. Default true for at bevare eksisterende
   * adfærd for callers der ikke har målt på det.
   */
  retryOnAbort: boolean;
  /**
   * Hvis sat, fyrer vi en parallel duplikat-request efter hedgeAfterMs hvis
   * første request ikke er svaret. Første successful response vinder. Bruges
   * mod flaky endpoints hvor enkelte workers hænger (fx Datafordeler).
   */
  hedgeAfterMs?: number;
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
  retryOnAbort: true,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  // +/- 20%
  const delta = ms * 0.2;
  return ms + (Math.random() * 2 - 1) * delta;
}

function isAbortLikeError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "AbortError" || e.name === "TimeoutError";
}

type Reflected<T> = { kind: "ok"; value: T } | { kind: "err"; error: unknown };

function reflect<T>(p: Promise<T>): Promise<Reflected<T>> {
  return p.then(
    (value) => ({ kind: "ok" as const, value }),
    (error) => ({ kind: "err" as const, error }),
  );
}

async function attemptWithOptionalHedge(
  doFetch: () => Promise<Response>,
  hedgeAfterMs: number | undefined,
): Promise<Response> {
  if (hedgeAfterMs === undefined) {
    return doFetch();
  }

  const firstReflect = reflect(doFetch());
  const HEDGE = Symbol("hedge");
  const hedgeTimer = new Promise<typeof HEDGE>((resolve) => {
    setTimeout(() => resolve(HEDGE), hedgeAfterMs);
  });

  const winner = await Promise.race([firstReflect, hedgeTimer]);
  if (winner !== HEDGE) {
    if (winner.kind === "ok") return winner.value;
    throw winner.error;
  }

  // Hedge triggered — fyr parallel duplikat, vent på første der succeederer.
  const secondReflect = reflect(doFetch());
  const [r1, r2] = await Promise.all([firstReflect, secondReflect]);
  if (r1.kind === "ok") return r1.value;
  if (r2.kind === "ok") return r2.value;
  throw r1.error;
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
      const res = await attemptWithOptionalHedge(
        () => fetch(input, { ...init, signal: AbortSignal.timeout(o.timeoutMs) }),
        o.hedgeAfterMs,
      );
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

      // Retry på timeout/abort kan forværre tingene mod flaky endpoints —
      // de aborterede requests holder serveren beskæftiget men spilder klient-tid.
      if (!o.retryOnAbort && isAbortLikeError(e)) throw e;

      if (attempt === o.retries) throw e;
      const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
      await sleep(delay);
    }
  }

  throw lastErr ?? new Error("fetchWithRetry: ukendt fejl");
}
