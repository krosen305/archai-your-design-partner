// src/services/floor-plan/verify-floor-plan.service.ts
//
// Application service for formal floor-plan verification (spec §17.4, §10.4).
// Orchestrates trusted data + the deterministic domain engine; never trusts
// client-provided compliance state. As an application service it MAY bridge
// domain/floor-plan and domain/drawing (the domain modules must not import each
// other — the service owns the cross-CRS footprint check, spec §23.3.4).

import { hashCanonical } from "@/domain/floor-plan/canonical-hash";
import {
  deriveStatus,
  runVerification,
  type FloorPlanVerificationStatus,
  type FloorPlanVerificationReport,
  type VerificationFinding,
} from "@/domain/floor-plan/verification-engine";
import { localToSite25832 } from "@/domain/geometry/local-transform";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import type { FloorPlanReadPort, FloorPlanVerificationStorePort } from "@/domain/floor-plan/ports";
import { polygonAreaM2, polygonOverlapAreaM2 } from "@/domain/drawing/geometry-engine";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";
import { assertCanVerify, type FloorPlanPrincipal } from "./principal";

export type { FloorPlanPrincipal } from "./principal";

// --- Ports -----------------------------------------------------------------
// FloorPlanReadPort and FloorPlanVerificationStorePort live in domain/floor-plan
// /ports.ts. The trusted-site port stays here because it carries drawing GeoJSON.

export interface TrustedSitePort {
  /** Trusted, server-side footprint polygon in EPSG:25832, or null if unknown. */
  loadFootprint25832(projectId: string): Promise<GeoJsonPolygon25832 | null>;
}

export type VerifyFloorPlanDeps = {
  read: FloorPlanReadPort;
  site: TrustedSitePort;
  store: FloorPlanVerificationStorePort;
};

export type VerifyFloorPlanInput = {
  projectId: string;
  floorPlanIterationId: string;
};

export type FloorPlanVerificationResult = FloorPlanVerificationReport & {
  inputHash: string;
  verifiedAt: string;
  verificationId: string;
};

// --- Service ---------------------------------------------------------------

export async function verifyFloorPlan(
  input: VerifyFloorPlanInput,
  principal: FloorPlanPrincipal,
  deps: VerifyFloorPlanDeps,
): Promise<FloorPlanVerificationResult> {
  assertCanVerify(principal);

  const doc = await deps.read.loadActiveDocument(input.projectId, input.floorPlanIterationId);
  if (!doc) {
    throw new Error(
      `verifyFloorPlan: ingen aktiv plantegning for ${input.projectId}/${input.floorPlanIterationId}.`,
    );
  }

  const report = runVerification(doc);

  const footprint = await deps.site.loadFootprint25832(input.projectId);
  const footprintFindings = checkFootprint(doc, footprint);

  const findings = [...report.findings, ...footprintFindings];
  const status = deriveStatus(findings);

  const inputHash = await hashCanonical({ document: doc, footprint });
  const verifiedAt = new Date().toISOString();

  const verificationId = await deps.store.saveVerification({
    projectId: input.projectId,
    floorPlanIterationId: input.floorPlanIterationId,
    inputHash,
    status,
    findingsJson: findings,
    missingDataPoints: report.missingDataPoints,
    verifiedBy: principal.subjectId,
  });

  return { ...report, status, findings, inputHash, verifiedAt, verificationId };
}

// --- FP-GEO-003: cross-CRS footprint containment ---------------------------

const FOOTPRINT_CONTAINMENT_MIN_RATIO = 0.99;

function checkFootprint(
  doc: FloorPlanDocument,
  footprint: GeoJsonPolygon25832 | null,
): VerificationFinding[] {
  if (!footprint) {
    return [
      finding(
        "FP-GEO-003/no-footprint",
        "Der findes intet trusted footprint, så planens placering på matriklen kan ikke verificeres.",
        [],
        "Knyt et footprint fra Matriklen/beliggenhedsplanen til projektet.",
      ),
    ];
  }

  const plan = planFootprint25832(doc);
  if (!plan) return [];

  const planArea = polygonAreaM2(plan);
  if (planArea <= 0) return [];
  const overlap = polygonOverlapAreaM2(plan, footprint);
  if (overlap / planArea < FOOTPRINT_CONTAINMENT_MIN_RATIO) {
    return [
      finding(
        "FP-GEO-003/outside-footprint",
        `Planens ydervægge ligger delvist uden for det trusted footprint (${Math.round(
          (overlap / planArea) * 100,
        )}% inden for).`,
        [],
        "Flyt eller skalér planen, så den holder sig inden for byggefeltet.",
      ),
    ];
  }
  return [];
}

/** Axis-aligned outline of the plan's walls, transformed to EPSG:25832. */
function planFootprint25832(doc: FloorPlanDocument): GeoJsonPolygon25832 | null {
  const points = doc.levels.flatMap((l) =>
    l.walls.flatMap((w) => [w.centerline.start, w.centerline.end]),
  );
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const t = { origin25832: doc.transform.origin25832, rotationDeg: doc.transform.rotationDeg };
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ].map((c) => localToSite25832(c, t));

  return { type: "Polygon", coordinates: [corners], crs: "EPSG:25832" };
}

function finding(
  id: string,
  message: string,
  affectedElementIds: string[],
  nextAction: string,
): VerificationFinding {
  return {
    id,
    severity: "review_required",
    category: "site_compliance",
    message,
    affectedElementIds,
    source: "deterministic",
    nextAction,
  };
}
