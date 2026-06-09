import { describe, it, expect } from "bun:test";
import { buildStepConstraintViewModel } from "./byggeoenske-constraint-view-model";
import type {
  BoligoenskeValidering,
  ComplianceFlag,
  AdressePreCheckResultat,
} from "@/types/project-state";

function makeValidering(overrides: Partial<BoligoenskeValidering> = {}): BoligoenskeValidering {
  return {
    etagerStatus: "ok",
    arealStatus: "ok",
    beregnetBebyggelsespct: null,
    etagerDispensationAcknowledged: false,
    arealDispensationAcknowledged: false,
    ...overrides,
  };
}

function makePreCheck(
  maxEtager: number | null = 2,
  restBygningsareal: number | null = 80,
): AdressePreCheckResultat {
  return {
    blockers: [],
    advarsler: [],
    kontekst: {
      grundareal: 500,
      bebyggetAreal: 120,
      bebyggelsesprocent: 24,
      antalEtager: 1,
      maxBebyggelsesprocent: 30,
      maxEtager,
      maxBygningshoejde: 8.5,
      restBygningsareal,
      ejendomsvaerdi: null,
      grundvaerdi: null,
    },
    bbr: null,
    lokalplaner: [],
    kommuneplanramme: null,
    vurderingData: null,
    complianceMetrics: null,
  };
}

function makeFlag(id: string, overrides: Partial<ComplianceFlag> = {}): ComplianceFlag {
  return {
    id,
    label: id,
    status: "advarsel",
    detalje: null,
    aktuelVærdi: null,
    tilladt: null,
    kilde: "beregnet",
    ...overrides,
  };
}

describe("buildStepConstraintViewModel — antalEtager", () => {
  it("returns contextChip when maxEtager is known", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering(),
      makePreCheck(2),
      [],
    );
    expect(vm.contextChip).toContain("2 etager");
  });

  it("returns null contextChip when maxEtager is null", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering(),
      makePreCheck(null),
      [],
    );
    expect(vm.contextChip).toBeNull();
  });

  it("returns dispensation.needed=true when etagerStatus=dispensation and not acked", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      3,
      makeValidering({ etagerStatus: "dispensation", etagerDispensationAcknowledged: false }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation?.needed).toBe(true);
    expect(vm.dispensation?.acked).toBe(false);
  });

  it("returns dispensation.acked=true when acknowledged", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      3,
      makeValidering({ etagerStatus: "dispensation", etagerDispensationAcknowledged: true }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation?.acked).toBe(true);
    expect(vm.dispensation?.needed).toBe(false);
  });

  it("returns null dispensation when etagerStatus=ok", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering({ etagerStatus: "ok" }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation).toBeNull();
  });
});

describe("buildStepConstraintViewModel — oensketAreal", () => {
  it("returns contextChip with restBygningsareal", () => {
    const vm = buildStepConstraintViewModel(
      "oensketAreal",
      100,
      makeValidering(),
      makePreCheck(2, 80),
      [],
    );
    expect(vm.contextChip).toContain("80 m²");
  });

  it("returns dispensation with beregnetPct when arealStatus=dispensation", () => {
    const vm = buildStepConstraintViewModel(
      "oensketAreal",
      120,
      makeValidering({ arealStatus: "dispensation", beregnetBebyggelsespct: 42 }),
      makePreCheck(2, 80),
      [],
    );
    expect(vm.dispensation?.needed).toBe(true);
    expect(vm.dispensation?.beregnetPct).toBe(42);
  });
});

describe("buildStepConstraintViewModel — varmekilde", () => {
  it("returns fjernvarme=tilgaengelig when tilslutningspligt flag present", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "fjernvarme", null, null, [
      makeFlag("fjernvarme-tilslutningspligt"),
    ]);
    expect(vm.fjernvarme).toBe("tilgaengelig");
  });

  it("returns fjernvarme=mismatch when mismatch flag present", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "varmepumpe", null, null, [
      makeFlag("fjernvarme-mismatch-ingen-daekning"),
    ]);
    expect(vm.fjernvarme).toBe("mismatch");
  });

  it("returns fjernvarme=planlagt when planned district heating flag present", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "varmepumpe", null, null, [
      makeFlag("fjernvarme-planlagt"),
    ]);
    expect(vm.fjernvarme).toBe("planlagt");
  });

  it("returns fjernvarme=unknown when no relevant flags", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "varmepumpe", null, null, []);
    expect(vm.fjernvarme).toBe("unknown");
  });
});

describe("buildStepConstraintViewModel — tagform/facademateriale", () => {
  it("returns lokalplanHint when a flag with appliesTo matches", () => {
    const flag = makeFlag("lokalplan-tagform", {
      detalje: "Kun sadeltag tilladt",
      appliesTo: ["tagform"],
    });
    const vm = buildStepConstraintViewModel("tagform", "fladt", null, null, [flag]);
    expect(vm.lokalplanHint).toBe("Kun sadeltag tilladt");
  });

  it("returns null lokalplanHint when no matching flag", () => {
    const vm = buildStepConstraintViewModel("tagform", "fladt", null, null, []);
    expect(vm.lokalplanHint).toBeNull();
  });
});

describe("buildStepConstraintViewModel — unhandled stepKey", () => {
  it("returns all-null viewmodel for unknown step", () => {
    const vm = buildStepConstraintViewModel("budget", "3-5", null, null, []);
    expect(vm.contextChip).toBeNull();
    expect(vm.dispensation).toBeNull();
    expect(vm.fjernvarme).toBeNull();
    expect(vm.lokalplanHint).toBeNull();
  });
});
