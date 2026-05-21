import { describe, expect, it } from "bun:test";
import {
  dataStatusMapSchema,
  getReadinessScores,
  parsePersistedDataStatusMap,
  type DataStatusMap,
} from "@/lib/datacheck";

describe("datacheck", () => {
  it("ignorerer ukendte datapunkter i persisted status map", () => {
    const parsed = parsePersistedDataStatusMap({
      rumprogram: {
        fieldId: "rumprogram",
        status: "done",
        updatedAt: new Date().toISOString(),
      },
      ukendt: {
        fieldId: "ukendt",
        status: "done",
        updatedAt: new Date().toISOString(),
      },
    });

    expect(parsed.rumprogram?.status).toBe("done");
    expect(parsed.ukendt).toBeUndefined();
  });

  it("returnerer tomt map for ugyldig persisted payload", () => {
    const parsed = parsePersistedDataStatusMap({
      rumprogram: {
        fieldId: "rumprogram",
        status: "bad-status",
        updatedAt: "ikke-en-dato",
      },
    });

    expect(parsed).toEqual({});
  });

  it("beregner phase score deterministisk", () => {
    const statusMap: DataStatusMap = {
      rumprogram: {
        fieldId: "rumprogram",
        status: "done",
        updatedAt: new Date().toISOString(),
      },
      budget_byggesum: {
        fieldId: "budget_byggesum",
        status: "not_applicable",
        updatedAt: new Date().toISOString(),
      },
    };

    const scores = getReadinessScores(statusMap);
    const skitse = scores.find((score) => score.phase === "skitse");

    expect(skitse).toBeDefined();
    expect((skitse?.pct ?? 0) > 0).toBeTrue();
  });

  it("tomme status maps giver 0 pct", () => {
    const scores = getReadinessScores({});
    for (const score of scores) {
      expect(score.done).toBe(0);
      expect(score.pct).toBe(0);
    }
  });

  it("dataStatusMapSchema filtrerer ukendte ids fra persisted payload", () => {
    const parsed = dataStatusMapSchema.parse({
      rumprogram: {
        fieldId: "rumprogram",
        status: "done",
        updatedAt: new Date().toISOString(),
      },
      ukendt: {
        fieldId: "rumprogram",
        status: "done",
        updatedAt: new Date().toISOString(),
      },
    });

    expect(parsed.rumprogram?.status).toBe("done");
    expect("ukendt" in parsed).toBe(false);
  });
});
