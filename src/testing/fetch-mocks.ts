type MockJson = Record<string, unknown> | Array<unknown>;

type MockResponseInit = {
  status?: number;
  headers?: Record<string, string>;
};

const ORIGINAL_FETCH = globalThis.fetch;

export function resetMockedFetch() {
  globalThis.fetch = ORIGINAL_FETCH;
}

export function installSequentialJsonFetch(responses: MockJson[], init?: MockResponseInit) {
  let index = 0;
  const status = init?.status ?? 200;
  const headers = init?.headers ?? { "content-type": "application/json" };

  const calls: Array<[unknown, unknown?]> = [];
  const spy = (async (url: unknown, fetchInit?: unknown) => {
    calls.push([url, fetchInit]);
    const json = responses[index++] ?? { data: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
      },
      text: async () => JSON.stringify(json),
      json: async () => json,
    } as unknown as Response;
  }) as typeof globalThis.fetch & { mock: { calls: Array<[unknown, unknown?]> } };

  spy.mock = { calls };
  globalThis.fetch = spy;
  return spy;
}
