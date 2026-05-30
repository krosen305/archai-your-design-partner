import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fetchWithRetry } from "./fetch-with-retry";
import { resetMockedFetch } from "@/testing/fetch-mocks";

function makeAbortError(): Error {
  // AbortSignal.timeout fires a DOMException with name "TimeoutError"; some
  // runtimes use "AbortError". Begge skal behandles ens af retryOnAbort.
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  return e;
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    mock.restore();
    resetMockedFetch();
  });

  it("retries on 429 and eventually succeeds", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      if (calls === 1)
        return { status: 429, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      return { status: 200 } as Response;
    }) as any;

    const result = await fetchWithRetry(
      "https://example.com",
      {},
      { retries: 1, retryDelayBaseMs: 1 },
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries retryable status and eventually succeeds", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      if (calls === 1)
        return { status: 503, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      return { status: 200 } as Response;
    }) as any;

    const result = await fetchWithRetry(
      "https://example.com",
      {},
      { retries: 1, retryDelayBaseMs: 1 },
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  describe("retryOnAbort: false", () => {
    it("kaster AbortError straks uden retry", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        throw makeAbortError();
      }) as any;

      await expect(
        fetchWithRetry(
          "https://example.com",
          {},
          { retries: 3, retryDelayBaseMs: 1, retryOnAbort: false },
        ),
      ).rejects.toThrow();
      expect(calls).toBe(1);
    });

    it("retrier stadig 5xx selvom retryOnAbort=false", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        if (calls === 1)
          return { status: 503, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
        return { status: 200 } as Response;
      }) as any;

      const result = await fetchWithRetry(
        "https://example.com",
        {},
        { retries: 1, retryDelayBaseMs: 1, retryOnAbort: false },
      );
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    });

    it("retrier stadig anden netværksfejl der ikke er abort", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        if (calls === 1) throw new Error("ECONNRESET");
        return { status: 200 } as Response;
      }) as any;

      const result = await fetchWithRetry(
        "https://example.com",
        {},
        { retries: 1, retryDelayBaseMs: 1, retryOnAbort: false },
      );
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    });
  });

  describe("hedgeAfterMs", () => {
    it("fyrer hedged request når første ikke svarer inden hedgeAfterMs", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        if (calls === 1) {
          // Første request hænger længe — over hedge-grænsen
          await new Promise((r) => setTimeout(r, 200));
          return { status: 200 } as Response;
        }
        // Andet request svarer hurtigt
        return { status: 200 } as Response;
      }) as any;

      const result = await fetchWithRetry(
        "https://example.com",
        {},
        { retries: 0, timeoutMs: 1000, hedgeAfterMs: 20 },
      );
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    });

    it("springer hedge over hvis første svarer inden hedgeAfterMs", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        return { status: 200 } as Response;
      }) as any;

      const result = await fetchWithRetry(
        "https://example.com",
        {},
        { retries: 0, timeoutMs: 1000, hedgeAfterMs: 100 },
      );
      expect(result.status).toBe(200);
      expect(calls).toBe(1);
    });

    it("returnerer success selv hvis hedge-request fejler men første lykkes", async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => {
        calls += 1;
        if (calls === 1) {
          await new Promise((r) => setTimeout(r, 80));
          return { status: 200 } as Response;
        }
        throw new Error("hedge request fejlede");
      }) as any;

      const result = await fetchWithRetry(
        "https://example.com",
        {},
        { retries: 0, timeoutMs: 1000, hedgeAfterMs: 10 },
      );
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    });
  });
});
