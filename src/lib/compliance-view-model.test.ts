import { describe, expect, it } from "bun:test";
import {
  buildInvisibleBudgetRisks,
  buildRiskOverviewCategories,
  buildSaveFieldView,
  getComplianceFlagCategory,
} from "@/lib/compliance-view-model";
import type { ComplianceFlag } from "@/types/project-state";

function flag(overrides: Partial<ComplianceFlag>): ComplianceFlag {
  return {
    id: "plan-ok",
    label: "Planforhold",
    status: "ok",
    detalje: null,
    aktuelVærdi: null,
    tilladt: null,
    kilde: "plandata",
    ...overrides,
  };
}

function riskLevel(
  categories: ReturnType<typeof buildRiskOverviewCategories>,
  key: string,
): string | undefined {
  return categories.find((category) => category.key === key)?.level;
}

describe("getComplianceFlagCategory", () => {
  it("maps register and derived ids to the cockpit risk categories", () => {
    expect(getComplianceFlagCategory(flag({ id: "geus-radon", kilde: "beregnet" }))).toBe(
      "geoteknik",
    );
    expect(getComplianceFlagCategory(flag({ id: "save-bevaringsvaerdi", kilde: "fbb" }))).toBe(
      "fredning",
    );
    expect(getComplianceFlagCategory(flag({ id: "mat-strandbeskyttelse" }))).toBe("natur");
    expect(getComplianceFlagCategory(flag({ id: "skel-afstand" }))).toBe("naboer");
    expect(getComplianceFlagCategory(flag({ id: "fjernvarme-tilslutning" }))).toBe("forsyning");
    expect(getComplianceFlagCategory(flag({ id: "lokalplan-ramme" }))).toBe("plan");
  });
});

describe("buildRiskOverviewCategories", () => {
  it("uses rule-engine SAVE predicates through the view model", () => {
    expect(
      riskLevel(
        buildRiskOverviewCategories({
          complianceFlags: [],
          heritageSaveValue: 3,
          isFredet: null,
        }),
        "fredning",
      ),
    ).toBe("kritisk");

    expect(
      riskLevel(
        buildRiskOverviewCategories({
          complianceFlags: [],
          heritageSaveValue: 4,
          isFredet: null,
        }),
        "fredning",
      ),
    ).toBe("advarsel");
  });

  it("uses the highest severity in each category", () => {
    const categories = buildRiskOverviewCategories({
      complianceFlags: [
        flag({ id: "geoteknik-ok", status: "ok", kilde: "geus" }),
        flag({ id: "geus-radon", status: "blocker", kilde: "geus" }),
        flag({ id: "fjernvarme-tilslutning", status: "blocker" }),
      ],
      heritageSaveValue: null,
      isFredet: null,
    });

    expect(riskLevel(categories, "geoteknik")).toBe("kritisk");
    expect(riskLevel(categories, "forsyning")).toBe("advarsel");
  });

  it("keeps listed building status separate from SAVE value", () => {
    expect(
      riskLevel(
        buildRiskOverviewCategories({
          complianceFlags: [],
          heritageSaveValue: 8,
          isFredet: true,
        }),
        "fredning",
      ),
    ).toBe("kritisk");
  });
});

describe("buildSaveFieldView", () => {
  it("builds presentation state from SAVE value", () => {
    expect(buildSaveFieldView(null)).toBeNull();
    expect(buildSaveFieldView(3)?.tone).toBe("danger");
    expect(buildSaveFieldView(4)?.tone).toBe("warning");
    expect(buildSaveFieldView(7)?.tone).toBe("success");
  });
});

describe("buildInvisibleBudgetRisks", () => {
  it("adds durable typed SAVE and listed-building risks when flags are missing", () => {
    const risks = buildInvisibleBudgetRisks({
      complianceFlags: [],
      heritageSaveValue: 3,
      isFredet: true,
    });

    expect(risks.map((risk) => risk.key)).toContain("save");
    expect(risks.map((risk) => risk.key)).toContain("fredet");
  });

  it("does not duplicate canonical rule-engine flags", () => {
    const risks = buildInvisibleBudgetRisks({
      complianceFlags: [
        flag({
          id: "regelkerne-save_1_3_demolition",
          label: "SAVE 1-3",
          status: "blocker",
          kilde: "regelkerne",
        }),
      ],
      heritageSaveValue: 3,
      isFredet: null,
    });

    expect(risks.map((risk) => risk.key)).toEqual(["regelkerne-save_1_3_demolition"]);
  });
});
