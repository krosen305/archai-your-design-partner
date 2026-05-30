import { describe, expect, test } from "bun:test";
import { canonicalStringify, hashCanonical } from "./canonical-hash";

describe("canonicalStringify", () => {
  test("sorts object keys lexicographically", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("rounds numbers to 3 decimals", () => {
    expect(canonicalStringify({ x: 1.23456 })).toBe('{"x":1.235}');
  });

  test("normalizes -0 to 0", () => {
    expect(canonicalStringify({ x: -0 })).toBe('{"x":0}');
  });

  test("preserves array order", () => {
    expect(canonicalStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  test("recurses into nested structures", () => {
    expect(canonicalStringify({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
  });
});

describe("hashCanonical", () => {
  test("is invariant to key insertion order", async () => {
    const a = await hashCanonical({ x: 1, y: 2 });
    const b = await hashCanonical({ y: 2, x: 1 });
    expect(a).toBe(b);
  });

  test("differs when rounded content differs", async () => {
    const a = await hashCanonical({ x: 1.0 });
    const b = await hashCanonical({ x: 1.01 });
    expect(a).not.toBe(b);
  });

  test("is invariant to sub-millimeter noise", async () => {
    const a = await hashCanonical({ x: 1.0001 });
    const b = await hashCanonical({ x: 1.0002 });
    expect(a).toBe(b);
  });

  test("returns a 64-char hex SHA-256 string", async () => {
    const h = await hashCanonical({ x: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
