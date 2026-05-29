import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NaturbeskyttelseService } from "./naturbeskyttelse";

describe("NaturbeskyttelseService.getTilstand", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returnerer SourceResult med status=ok og maps layer hits til booleans", async () => {
    let call = 0;
    const totals = [1, 0, 1, 0, 0];
    globalThis.fetch = mock(async () => {
      const n = totals[call++]!;
      return { ok: true, status: 200, json: async () => ({ totalFeatures: n }) } as Response;
    }) as any;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.strandbeskyttelse).toBe(true);
    expect(result.data?.skovbyggelinje).toBe(false);
    expect(result.data?.soebeskyttelse).toBe(true);
    expect(result.data?.kirkebyggelinje).toBe(false);
  });

  it("returnerer status=error når alle lag fejler (typed degraded state, P0/P1 #3)", async () => {
    globalThis.fetch = mock(async () => {
      return { ok: false, status: 500, text: async () => "Internal Server Error" } as Response;
    }) as any;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("error");
    expect(result.confidence).toBe("unknown");
    expect(result.data).toBeNull();
  });

  it("returnerer ok med confidence=unknown når nogen lag fejler men andre lykkes", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      if (call++ === 0) {
        return { ok: false, status: 500 } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ totalFeatures: 0 }) } as Response;
    }) as any;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("unknown");
    expect(result.data?.strandbeskyttelse).toBe(false);
  });
});
