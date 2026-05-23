import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { decodeWithSchema, objectField, routeMatchesAddress } from "./cockpit-restore-utils";

describe("routeMatchesAddress", () => {
  it("returns false when address is null", () => {
    expect(routeMatchesAddress(null, "addr-1")).toBe(false);
  });

  it("returns true when adresseid matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "addr-1")).toBe(
      true,
    );
  });

  it("returns true when adgangsadresseid matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "adg-1")).toBe(
      true,
    );
  });

  it("returns false when neither matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "other")).toBe(
      false,
    );
  });
});

describe("objectField", () => {
  const schema = z.object({ x: z.number() });

  it("returns null for non-object", () => {
    expect(objectField("string", "key", schema)).toBeNull();
  });

  it("returns null when field is not an object", () => {
    expect(objectField({ key: "value" }, "key", schema)).toBeNull();
  });

  it("returns the object field when it matches the schema", () => {
    const inner = { x: 1 };
    expect(objectField({ key: inner }, "key", schema)).toEqual(inner);
  });

  it("returns null when the object field does not match the schema", () => {
    expect(objectField({ key: { x: "1" } }, "key", schema)).toBeNull();
  });
});

describe("decodeWithSchema", () => {
  it("returns null when the value does not match the schema", () => {
    expect(decodeWithSchema({ x: "1" }, z.object({ x: z.number() }))).toBeNull();
  });
});
