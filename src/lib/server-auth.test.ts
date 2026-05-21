// ARCH-272: Tests for shared server-side auth helper.
// Covers missing token, invalid token, and valid token scenarios.

import { mock, describe, it, expect, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock supabaseAdmin before importing the module under test
// ---------------------------------------------------------------------------

const mockGetUser = mock(async (_token: string) => ({
  data: { user: null },
  error: null,
}));

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
  },
}));

import { withAuth } from "@/lib/server-auth";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withAuth", () => {
  beforeEach(() => {
    mockGetUser.mockClear();
  });

  it("throws 401 Response when token is undefined", async () => {
    let thrown: unknown;
    try {
      await withAuth(undefined, async () => "should not reach");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("throws 401 Response when token is null", async () => {
    let thrown: unknown;
    try {
      await withAuth(null, async () => "should not reach");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("throws 401 Response when token is empty string", async () => {
    let thrown: unknown;
    try {
      await withAuth("", async () => "should not reach");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("throws 401 Response when supabase returns auth error", async () => {
    mockGetUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: { message: "invalid token" },
    }));

    let thrown: unknown;
    try {
      await withAuth("bad-token", async () => "should not reach");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("throws 401 Response when supabase returns null user without error", async () => {
    mockGetUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: null,
    }));

    let thrown: unknown;
    try {
      await withAuth("expired-token", async () => "should not reach");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it("calls fn with userId when token is valid", async () => {
    mockGetUser.mockImplementationOnce(async () => ({
      data: { user: { id: "user-123" } },
      error: null,
    }));

    const result = await withAuth("valid-token", async (userId) => `hello-${userId}`);
    expect(result).toBe("hello-user-123");
  });

  it("returns fn result when token is valid", async () => {
    mockGetUser.mockImplementationOnce(async () => ({
      data: { user: { id: "user-abc" } },
      error: null,
    }));

    const result = await withAuth("valid-token", async () => ({ data: 42 }));
    expect(result).toEqual({ data: 42 });
  });

  it("does not call fn when token is invalid", async () => {
    mockGetUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: { message: "invalid" },
    }));

    const fn = mock(async () => "called");
    try {
      await withAuth("bad-token", fn);
    } catch {
      // expected
    }
    expect(fn).not.toHaveBeenCalled();
  });
});
