import { describe, it, expect } from "bun:test";
import { classifyTerrain, classifyGroundwater, isNearNeighbor } from "./site-risk-classifier";

describe("classifyTerrain", () => {
  it("returns flat when slope < 5%", () => {
    expect(classifyTerrain(0)).toBe("flat");
    expect(classifyTerrain(4.9)).toBe("flat");
  });

  it("returns sloping when slope is 5–14.9%", () => {
    expect(classifyTerrain(5)).toBe("sloping");
    expect(classifyTerrain(10)).toBe("sloping");
    expect(classifyTerrain(14.9)).toBe("sloping");
  });

  it("returns steep when slope >= 15%", () => {
    expect(classifyTerrain(15)).toBe("steep");
    expect(classifyTerrain(30)).toBe("steep");
  });
});

describe("classifyGroundwater", () => {
  it("returns null when depth is null", () => {
    expect(classifyGroundwater(null)).toBeNull();
  });

  it("returns high when depth < 1.0 m", () => {
    expect(classifyGroundwater(0)).toBe("high");
    expect(classifyGroundwater(0.9)).toBe("high");
  });

  it("returns medium when depth is 1.0–1.99 m", () => {
    expect(classifyGroundwater(1.0)).toBe("medium");
    expect(classifyGroundwater(1.5)).toBe("medium");
    expect(classifyGroundwater(1.99)).toBe("medium");
  });

  it("returns low when depth >= 2.0 m", () => {
    expect(classifyGroundwater(2.0)).toBe("low");
    expect(classifyGroundwater(5.0)).toBe("low");
  });
});

describe("isNearNeighbor", () => {
  it("returns null when distance is null", () => {
    expect(isNearNeighbor(null)).toBeNull();
  });

  it("returns true when distance < 2.5 m", () => {
    expect(isNearNeighbor(0)).toBe(true);
    expect(isNearNeighbor(2.4)).toBe(true);
  });

  it("returns false when distance >= 2.5 m", () => {
    expect(isNearNeighbor(2.5)).toBe(false);
    expect(isNearNeighbor(10)).toBe(false);
  });
});
