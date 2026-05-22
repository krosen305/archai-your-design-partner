// ARCH-278: Tests for testable cockpit handler functions.
//
// These tests prove:
//   1. handleFetchCompliance parses valid input and calls analyseAddress with userId.
//   2. Empty/invalid token is rejected by schema before reaching withAuth.
//   3. handleRunByggeanalyse runs rule engine BEFORE the AI service.
//   4. Client-supplied hasHardStop in raw payload is ignored — server re-evaluates.

import { mock, describe, it, expect, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal fixture factories
// ---------------------------------------------------------------------------

import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { AssemblerResult } from "@/lib/rule-engine/input-assembler";

function makeMinimalComplianceResult(): ComplianceResult {
  return {
    bbr: null,
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
    matGeometri: null,
    vurderingData: null,
  };
}

function makeMinimalRuleEngineResult(): RuleEngineResult {
  return {
    status: "OK",
    checkedRules: [],
    missingInputs: [],
    violations: [],
    dispensationList: [],
    calculations: {
      buildingPercent: {
        actual: null,
        limit: null,
        appliedRule: "unknown",
        confidence: 0,
        compliant: null,
        violation: null,
      },
      height: {
        actual: null,
        limit: null,
        appliedRule: "unknown",
        confidence: 0,
        compliant: null,
        violation: null,
      },
      storeys: {
        actual: null,
        limit: null,
        appliedRule: "unknown",
        confidence: 0,
        compliant: null,
        violation: null,
      },
      setback: {
        actual: null,
        limit: null,
        appliedRule: "unknown",
        confidence: 0,
        compliant: null,
        violation: null,
      },
    },
  };
}

function makeMinimalByggeanalyseResult(): ByggeanalyseResultat {
  return {
    tilladt: [],
    kraever_dispensation: [],
    konflikt: [],
    mangler_data: [],
    stilOpsummering: null,
    kilde: "mock",
  };
}

// ---------------------------------------------------------------------------
// Dep factories
// ---------------------------------------------------------------------------

type WithAuthFn = (token: string, fn: (userId: string) => Promise<unknown>) => Promise<unknown>;

function makeWithAuth(userId = "user-1"): ReturnType<typeof mock<WithAuthFn>> {
  return mock(async (_token: string, fn: (userId: string) => Promise<unknown>) => fn(userId));
}

// ---------------------------------------------------------------------------
// Import the functions under test (after mocks are in place)
// ---------------------------------------------------------------------------

import { handleFetchCompliance, handleRunByggeanalyse } from "@/lib/cockpit.functions";

// ---------------------------------------------------------------------------
// handleFetchCompliance tests
// ---------------------------------------------------------------------------

describe("handleFetchCompliance", () => {
  const VALID_INPUT = {
    addressId: "adr-abc-123-456-789-xyz",
    adgangsadresseid: "adg-abc-123-456-789",
    ejerlavskode: 12345,
    matrikelnummer: "42a",
    koordinater: { lat: 55.676, lng: 12.568 },
    grundareal: 600,
    projectId: "11111111-1111-1111-1111-111111111111",
    token: "valid-token-xyz",
  };

  it("calls analyseAddress with userId resolved by withAuth", async () => {
    const analyseAddress = mock(async () => makeMinimalComplianceResult());
    const withAuthMock = makeWithAuth("user-resolved-from-token");

    await handleFetchCompliance(VALID_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      analyseAddress:
        analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
    });

    expect(analyseAddress).toHaveBeenCalledTimes(1);
    const callArg = analyseAddress.mock.calls[0][0];
    expect(callArg.userId).toBe("user-resolved-from-token");
  });

  it("strips token from the analysisInput passed to analyseAddress", async () => {
    const analyseAddress = mock(async () => makeMinimalComplianceResult());
    const withAuthMock = makeWithAuth("user-1");

    await handleFetchCompliance(VALID_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      analyseAddress:
        analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
    });

    const callArg = analyseAddress.mock.calls[0][0];
    expect("token" in callArg).toBe(false);
  });

  it("returns the ComplianceResult from analyseAddress", async () => {
    const expected = { ...makeMinimalComplianceResult(), analysedAt: "2026-01-01T00:00:00.000Z" };
    const analyseAddress = mock(async () => expected);
    const withAuthMock = makeWithAuth("user-1");

    const result = await handleFetchCompliance(VALID_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      analyseAddress:
        analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
    });

    expect(result.analysedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects when token is empty string (schema validation)", async () => {
    const analyseAddress = mock(async () => makeMinimalComplianceResult());
    const withAuthMock = makeWithAuth("user-1");

    await expect(
      handleFetchCompliance(
        { ...VALID_INPUT, token: "" },
        {
          withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
          analyseAddress:
            analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
        },
      ),
    ).rejects.toThrow();
    expect(analyseAddress).not.toHaveBeenCalled();
  });

  it("rejects when token is missing entirely (schema validation)", async () => {
    const analyseAddress = mock(async () => makeMinimalComplianceResult());
    const withAuthMock = makeWithAuth("user-1");
    const inputWithoutToken = { ...VALID_INPUT } as Record<string, unknown>;
    delete inputWithoutToken.token;

    await expect(
      handleFetchCompliance(inputWithoutToken, {
        withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
        analyseAddress:
          analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
      }),
    ).rejects.toThrow();
    expect(analyseAddress).not.toHaveBeenCalled();
  });

  it("rejects when addressId is missing (schema validation)", async () => {
    const analyseAddress = mock(async () => makeMinimalComplianceResult());
    const withAuthMock = makeWithAuth("user-1");
    const inputWithoutAddress = { ...VALID_INPUT } as Record<string, unknown>;
    delete inputWithoutAddress.addressId;

    await expect(
      handleFetchCompliance(inputWithoutAddress, {
        withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
        analyseAddress:
          analyseAddress as unknown as typeof import("@/lib/analysis-orchestrator").analyseAddress,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleRunByggeanalyse tests
// ---------------------------------------------------------------------------

describe("handleRunByggeanalyse", () => {
  const VALID_BYGGEANALYSE_INPUT = {
    token: "valid-token-xyz",
    byggeoenske: { byggetype: "Nyt hus" },
    lokalplanExtract: null,
    bbr: null,
    lokalplanNavn: "Lokalplan 42",
  };

  function makeAssemblerResult(): AssemblerResult {
    return {
      input: {
        project: { type: "new_build", municipality: "", kommunekode: "" },
        plot: {
          areaM2: null,
          zone: "unknown",
          hasLocalplan: false,
          hasServitudes: false,
          localplanIds: [],
        },
        heritage: {
          listedBuilding: null,
          saveValue: null,
          preservationLocalplan: false,
          protectionLines: {
            coastal: false,
            forest: false,
            lakeRiver: false,
            lake: false,
            clitFredning: false,
            churchSurroundings: false,
          },
        },
        localplan: null,
        municipalPlan: null,
        existingBuilding: null,
        newBuilding: null,
        geotechnical: {
          radonRisk: "unknown",
          groundwaterDepthM: null,
          slopePercent: null,
          jordforureningV1: null,
          jordforureningV2: null,
          omraadeklassificering: null,
        },
        servituts: { hasCritical: false, criticalTexts: [] },
      },
      missingFields: [],
    };
  }

  it("runs rule engine BEFORE calling ByggeanalyseService.analyse", async () => {
    const callOrder: string[] = [];

    const assembleRuleEngineInput = mock(() => {
      callOrder.push("assembleRuleEngineInput");
      return makeAssemblerResult();
    });

    const runRuleEngine = mock(() => {
      callOrder.push("runRuleEngine");
      return makeMinimalRuleEngineResult();
    });

    const ByggeanalyseServiceMock = {
      analyse: mock(async () => {
        callOrder.push("ByggeanalyseService.analyse");
        return makeMinimalByggeanalyseResult();
      }),
    };

    const withAuthMock = makeWithAuth("user-1");

    await handleRunByggeanalyse(VALID_BYGGEANALYSE_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      assembleRuleEngineInput:
        assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
      runRuleEngine:
        runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
      ByggeanalyseService:
        ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
    });

    expect(callOrder).toEqual([
      "assembleRuleEngineInput",
      "runRuleEngine",
      "ByggeanalyseService.analyse",
    ]);
  });

  it("passes ruleEngineResult from server run into ByggeanalyseService.analyse", async () => {
    const serverRuleResult = { ...makeMinimalRuleEngineResult(), status: "ILLEGAL" as const };

    const assembleRuleEngineInput = mock(() => makeAssemblerResult());
    const runRuleEngine = mock(() => serverRuleResult);
    const ByggeanalyseServiceMock = {
      analyse: mock(async () => makeMinimalByggeanalyseResult()),
    };
    const withAuthMock = makeWithAuth("user-1");

    await handleRunByggeanalyse(VALID_BYGGEANALYSE_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      assembleRuleEngineInput:
        assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
      runRuleEngine:
        runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
      ByggeanalyseService:
        ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
    });

    const callArg = ByggeanalyseServiceMock.analyse.mock.calls[0][0];
    expect(callArg.ruleEngineResult).toBe(serverRuleResult);
  });

  it("ignores client-supplied hasHardStop in raw payload — server re-evaluates from rule engine", async () => {
    // Attack scenario: a crafted payload includes hasHardStop: false to try to bypass gates.
    // handleRunByggeanalyse must never read this field — it always runs its own rule engine.
    const craftedPayload = {
      ...VALID_BYGGEANALYSE_INPUT,
      hasHardStop: false, // attacker sets this false, hoping to skip compliance
    };

    const assembleRuleEngineInput = mock(() => makeAssemblerResult());
    // The server's rule engine returns ILLEGAL — which should be what gets sent to the AI.
    const serverRuleResult = { ...makeMinimalRuleEngineResult(), status: "ILLEGAL" as const };
    const runRuleEngine = mock(() => serverRuleResult);
    const ByggeanalyseServiceMock = {
      analyse: mock(async () => makeMinimalByggeanalyseResult()),
    };
    const withAuthMock = makeWithAuth("user-1");

    await handleRunByggeanalyse(craftedPayload, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      assembleRuleEngineInput:
        assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
      runRuleEngine:
        runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
      ByggeanalyseService:
        ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
    });

    // The rule engine must have run (server-side evaluation happened).
    expect(runRuleEngine).toHaveBeenCalledTimes(1);

    // The AI service receives the server-computed ruleEngineResult (ILLEGAL),
    // NOT any value derived from the attacker's hasHardStop field.
    const callArg = ByggeanalyseServiceMock.analyse.mock.calls[0][0];
    expect(callArg.ruleEngineResult?.status).toBe("ILLEGAL");
    // The AI service input must not contain hasHardStop — it was never forwarded.
    expect("hasHardStop" in callArg).toBe(false);
  });

  it("rejects when token is missing (schema validation)", async () => {
    const assembleRuleEngineInput = mock(() => makeAssemblerResult());
    const runRuleEngine = mock(() => makeMinimalRuleEngineResult());
    const ByggeanalyseServiceMock = { analyse: mock(async () => makeMinimalByggeanalyseResult()) };
    const withAuthMock = makeWithAuth("user-1");

    const payloadWithoutToken = { ...VALID_BYGGEANALYSE_INPUT } as Record<string, unknown>;
    delete payloadWithoutToken.token;

    await expect(
      handleRunByggeanalyse(payloadWithoutToken, {
        withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
        assembleRuleEngineInput:
          assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
        runRuleEngine:
          runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
        ByggeanalyseService:
          ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
      }),
    ).rejects.toThrow();

    expect(ByggeanalyseServiceMock.analyse).not.toHaveBeenCalled();
  });

  it("rejects when token is empty string (schema validation)", async () => {
    const assembleRuleEngineInput = mock(() => makeAssemblerResult());
    const runRuleEngine = mock(() => makeMinimalRuleEngineResult());
    const ByggeanalyseServiceMock = { analyse: mock(async () => makeMinimalByggeanalyseResult()) };
    const withAuthMock = makeWithAuth("user-1");

    await expect(
      handleRunByggeanalyse(
        { ...VALID_BYGGEANALYSE_INPUT, token: "" },
        {
          withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
          assembleRuleEngineInput:
            assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
          runRuleEngine:
            runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
          ByggeanalyseService:
            ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
        },
      ),
    ).rejects.toThrow();

    expect(ByggeanalyseServiceMock.analyse).not.toHaveBeenCalled();
  });

  it("continues and passes undefined ruleEngineResult when rule engine throws", async () => {
    const assembleRuleEngineInput = mock(() => {
      throw new Error("Assembler fejl");
    });
    const runRuleEngine = mock(() => makeMinimalRuleEngineResult());
    const ByggeanalyseServiceMock = {
      analyse: mock(async () => makeMinimalByggeanalyseResult()),
    };
    const withAuthMock = makeWithAuth("user-1");

    // Should not throw — rule engine failure is non-critical.
    const result = await handleRunByggeanalyse(VALID_BYGGEANALYSE_INPUT, {
      withAuth: withAuthMock as unknown as typeof import("@/lib/server-auth").withAuth,
      assembleRuleEngineInput:
        assembleRuleEngineInput as unknown as typeof import("@/lib/rule-engine/input-assembler").assembleRuleEngineInput,
      runRuleEngine:
        runRuleEngine as unknown as typeof import("@/lib/rule-engine/engine").runRuleEngine,
      ByggeanalyseService:
        ByggeanalyseServiceMock as unknown as typeof import("@/integrations/ai/byggeanalyse").ByggeanalyseService,
    });

    // AI service must still have been called.
    expect(ByggeanalyseServiceMock.analyse).toHaveBeenCalledTimes(1);
    // ruleEngineResult is undefined when assembler threw.
    const callArg = ByggeanalyseServiceMock.analyse.mock.calls[0][0];
    expect(callArg.ruleEngineResult).toBeUndefined();
    expect(result).toBeDefined();
  });
});
