import { describe, expect, it } from "bun:test";
import { objectField, routeMatchesAddress } from "./cockpit-restore-utils";

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
  it("returns null for non-object", () => {
    expect(objectField("string", "key")).toBeNull();
  });

  it("returns null when field is not an object", () => {
    expect(objectField({ key: "value" }, "key")).toBeNull();
  });

  it("returns the object field when it is an object", () => {
    const inner = { x: 1 };
    expect(objectField({ key: inner }, "key")).toEqual(inner);
  });
});
