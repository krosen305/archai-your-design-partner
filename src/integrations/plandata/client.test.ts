import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PlandataService, selectKommuneplanrammeForCompliance, selectPrimaryLokalplanForPdf } from "./client";
import type { Kommuneplanramme, Lokalplan } from "./client";

describe("PlandataService", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns validation error when coordinates are missing", async () => {
    const result = await PlandataService.getLokalplanerForKoordinat(0, 0);
    expect(result.fejl).toContain("Koordinater mangler");
  });

  it("maps lokalplan features", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              id: "lp1",
              properties: { planid: "1", plannavn: "Plan A", komnr: 101, datovedt: 20200101 },
            },
          ],
        }),
      } as Response;
    }) as any;

    const result = await PlandataService.getLokalplanerForKoordinat(12.5, 55.7);
    expect(result.lokalplaner).toHaveLength(1);
    expect(result.lokalplaner[0]?.plannavn).toBe("Plan A");
    expect(result.fejl).toBeNull();
  });
});

describe("selectKommuneplanrammeForCompliance (ARCH-228)", () => {
  const ramme = (bebygpct: number | null, maxetager: number | null = null): Kommuneplanramme => ({
    planid: String(bebygpct),
    plannavn: "Test",
    plannr: null,
    kommunenavn: null,
    komnr: null,
    bebygpct,
    maxetager,
    maxbygnhjd: null,
    anvgen: null,
    anvendelseGenerel: null,
    fremtidigzonestatus: null,
    sforhold: null,
    planstatus: "V",
    datoIkraft: null,
    plandokumentLink: null,
  });

  it("returnerer null for tom liste", () => {
    expect(selectKommuneplanrammeForCompliance([])).toBeNull();
  });

  it("returnerer eneste ramme direkte", () => {
    const r = ramme(30);
    expect(selectKommuneplanrammeForCompliance([r])).toBe(r);
  });

  it("vælger laveste bebygpct uanset rækkefølge", () => {
    const a = ramme(30);
    const b = ramme(25);
    expect(selectKommuneplanrammeForCompliance([a, b])!.bebygpct).toBe(25);
    expect(selectKommuneplanrammeForCompliance([b, a])!.bebygpct).toBe(25);
  });

  it("bruger maxetager som tiebreaker ved ens bebygpct", () => {
    const a = ramme(30, 2);
    const b = ramme(30, 3);
    expect(selectKommuneplanrammeForCompliance([a, b])!.maxetager).toBe(2);
  });

  it("null bebygpct taber for ikke-null", () => {
    const a = ramme(null);
    const b = ramme(30);
    expect(selectKommuneplanrammeForCompliance([a, b])!.bebygpct).toBe(30);
  });
});

describe("selectPrimaryLokalplanForPdf (ARCH-228)", () => {
  const lp = (status: string | null, datoVedtaget: string | null = null, planid = "1"): Lokalplan => ({
    planid,
    plannavn: "Test",
    plannr: null,
    kommunenavn: null,
    komnr: null,
    datoVedtaget,
    datoIkraft: null,
    plandokumentLink: `https://pdf/${planid}`,
    plantype: null,
    status,
    anvgen: null,
    anvendelseGenerel: null,
  });

  it("returnerer null for tom liste", () => {
    expect(selectPrimaryLokalplanForPdf([])).toBeNull();
  });

  it("vedtaget vælges over forslag", () => {
    const vedtaget = lp("V", "20200101", "vedtaget");
    const forslag = lp("F", "20221201", "forslag");
    expect(selectPrimaryLokalplanForPdf([forslag, vedtaget])!.planid).toBe("vedtaget");
  });

  it("nyeste vedtagne vælges ved to vedtagne", () => {
    const gammel = lp("V", "20180101", "gammel");
    const ny = lp("V", "20220101", "ny");
    expect(selectPrimaryLokalplanForPdf([gammel, ny])!.planid).toBe("ny");
  });

  it("forslag bevares i originallisten — selectPrimary muterer ikke listen", () => {
    const liste = [lp("F", "20221201", "forslag"), lp("V", "20200101", "vedtaget")];
    selectPrimaryLokalplanForPdf(liste);
    expect(liste).toHaveLength(2);
  });
});
