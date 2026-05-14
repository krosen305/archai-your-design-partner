// SERVER-SIDE ONLY — shared fetch helper with timeout + limited retries.

export type RetryOptions = {
  timeoutMs: number;
  retries: number;
  retryDelayBaseMs: number;
  retryOnStatuses: number[];
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
): Promise<Response> {
  const o: RetryOptions = { ...DEFAULTS, ...(options ?? {}) };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    try {
      const res = await fetch(input, { ...init, signal: AbortSignal.timeout(o.timeoutMs) });
      if (!o.retryOnStatuses.includes(res.status) || attempt === o.retries) return res;

      // Consume body so the next retry isn't blocked by unread stream.
      await res.arrayBuffer().catch(() => null);
      const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
      await sleep(delay);
      continue;
    } catch (e) {
      lastErr = e;
      if (attempt === o.retries) throw e;
      const delay = jitter(o.retryDelayBaseMs * Math.pow(2, attempt));
      await sleep(delay);
    }
  }

  throw lastErr ?? new Error("fetchWithRetry: ukendt fejl");
}
