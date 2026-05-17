// Unit tests for analysis-orchestrator — cache-hit/miss, stale-bypass, fail-open.
//
// Isolation strategy:
//   mock.module() for modules without own test files: cache/client, analysis-tracing,
//   compliance-layer1, supabase/client.server. @/lib/env: validateEnv mocked as noop,
//   getEnv* delegated to real implementation.
//
//   All test inputs have adgangsadresseid + grundareal set (non-null) so the DAR
//   enrichment branch is never triggered — DAR has its own test file (dar.test.ts)
//   and cannot be mocked here without contaminating it.

import { mock, describe, it, expect, beforeEach } from "bun:test";
import type { ComplianceResult } from "./analysis-orchestrator";

// ---------------------------------------------------------------------------
// Controllable mock handles
// ---------------------------------------------------------------------------

const getCacheMock = mock(async (_addr: string) => null as ComplianceResult | null);
const setCacheMock = mock(async () => {});
const fetchBbrMock = mock(async (_input: any) => MOCK_BBR as any);
const fetchPlandataMock = mock(async () => MOCK_PLANDATA);
const fetchVurMock = mock(async () => null);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_BBR = {
  grundareal: 600,
  bebygget_areal: 140,
  fredet: false,
  mat_strandbeskyttelse: false,
  mat_fredskov: false,
  mat_klitfredning: false,
  alle_bbr_public_ids: [],
} as any;

const MOCK_PLANDATA = { lokalplaner: [], kommuneplanramme: null };

const FRESH_CACHE: ComplianceResult = {
  bbr: { ...MOCK_BBR, grundareal: 600 } as any,
  lokalplaner: [],
  kommuneplanramme: null,
  analysedAt: new Date().toISOString(),
  lokalplanExtract: null,
  naturbeskyttelse: null,
  dkjord: null,
  geusRisk: null,
  servitutter: null,
  terrain: null,
  naboer: null,
  fjernvarme: null,
  fbbData: null,
  vurderingData: null,
};

const STALE_CACHE_NULL_GRUNDAREAL: ComplianceResult = {
  ...FRESH_CACHE,
  bbr: { ...MOCK_BBR, grundareal: null } as any,
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

mock.module("@/lib/env", () => ({
  validateEnv: () => {},
  getEnvRequired: (_key: string) => "mock-env-value",
  getEnvOptional: (_key: string) => undefined,
}));

mock.module("@/integrations/cache/client", () => ({
  getCachedCompliance: getCacheMock,
  setCachedCompliance: setCacheMock,
  getCachedLokalplan: mock(async () => null),
  setCachedLokalplan: mock(async () => {}),
  getCachedServitut: mock(async () => null),
  setCachedServitut: mock(async () => {}),
}));

mock.module("@/lib/analysis-tracing", () => ({
  startAnalysisRun: mock(async () => ({ runId: "test-run", sessionId: null })),
  finishAnalysisRun: mock(async () => {}),
  traceStep: mock(async (_trace: any, _meta: any, fn: () => any, _opts?: any) => fn()),
  recordAnalysisEvent: mock(async () => {}),
}));

mock.module("@/lib/compliance-layer1", () => ({
  fetchBbrWithMat: fetchBbrMock,
  fetchPlandata: fetchPlandataMock,
  fetchVurViaEbr: fetchVurMock,
}));

// ---------------------------------------------------------------------------
// Import orchestrator after all mocks are registered
// ---------------------------------------------------------------------------

const { analyseAddress } = await import("./analysis-orchestrator");

// ---------------------------------------------------------------------------
// Shared input — DAR is NOT called when both adgangsadresseid AND grundareal
// are non-null. koordinater:null skips the layer4 IIFE. No live network access.
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  addressId: "addr-001",
  adgangsadresseid: "adr-001",
  ejerlavskode: null,
  matrikelnummer: null,
  koordinater: null,
  grundareal: 600,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyseAddress — cache-hit", () => {
  beforeEach(() => {
    getCacheMock.mockReset();
    setCacheMock.mockReset();
    fetchBbrMock.mockReset();
    fetchBbrMock.mockImplementation(async () => MOCK_BBR);
    fetchPlandataMock.mockReset();
    fetchPlandataMock.mockImplementation(async () => MOCK_PLANDATA);
  });

  it("returnerer cachet data uden at kalde fetchBbrWithMat", async () => {
    getCacheMock.mockImplementation(async () => FRESH_CACHE);

    const result = await analyseAddress(BASE_INPUT);

    expect(result.bbr?.grundareal).toBe(600);
    expect(fetchBbrMock).not.toHaveBeenCalled();
  });

  it("skriver ikke til cache ved hit", async () => {
    getCacheMock.mockImplementation(async () => FRESH_CACHE);

    await analyseAddress(BASE_INPUT);

    expect(setCacheMock).not.toHaveBeenCalled();
  });
});

