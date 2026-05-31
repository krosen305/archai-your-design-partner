import { describe, expect, test } from "bun:test";
import type { LocalToSiteTransform, Point2D } from "./geometry-2d.types";
import { localToSite25832, site25832ToLocal } from "./local-transform";

const transform: LocalToSiteTransform = {
  origin25832: [720000, 6175000],
  rotationDeg: 30,
};

describe("localToSite25832", () => {
  test("origin maps to origin25832", () => {
    const [e, n] = localToSite25832({ x: 0, y: 0 }, transform);
    expect(e).toBeCloseTo(720000, 6);
    expect(n).toBeCloseTo(6175000, 6);
  });

  test("zero rotation translates only", () => {
    const t: LocalToSiteTransform = { origin25832: [100, 200], rotationDeg: 0 };
    const [e, n] = localToSite25832({ x: 5, y: 3 }, t);
    expect(e).toBeCloseTo(105, 6);
    expect(n).toBeCloseTo(203, 6);
  });
});

describe("round-trip", () => {
  test("site -> local -> site is identity", () => {
    const local: Point2D = { x: 12.5, y: -4.25 };
    const site = localToSite25832(local, transform);
    const back = site25832ToLocal(site, transform);
    expect(back.x).toBeCloseTo(local.x, 6);
    expect(back.y).toBeCloseTo(local.y, 6);
  });
});
