import { describe, it, expect } from "bun:test";
import { classifyDrawingReadiness } from "./decision-engine";

const base = {
  hasAddress: true,
  hasMatrikel: true,
  hasParcelPolygon: true,
  hasProposedFootprint: true,
  hasCrsContract: true,
  parcelAreaDiscrepancyPct: 0.5,
  minDistanceToSetbackLineM: 1.5,
  setbackRequirementM: 0.5,
  hasOpmaalteKoter: false,
  hasDhmKoter: true,
  hasExistingBuildingGeometry: true,
  missingDataPoints: [] as string[],
  hasRoadCenterlineGeometry: true,
  hasCenterlineDeklaration: false,
  hasSurveyorAttestation: false,
};

describe("classifyDrawingReadiness", () => {
  it("AUTO_DRAFT naar minimal data er til stede", () => {
    const r = classifyDrawingReadiness({ ...base, hasExistingBuildingGeometry: false, hasDhmKoter: false });
    expect(r.status).toBe("AUTO_DRAFT");
  });

  it("AUTO_REVIEW naar alle kerndata er til stede og afstande er sikre", () => {
    const r = classifyDrawingReadiness(base);
    expect(r.status).toBe("AUTO_REVIEW");
  });

  it("SURVEY_REQUIRED naar bygning er for taet paa byggelinje", () => {
    const r = classifyDrawingReadiness({ ...base, minDistanceToSetbackLineM: 0.2, setbackRequirementM: 2.5 });
    expect(r.status).toBe("SURVEY_REQUIRED");
    expect(r.reasons.some((r) => r.code === "BUILDING_TOO_CLOSE_TO_SETBACK")).toBe(true);
  });

  it("SURVEY_REQUIRED naar parcelarealafvigelse er for stor", () => {
    const r = classifyDrawingReadiness({ ...base, parcelAreaDiscrepancyPct: 2.5 });
    expect(r.status).toBe("SURVEY_REQUIRED");
    expect(r.reasons.some((r) => r.code === "PARCEL_AREA_DISCREPANCY")).toBe(true);
  });

  it("BLOCKED_MISSING_CORE_DATA naar ingen parcelpolygon", () => {
    const r = classifyDrawingReadiness({ ...base, hasParcelPolygon: false });
    expect(r.status).toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("BLOCKED_MISSING_CORE_DATA naar ingen foreslaaet footprint", () => {
    const r = classifyDrawingReadiness({ ...base, hasProposedFootprint: false });
    expect(r.status).toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("missingDataPoints propageres til resultatet", () => {
    const r = classifyDrawingReadiness({ ...base, hasParcelPolygon: false, missingDataPoints: ["parcel.polygon25832"] });
    expect(r.missingDataPoints).toContain("parcel.polygon25832");
  });

  it("SURVEY_REQUIRED naar road_centerline_deklaration eksisterer men vejmidte mangler", () => {
    const r = classifyDrawingReadiness({
      ...base,
      hasRoadCenterlineGeometry: false,
      hasCenterlineDeklaration: true,
      hasSurveyorAttestation: false,
    });
    expect(r.status).toBe("SURVEY_REQUIRED");
    expect(r.reasons.some((r) => r.code === "CENTERLINE_DEKLARATION_WITHOUT_GEOMETRY")).toBe(true);
  });

  it("AUTO_REVIEW naar surveyor-attestation er til stede", () => {
    const r = classifyDrawingReadiness({
      ...base,
      hasRoadCenterlineGeometry: true,
      hasCenterlineDeklaration: true,
      hasSurveyorAttestation: true,
    });
    expect(r.status).toBe("AUTO_REVIEW");
  });
});
