import { describe, expect, it, mock } from "bun:test";
import { fetchWithRetry } from "./fetch-with-retry";

describe("fetchWithRetry", () => {
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
});
