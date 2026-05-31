import { describe, expect, test } from "bun:test";
import { assertCanEdit, assertCanVerify, buildOwnerPrincipal } from "./principal";

describe("buildOwnerPrincipal", () => {
  test("returns an owner principal when the user owns the project", () => {
    const p = buildOwnerPrincipal("user_1", true);
    expect(p).toEqual({ subjectId: "user_1", subjectKind: "user", projectRole: "owner" });
  });

  test("throws when the user does not own the project", () => {
    expect(() => buildOwnerPrincipal("user_1", false)).toThrow();
  });
});

describe("role guards", () => {
  test("owner may edit and verify", () => {
    const owner = buildOwnerPrincipal("u", true);
    expect(() => assertCanEdit(owner)).not.toThrow();
    expect(() => assertCanVerify(owner)).not.toThrow();
  });

  test("viewer may neither edit nor verify", () => {
    const viewer = { subjectId: "u", subjectKind: "user", projectRole: "viewer" } as const;
    expect(() => assertCanEdit(viewer)).toThrow();
    expect(() => assertCanVerify(viewer)).toThrow();
  });
});
