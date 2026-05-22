// ARCH-267: Server-side hard-stop gate tests.
//
// These tests prove that a direct API call with a crafted payload cannot
// generate designs for a project/address that has active hard stops.
// The old client-supplied `hasHardStop` field has been removed — the gate
// now runs server-side by loading compliance data from Supabase.

import { mock, describe, it, expect, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock supabaseAdmin before importing the module under test
// ---------------------------------------------------------------------------

const mockSelectSingle = mock(async () => ({ data: null, error: null }));
const mockSelectChain = {
  select: mock(() => mockSelectChain),
  eq: mock(() => mockSelectChain),
  single: mockSelectSingle,
};
const mockFrom = mock(() => mockSelectChain);

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mockFrom },
}));

// Must import AFTER mocking the module
import { resolveHardStop } from "@/lib/ai-design.functions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWNER_ID = "user-abc";
const OTHER_ID = "user-xyz";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const ADDRESS_ID = "addr-001";

type ProjectRow = {
  user_id: string;
  hard_stop: boolean | null;
  hard_stop_reason: string | null;
  address_adresseid: string | null;
};

type SiteConstraintsRow = {
  save_value: number | null;
  is_fredet: boolean | null;
  strandbeskyttelse: boolean;
  fredskov: boolean;
  klitfredning: boolean;
};

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    user_id: OWNER_ID,
    hard_stop: false,
    hard_stop_reason: null,
    address_adresseid: ADDRESS_ID,
    ...overrides,
  };
}

function makeConstraints(overrides: Partial<SiteConstraintsRow> = {}): SiteConstraintsRow {
  return {
    save_value: null,
    is_fredet: null,
    strandbeskyttelse: false,
    fredskov: false,
    klitfredning: false,
    ...overrides,
  };
}

function setProjectResult(project: ProjectRow | null, error?: object | null) {
  mockSelectSingle.mockImplementationOnce(async () => ({
    data: project,
    error: error ?? null,
  }));
}

function setSiteConstraintsResult(sc: SiteConstraintsRow | null) {
  mockSelectSingle.mockImplementationOnce(async () => ({ data: sc, error: null }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveHardStop — projectId path", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelectChain.select.mockClear();
    mockSelectChain.eq.mockClear();
    mockSelectSingle.mockClear();
  });

  it("allows generation when project.hard_stop is false and site_constraints is clean", async () => {
    setProjectResult(makeProject({ hard_stop: false }));
    setSiteConstraintsResult(makeConstraints());

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("blocks generation when project.hard_stop is false but site_constraints has a blocker", async () => {
    setProjectResult(makeProject({ hard_stop: false, address_adresseid: ADDRESS_ID }));
    setSiteConstraintsResult(makeConstraints({ save_value: 1 }));

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("blocks generation when project.hard_stop is true", async () => {
    setProjectResult(makeProject({ hard_stop: true, hard_stop_reason: "Strandbeskyttelseslinje" }));

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Strandbeskyttelseslinje");
  });

  it("blocks generation when hard_stop is null but site_constraints has strandbeskyttelse", async () => {
    setProjectResult(makeProject({ hard_stop: null, address_adresseid: ADDRESS_ID }));
    setSiteConstraintsResult(makeConstraints({ strandbeskyttelse: true }));

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("blocks generation when hard_stop is null and site_constraints has SAVE 1", async () => {
    setProjectResult(makeProject({ hard_stop: null, address_adresseid: ADDRESS_ID }));
    setSiteConstraintsResult(makeConstraints({ save_value: 1 }));

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("allows generation when hard_stop is null and site_constraints is clean", async () => {
    setProjectResult(makeProject({ hard_stop: null, address_adresseid: ADDRESS_ID }));
    setSiteConstraintsResult(makeConstraints());

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(false);
  });

  it("allows generation when hard_stop is null and no site_constraints found (fail-open)", async () => {
    setProjectResult(makeProject({ hard_stop: null, address_adresseid: ADDRESS_ID }));
    setSiteConstraintsResult(null); // no constraints row

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(false);
  });

  it("throws when project is not found", async () => {
    setProjectResult(null, { code: "PGRST116" });

    await expect(
      resolveHardStop({ projectId: PROJECT_ID, addressId: undefined, userId: OWNER_ID }),
    ).rejects.toThrow();
  });

  it("throws when userId does not match project owner (prevents cross-user bypass)", async () => {
    setProjectResult(makeProject({ user_id: OTHER_ID }));

    await expect(
      resolveHardStop({ projectId: PROJECT_ID, addressId: undefined, userId: OWNER_ID }),
    ).rejects.toThrow(/adgang/i);
  });
});

describe("resolveHardStop — addressId fallback path", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelectSingle.mockClear();
  });

  it("blocks generation when site_constraints has fredskov", async () => {
    setSiteConstraintsResult(makeConstraints({ fredskov: true }));

    const result = await resolveHardStop({
      projectId: undefined,
      addressId: ADDRESS_ID,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("blocks generation when site_constraints has klitfredning", async () => {
    setSiteConstraintsResult(makeConstraints({ klitfredning: true }));

    const result = await resolveHardStop({
      projectId: undefined,
      addressId: ADDRESS_ID,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("blocks generation when site_constraints has is_fredet=true", async () => {
    setSiteConstraintsResult(makeConstraints({ is_fredet: true }));

    const result = await resolveHardStop({
      projectId: undefined,
      addressId: ADDRESS_ID,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(true);
  });

  it("allows generation for a clean address", async () => {
    setSiteConstraintsResult(makeConstraints());

    const result = await resolveHardStop({
      projectId: undefined,
      addressId: ADDRESS_ID,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(false);
  });

  it("fails open when no site_constraints row exists", async () => {
    setSiteConstraintsResult(null);

    const result = await resolveHardStop({
      projectId: undefined,
      addressId: ADDRESS_ID,
      userId: OWNER_ID,
    });

    expect(result.blocked).toBe(false);
  });
});

describe("resolveHardStop — proof: old hasHardStop bypass is closed", () => {
  it("client sending projectId of a hard-stop project cannot bypass gate regardless of any other payload", async () => {
    // This is the ARCH-267 attack vector: attacker previously sent hasHardStop: false.
    // Now the gate checks the database — no client value can override it.
    setProjectResult(makeProject({ hard_stop: true, hard_stop_reason: "Fredning" }));

    const result = await resolveHardStop({
      projectId: PROJECT_ID,
      addressId: undefined,
      userId: OWNER_ID,
      // No hasHardStop field — it no longer exists on this function
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Fredning");
  });
});
