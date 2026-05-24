import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PlandataService } from "./client";
import {
  selectKommuneplanrammeForCompliance,
  selectMostSpecificDelomraade,
  selectPreferredByggefelt,
  selectPreferredWastewaterPlan,
  selectPrimaryLokalplanForPdf,
} from "./selectors";
import type { Kommuneplanramme, Lokalplan } from "./client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

describe("PlandataService", () => {
  beforeEach(() => {
    mock.restore();
    resetMockedFetch();
  });

  it("returns validation error when coordinates are missing", async () => {
    const result = await PlandataService.getLokalplanerForKoordinat(0, 0);
    expect(result.fejl).toContain("Koordinater mangler");
  });

  it("maps lokalplan features", async () => {
    installSequentialJsonFetch([
      {
        features: [
          {
            id: "lp1",
            properties: { planid: "1", plannavn: "Plan A", komnr: 101, datovedt: 20200101 },
          },
        ],
      },
    ]);

    const result = await PlandataService.getLokalplanerForKoordinat(12.5, 55.7);
    expect(result.lokalplaner).toHaveLength(1);
    expect(result.lokalplaner[0]?.plannavn).toBe("Plan A");
    expect(result.fejl).toBeNull();
  });

  it("returns structured error on invalid WFS response", async () => {
    installSequentialJsonFetch([{ features: "invalid" }]);

    const result = await PlandataService.getLokalplanerForKoordinat(12.5, 55.7);
    expect(result.lokalplaner).toEqual([]);
    expect(result.fejl).toContain("features");
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
  const lp = (
    status: string | null,
    datoVedtaget: string | null = null,
    planid = "1",
  ): Lokalplan => ({
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

  it("manglende plandokumentLink hindrer ikke selektion — plan returneres stadig", () => {
    const uden: Lokalplan = { ...lp("V", "20220101", "uden"), plandokumentLink: null };
    expect(selectPrimaryLokalplanForPdf([uden])).not.toBeNull();
    expect(selectPrimaryLokalplanForPdf([uden])!.plandokumentLink).toBeNull();
  });

  it("vedtaget plan uden PDF-link vinder over forslag med PDF-link", () => {
    const vedtagetUdenLink: Lokalplan = {
      ...lp("V", "20200101", "vedtaget"),
      plandokumentLink: null,
    };
    const forslagMedLink = lp("F", "20221201", "forslag");
    expect(selectPrimaryLokalplanForPdf([forslagMedLink, vedtagetUdenLink])!.planid).toBe(
      "vedtaget",
    );
  });

  it("vælger korrekt ved tre planer med blanding af status og datoer", () => {
    const gammel = lp("V", "20150101", "gammel");
    const ny = lp("V", "20230601", "ny");
    const forslag = lp("F", "20231201", "forslag");
    expect(selectPrimaryLokalplanForPdf([forslag, gammel, ny])!.planid).toBe("ny");
  });
});

describe("Plandata extension selectors (ARCH-244)", () => {
  it("selectMostSpecificDelomraade prefers the primary localplan", () => {
    const result = selectMostSpecificDelomraade(
      [
        {
          planid: "a",
          delnr: "1",
          datoVedtaget: "20200101",
          datoIkraft: "20200115",
          status: "V",
          zoneStatus: null,
        },
        {
          planid: "b",
          delnr: "2",
          datoVedtaget: "20250101",
          datoIkraft: "20250115",
          status: "V",
          zoneStatus: "landzone",
        },
      ],
      "a",
    );

    expect(result?.planid).toBe("a");
  });

  it("selectPreferredByggefelt prefers matching delnr over newer unrelated field", () => {
    const result = selectPreferredByggefelt(
      [
        {
          id: "felt-1",
          planid: "1",
          lokplanId: "100",
          delnr: "A",
          datoVedtaget: "20200101",
          datoIkraft: "20200115",
          status: "V",
        },
        {
          id: "felt-2",
          planid: "2",
          lokplanId: "100",
          delnr: "B",
          datoVedtaget: "20250101",
          datoIkraft: "20250115",
          status: "V",
        },
      ],
      "100",
      "A",
    );

    expect(result?.id).toBe("felt-1");
  });

  it("selectPreferredWastewaterPlan prefers latest datoIkraft", () => {
    const result = selectPreferredWastewaterPlan([
      { sourceId: "old", datoIkraft: "20200101", datoVedtaget: "20190101" },
      { sourceId: "new", datoIkraft: "20240101", datoVedtaget: "20230101" },
    ]);

    expect(result?.sourceId).toBe("new");
  });
});
