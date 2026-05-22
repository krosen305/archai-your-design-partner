import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import type { ComplianceResult, analyseAddress } from "@/lib/analysis-orchestrator";
import type {
  ByggeanalyseInput,
  ByggeanalyseResultat,
  ByggeanalyseService,
} from "@/integrations/ai/byggeanalyse";
import type { assembleRuleEngineInput } from "@/lib/rule-engine/input-assembler";
import type { runRuleEngine } from "@/lib/rule-engine/engine";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const analysisInputSchema = z.object({
  addressId: z.string().min(1).max(64),
  adgangsadresseid: z.string().min(1).max(64),
  ejerlavskode: z.number().int().nullable(),
  matrikelnummer: z.string().max(32).nullable(),
  koordinater: z
    .object({
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
    })
    .nullable(),
  grundareal: z.number().positive().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  token: z.string().min(1),
});

const byggeanalyseTokenSchema = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Dependency injection types
// ---------------------------------------------------------------------------

export type CockpitServerDeps = {
  withAuth: typeof withAuth;
  analyseAddress: typeof analyseAddress;
  assembleRuleEngineInput: typeof assembleRuleEngineInput;
  runRuleEngine: typeof runRuleEngine;
  ByggeanalyseService: typeof ByggeanalyseService;
};

// ---------------------------------------------------------------------------
// Testable handler functions
// ---------------------------------------------------------------------------

/**
 * Validates, authenticates, and delegates to `analyseAddress`.
 * Exported for unit testing — do not call from client code.
 */
export async function handleFetchCompliance(
  rawData: unknown,
  deps: Pick<CockpitServerDeps, "withAuth" | "analyseAddress">,
): Promise<ComplianceResult> {
  const data = analysisInputSchema.parse(rawData);
  return deps.withAuth(data.token, async (userId) => {
    const { token: _token, ...analysisInput } = data;
    return deps.analyseAddress({ ...analysisInput, userId });
  });
}

/**
 * Validates, authenticates, runs the rule engine server-side, then calls AI service.
 * Client-supplied compliance signals (e.g. `hasHardStop`) in the raw payload are
 * never read — the server re-evaluates compliance from its own rule engine run.
 * Exported for unit testing — do not call from client code.
 */
export async function handleRunByggeanalyse(
  rawData: unknown,
  deps: Pick<
    CockpitServerDeps,
    "withAuth" | "assembleRuleEngineInput" | "runRuleEngine" | "ByggeanalyseService"
  >,
): Promise<ByggeanalyseResultat> {
  // Validate that a token is present (full ByggeanalyseInput shape is not schema-validated
  // here because it is a large union of optional fields; the AI service validates its own input).
  const { token } = byggeanalyseTokenSchema.parse(rawData);
  const analysisInput = rawData as ByggeanalyseInput;

  return deps.withAuth(token, async () => {
    let ruleEngineResult: import("@/lib/rule-engine/types").RuleEngineResult | undefined;
    try {
      const { input: ruleInput, missingFields } = deps.assembleRuleEngineInput({
        bbr: analysisInput.bbr,
        kommuneplanramme: analysisInput.kommuneplanramme ?? null,
        lokalplaner: analysisInput.lokalplaner ?? [],
        lokalplanExtract: analysisInput.lokalplanExtract,
        naturbeskyttelse: analysisInput.naturbeskyttelse ?? null,
        geusRisk: analysisInput.geusRisk ?? null,
        servitutter: analysisInput.servitutter ?? null,
        terrain: analysisInput.terrain ?? null,
        fbbData: analysisInput.fbbData ?? null,
        dkjord: null,
        byggeoenske: analysisInput.byggeoenske,
        municipality: analysisInput.municipality ?? "",
        kommunekode: analysisInput.kommunekode ?? "",
      });
      ruleEngineResult = deps.runRuleEngine(ruleInput, missingFields);
    } catch (e) {
      logger.warn("[ByggeanalyseService] Regelkerne fejlede (ikke kritisk):", (e as Error).message);
    }

    // Build a typed input from only the known ByggeanalyseInput fields.
    // Never forward unknown client-supplied fields (e.g. hasHardStop) into the AI service.
    // ruleEngineResult is always sourced from the server's own rule engine run above.
    const aiInput: ByggeanalyseInput = {
      byggeoenske: analysisInput.byggeoenske,
      lokalplanExtract: analysisInput.lokalplanExtract,
      bbr: analysisInput.bbr,
      lokalplanNavn: analysisInput.lokalplanNavn,
      kommuneplanramme: analysisInput.kommuneplanramme,
      lokalplaner: analysisInput.lokalplaner,
      naturbeskyttelse: analysisInput.naturbeskyttelse,
      geusRisk: analysisInput.geusRisk,
      servitutter: analysisInput.servitutter,
      terrain: analysisInput.terrain,
      fbbData: analysisInput.fbbData,
      municipality: analysisInput.municipality,
      kommunekode: analysisInput.kommunekode,
      ruleEngineResult,
    };
    return deps.ByggeanalyseService.analyse(aiInput);
  });
}

// ---------------------------------------------------------------------------
// createServerFn wrappers — thin: validate → auth → delegate to handler
// ---------------------------------------------------------------------------

export const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    const { analyseAddress } = await import("@/lib/analysis-orchestrator");
    return handleFetchCompliance(data, { withAuth, analyseAddress });
  });

export const runByggeanalyse = createServerFn({ method: "POST" })
  .inputValidator((data: ByggeanalyseInput & { token: string }) => {
    if (!data.token || typeof data.token !== "string") throw new Error("Token er påkrævet");
    return data;
  })
  .handler(async ({ data }): Promise<ByggeanalyseResultat> => {
    const { assembleRuleEngineInput } = await import("@/lib/rule-engine/input-assembler");
    const { runRuleEngine } = await import("@/lib/rule-engine/engine");
    const { ByggeanalyseService } = await import("@/integrations/ai/byggeanalyse");
    return handleRunByggeanalyse(data, {
      withAuth,
      assembleRuleEngineInput,
      runRuleEngine,
      ByggeanalyseService,
    });
  });
