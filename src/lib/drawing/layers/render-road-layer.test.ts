import { describe, it, expect } from "bun:test";
import { buildRoadFeatures } from "./render-road-layer";
import { createProjector } from "../projector";
import type { VejLayer } from "@/domain/drawing/beliggenhedsplan.types";

const project = createProjector({ pivot: [0, 0], rotationDeg: 0, minX: 50, maxY: 200, scale: 2 });

const vejMedCenterline: VejLayer = {
  vejnavn: "Testvej",
  centerline25832: {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [100, 100],
      [200, 100],
    ],
  },
  vejkant25832: [], // empty array (not null)
  vejbreddeM: null,
  source: {
    source: "registry",
    confidence: "medium",
    fetchedAt: "2026-06-06",
    requiresReview: false,
  },
};

describe("buildRoadFeatures", () => {
  it("null vej → empty array", () => {
    expect(buildRoadFeatures(null, project, 1)).toHaveLength(0);
  });

  it("vej med centerline → road_centerline feature", () => {
    const features = buildRoadFeatures(vejMedCenterline, project, 2);
    expect(features.some((f) => f.kind === "road_centerline")).toBe(true);
  });

  it("alle features har lavt zIndex (bag parcel)", () => {
    const features = buildRoadFeatures(vejMedCenterline, project, 2);
    expect(features.every((f) => f.zIndex < 50)).toBe(true);
  });
});
