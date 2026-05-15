import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NaturbeskyttelseService } from "./naturbeskyttelse";

describe("NaturbeskyttelseService.getTilstand", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("maps layer hits to booleans", async () => {
    let call = 0;
    const totals = [1, 0, 1, 0, 0];
    globalThis.fetch = mock(async () => {
      const n = totals[call++]!;
      return { ok: true, status: 200, json: async () => ({ totalFeatures: n }) } as Response;
    }) as any;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.strandbeskyttelse).toBe(true);
    expect(result.skovbyggelinje).toBe(false);
    expect(result.soebeskyttelse).toBe(true);
    expect(result.kirkebyggelinje).toBe(false);
  });
});
