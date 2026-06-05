import "@/testing/react-test-setup";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, within } from "@testing-library/react";
import type { VerificationFinding } from "@/domain/floor-plan/verification-engine";
import { VerificationPanel } from "./VerificationPanel";

afterEach(() => {
  cleanup();
});

const noop = async () => {};

const baseProps = {
  busy: false,
  liveFindings: [],
  formalVerification: null,
  exportResult: null,
  onVerify: noop,
  onExport: noop,
};

function makeBlocking(): VerificationFinding {
  return {
    id: "FP-TOPO-003/opening-1",
    severity: "blocking",
    category: "topology",
    message: "Manglende flugtvej",
    affectedElementIds: ["opening-1"],
    source: "deterministic",
    nextAction: "Tilføj en dør til et sikkert område.",
  };
}

function makeWarning(): VerificationFinding {
  return {
    id: "FP-GEO-002/area",
    severity: "warning",
    category: "geometry",
    message: "Lavt dagslys",
    affectedElementIds: [],
    source: "deterministic",
    nextAction: "Kontrollér vinduesareal.",
  };
}

function makeInfo(): VerificationFinding {
  return {
    id: "FP-MAT-001/walls",
    severity: "info",
    category: "material_basis",
    message: "Manglende assembly info",
    affectedElementIds: ["wall-1"],
    source: "deterministic",
    nextAction: "Tildel assembly til vægge.",
  };
}

function makeReviewRequired(): VerificationFinding {
  return {
    id: "FP-BR18-001/review",
    severity: "review_required",
    category: "br18",
    message: "Kræver myndighedsreview",
    affectedElementIds: [],
    source: "deterministic",
    nextAction: "Indsend til Byggesagsafdelingen.",
  };
}

describe("VerificationPanel", () => {
  it("viser message for hvert finding", () => {
    const findings = [makeWarning(), makeBlocking()];
    const { getByText } = render(<VerificationPanel {...baseProps} localFindings={findings} />);
    expect(getByText("Manglende flugtvej")).toBeTruthy();
    expect(getByText("Lavt dagslys")).toBeTruthy();
  });

  it("sorterer blocking før warning i DOM-rækkefølge", () => {
    // Findings passed in warning-first order; blocking must appear first in DOM
    const findings = [makeWarning(), makeBlocking()];
    const { container } = render(<VerificationPanel {...baseProps} localFindings={findings} />);
    const nodes = [...container.querySelectorAll("[data-finding-severity]")].map((n) =>
      n.getAttribute("data-finding-severity"),
    );
    expect(nodes[0]).toBe("blocking");
    expect(nodes).toContain("warning");
  });

  it("sorterer blocking → review_required → warning → info", () => {
    const findings = [makeInfo(), makeWarning(), makeReviewRequired(), makeBlocking()];
    const { container } = render(<VerificationPanel {...baseProps} localFindings={findings} />);
    const nodes = [...container.querySelectorAll("[data-finding-severity]")].map((n) =>
      n.getAttribute("data-finding-severity"),
    );
    expect(nodes).toEqual(["blocking", "review_required", "warning", "info"]);
  });

  it("viser nextAction tekst", () => {
    const findings = [makeBlocking()];
    const { getByText } = render(<VerificationPanel {...baseProps} localFindings={findings} />);
    expect(getByText("Tilføj en dør til et sikkert område.")).toBeTruthy();
  });

  it("viser ingenting i listen når findings er tomt", () => {
    const { getByText } = render(<VerificationPanel {...baseProps} localFindings={[]} />);
    expect(getByText("Ingen deterministiske findings på den aktuelle model.")).toBeTruthy();
  });

  it("bruger formalVerification.findings frem for localFindings", () => {
    const local = [makeWarning()];
    const formal = {
      status: "BLOCKED" as const,
      findings: [makeBlocking()],
      metrics: {
        netAreaM2: null,
        grossAreaM2: null,
        roomsCount: 0,
        openingsCount: 0,
      },
    };
    const { container } = render(
      <VerificationPanel {...baseProps} localFindings={local} formalVerification={formal} />,
    );
    const scope = within(container);
    // formal findings (blocking) should appear, local-only (warning) should not
    expect(scope.getByText("Manglende flugtvej")).toBeTruthy();
    expect(scope.queryByText("Lavt dagslys")).toBeNull();
  });
});
