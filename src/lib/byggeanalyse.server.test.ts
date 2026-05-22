import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";

afterAll(() => {
  mock.restore();
});

// Mocks must be declared before the tested module is imported
const mockLoadProject = mock(async () => null as unknown);
const mockGetSiteConstraints = mock(async () => null as unknown);
const mockAnalyse = mock(async () => ({
  tilladt: [],
  kraever_dispensation: [],
  konflikt: [],
  mangler_data: [],
  stilOpsummering: null,
  kilde: "mock" as const,
}));

mock.module("@/integrations/supabase/repositories/projects.repository", () => ({
  loadProject: mockLoadProject,
}));

mock.module("@/integrations/supabase/repositories/site-constraints.repository", () => ({
  getSiteConstraints: mockGetSiteConstraints,
}));

mock.module("@/integrations/ai/byggeanalyse", () => ({
  ByggeanalyseService: { analyse: mockAnalyse },
}));

import { runByggeanalyseGated } from "./byggeanalyse.server";

const BASE_PROJECT = {
  id: "proj-1",
  user_id: "user-1",
  hard_stop: false,
  hard_stop_reason: null,
  heritage_save_value: null,
  is_fredet: null,
  grundareal_m2: 500,
  bebygget_areal_m2: 100,
  address_adresseid: "addr-1",
  compliance_data: {
    bbrData: { grundareal: 500, bebygget_areal: 100, antal_etager: 1 },
  },
};

const BASE_CONSTRAINTS = {
  save_value: null,
  is_fredet: null,
  strandbeskyttelse: false,
  fredskov: false,
  klitfredning: false,
};

const BYGGEOENSKE = { byggetype: "Enfamiliehus", oensketAreal: "150" };

beforeEach(() => {
  mockLoadProject.mockReset();
  mockGetSiteConstraints.mockReset();
  mockAnalyse.mockReset();
  mockAnalyse.mockImplementation(async () => ({
    tilladt: [],
    kraever_dispensation: [],
    konflikt: [],
    mangler_data: [],
    stilOpsummering: null,
    kilde: "mock" as const,
  }));
});

describe("runByggeanalyseGated — missing project", () => {
  it("returns missing_data when project not found", async () => {
    mockLoadProject.mockImplementation(async () => null);
    mockGetSiteConstraints.mockImplementation(async () => null);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("missing_data");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe("runByggeanalyseGated — hard stop from typed column", () => {
  it("blocks AI when projects.hard_stop === true", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: true,
      hard_stop_reason: "SAVE 2 — kræver dispensation",
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("blocked");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe("runByggeanalyseGated — hard stop from heritage_save_value", () => {
  it("blocks AI when SAVE value is 2", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: false,
      heritage_save_value: 2,
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("blocked");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("blocks AI when SAVE value is 3", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: false,
      heritage_save_value: 3,
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("blocked");
  });

  it("does NOT block when SAVE value is 4 (warning only)", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: false,
      heritage_save_value: 4,
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("ok");
  });
});

describe("runByggeanalyseGated — hard stop from is_fredet", () => {
  it("blocks AI when is_fredet === true", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: false,
      is_fredet: true,
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("blocked");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe("runByggeanalyseGated — hard stop from site_constraints (MAT)", () => {
  it("blocks AI when strandbeskyttelse is true", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      hard_stop: false,
      heritage_save_value: null,
    }));
    mockGetSiteConstraints.mockImplementation(async () => ({
      ...BASE_CONSTRAINTS,
      strandbeskyttelse: true,
    }));

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("blocked");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe("runByggeanalyseGated — missing compliance data", () => {
  it("returns missing_data when bbrData absent", async () => {
    mockLoadProject.mockImplementation(async () => ({
      ...BASE_PROJECT,
      compliance_data: {},
    }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("missing_data");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe("runByggeanalyseGated — successful analysis", () => {
  it("returns ok when no hard stop and bbrData present", async () => {
    mockLoadProject.mockImplementation(async () => ({ ...BASE_PROJECT }));
    mockGetSiteConstraints.mockImplementation(async () => BASE_CONSTRAINTS);

    const result = await runByggeanalyseGated({
      projectId: "proj-1",
      userId: "user-1",
      byggeoenske: BYGGEOENSKE,
    });

    expect(result.status).toBe("ok");
    expect(mockAnalyse).toHaveBeenCalledTimes(1);
  });
});
