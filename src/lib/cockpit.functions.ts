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
import {
  lokalplanExtractSchema,
  ruleEngineBbrDataSchema,
  ruleEngineFbbResultSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEngineKommuneplanrammeSchema,
  ruleEngineLokalplanSchema,
  ruleEngineNaturbeskyttelsesResultatSchema,
  ruleEngineTerrainDataSchema,
  ruleEngineTinglysningResultSchema,
} from "@/types/project-restore.schemas";
import { byggeoenskeSchema } from "@/types/project-sync.schemas";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const analysisInputSchema = z.object({
  addressId: z.string().min(1).max(64),
  adgangsadresseid: z.string().max(64),
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

const byggeanalyseInputSchema = z
  .object({
    token: z.string().min(1),
    byggeoenske: byggeoenskeSchema.optional().default({}),
    lokalplanExtract: lokalplanExtractSchema.nullable(),
    bbr: ruleEngineBbrDataSchema.nullable(),
    lokalplanNavn: z.string(),
    kommuneplanramme: ruleEngineKommuneplanrammeSchema.nullable().optional(),
    lokalplaner: z.array(ruleEngineLokalplanSchema).optional(),
    naturbeskyttelse: ruleEngineNaturbeskyttelsesResultatSchema.nullable().optional(),
    geusRisk: ruleEngineGeusRiskDataSchema.nullable().optional(),
    servitutter: ruleEngineTinglysningResultSchema.nullable().optional(),
    terrain: ruleEngineTerrainDataSchema.nullable().optional(),
    fbbData: ruleEngineFbbResultSchema.nullable().optional(),
    municipality: z.string().optional(),
    kommunekode: z.string().optional(),
  })
  .passthrough();

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
  const { token } = byggeanalyseTokenSchema.parse(rawData);
  const analysisInput: ByggeanalyseInput = byggeanalyseInputSchema.parse(rawData);

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

const runByggeanalyseInputSchema = z.object({
  projectId: z.string().uuid("projectId skal være et UUID"),
  accessToken: z.string().min(1, "accessToken er påkrævet"),
  byggeoenske: byggeoenskeSchema.optional().default({}),
});

export const runByggeanalyse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => runByggeanalyseInputSchema.parse(data))
  .handler(
    async ({ data }): Promise<import("@/integrations/ai/byggeanalyse").ByggeanalyseGatedResult> => {
      return withAuth(data.accessToken, async (userId) => {
        const { runByggeanalyseGated } = await import("@/lib/byggeanalyse.server");
        return runByggeanalyseGated({
          projectId: data.projectId,
          userId,
          byggeoenske: data.byggeoenske,
        });
      });
    },
  );
