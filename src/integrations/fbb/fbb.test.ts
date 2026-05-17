import { beforeEach, describe, expect, it, mock } from "bun:test";
import { FbbService } from "./client";

describe("FbbService.getSaveData", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns empty result for empty ids", async () => {
    const result = await FbbService.getSaveData([]);
    expect(result.fbb_bygninger).toEqual([]);
    expect(result.fbb_bedste_bygning).toBeNull();
    expect(result.kilde).toBe("ingen-ids");
  });

  it("maps JSON features and picks lowest save value >= 1", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({
            features: [
              {
                properties: {
                  bygningsid: 1,
                  bygningsnummer: 11,
                  bevaringsvaerdi: 5,
                  fredet: false,
                },
              },
              {
                properties: {
                  bygningsid: 2,
                  bygningsnummer: 22,
                  bevaringsvaerdi: 3,
                  fredet: false,
                },
              },
              {
                properties: {
                  bygningsid: 3,
                  bygningsnummer: 33,
                  bevaringsvaerdi: -1,
                  fredet: false,
                },
              },
            ],
          }),
      } as Response;
    }) as any;

    const result = await FbbService.getSaveData(["uuid-1", "uuid-2", "uuid-3"]);
    expect(result.fbb_bygninger).toHaveLength(3);
    expect(result.fbb_bedste_bygning?.bygningsid).toBe(2);
    expect(result.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
    expect(result.fbb_er_fredet).toBe(false);
  });

  it("sætter fbb_er_fredet=true når mindst én bygning er fredet", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({
            features: [
              {
                properties: {
                  bygningsid: 1,
                  bygningsnummer: 11,
                  bevaringsvaerdi: -1,
                  fredet: true,
                },
              },
            ],
          }),
      } as Response;
    }) as any;

    const result = await FbbService.getSaveData(["uuid-1"]);
    expect(result.fbb_er_fredet).toBe(true);
  });

  it("queries FBB by ois_id instead of bygningsid", async () => {
    const fetchSpy = mock(async (url: string) => {
      expect(url).toContain("CQL_FILTER=ois_id+IN+%28%27uuid-1%27%2C%27uuid-2%27%29");
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ features: [] }),
      } as Response;
    });
    globalThis.fetch = fetchSpy as any;

    await FbbService.getSaveData(["uuid-1", "uuid-2"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