describe("analyseAddress — cache-miss", () => {
  beforeEach(() => {
    getCacheMock.mockReset();
    getCacheMock.mockImplementation(async () => null);
    setCacheMock.mockReset();
    fetchBbrMock.mockReset();
    fetchBbrMock.mockImplementation(async () => MOCK_BBR);
    fetchPlandataMock.mockReset();
    fetchPlandataMock.mockImplementation(async () => MOCK_PLANDATA);
    fetchVurMock.mockReset();
    fetchVurMock.mockImplementation(async () => null);
  });

  it("kalder fetchBbrWithMat ved cache-miss", async () => {
    const result = await analyseAddress(BASE_INPUT);

    expect(fetchBbrMock).toHaveBeenCalledTimes(1);
    expect(result.bbr?.grundareal).toBe(600);
  });

  it("skriver til cache efter live-kald", async () => {
    await analyseAddress(BASE_INPUT);

    expect(setCacheMock).toHaveBeenCalledTimes(1);
  });

  it("returnerer resultat selv om EBR/VUR-kald fejler (vurderingData=null)", async () => {
    fetchVurMock.mockImplementation(async () => null);

    const result = await analyseAddress(BASE_INPUT);

    expect(result.bbr?.grundareal).toBe(600);
    expect(result.vurderingData).toBeNull();
  });
});

describe("analyseAddress — stale-cache bypass (grundareal)", () => {
  beforeEach(() => {
    getCacheMock.mockReset();
    setCacheMock.mockReset();
    fetchBbrMock.mockReset();
    fetchBbrMock.mockImplementation(async () => MOCK_BBR);
    fetchPlandataMock.mockReset();
    fetchPlandataMock.mockImplementation(async () => MOCK_PLANDATA);
    fetchVurMock.mockReset();
    fetchVurMock.mockImplementation(async () => null);
  });

  it("bypasser cache når bbr.grundareal er null og preFetchedGrundareal er tilgængeligt", async () => {
    getCacheMock.mockImplementation(async () => STALE_CACHE_NULL_GRUNDAREAL);
    // grundareal: 600 → preFetchedGrundareal=600 → canRecoverGrundareal=true → bypass
    const result = await analyseAddress({ ...BASE_INPUT, grundareal: 600 });

    expect(fetchBbrMock).toHaveBeenCalledTimes(1);
    expect(result.bbr?.grundareal).toBe(600);
  });
});

describe("analyseAddress — layer4 fail-open", () => {
  beforeEach(() => {
    getCacheMock.mockReset();
    getCacheMock.mockImplementation(async () => null);
    setCacheMock.mockReset();
    fetchBbrMock.mockReset();
    fetchBbrMock.mockImplementation(async () => MOCK_BBR);
    fetchPlandataMock.mockReset();
    fetchPlandataMock.mockImplementation(async () => MOCK_PLANDATA);
    fetchVurMock.mockReset();
    fetchVurMock.mockImplementation(async () => null);
  });

  it("returnerer bbr-data med koordinater=null (layer4 IIFE skippet — alle null)", async () => {
    const result = await analyseAddress({ ...BASE_INPUT, koordinater: null });

    expect(result.bbr?.grundareal).toBe(600);
    expect(result.naturbeskyttelse).toBeNull();
    expect(result.dkjord).toBeNull();
    expect(result.geusRisk).toBeNull();
    expect(result.naboer).toBeNull();
    expect(result.fjernvarme).toBeNull();
  });

  it("smider ikke selv om cache-skrivning fejler", async () => {
    setCacheMock.mockImplementation(async () => {
      throw new Error("Supabase connection refused");
    });

    await expect(analyseAddress(BASE_INPUT)).resolves.toMatchObject({
      bbr: expect.objectContaining({ grundareal: 600 }),
    });
  });
});
