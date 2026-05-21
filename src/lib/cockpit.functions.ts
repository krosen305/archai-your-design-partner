import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { ByggeanalyseInput, ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";

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

export const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    return withAuth(data.token, async (userId) => {
      const { token: _token, ...analysisInput } = data;
      const { analyseAddress } = await import("@/lib/analysis-orchestrator");
      return analyseAddress({ ...analysisInput, userId });
    });
  });

export const runByggeanalyse = createServerFn({ method: "POST" })
  .inputValidator((data: ByggeanalyseInput & { token: string }) => {
    if (!data.token || typeof data.token !== "string") throw new Error("Token er påkrævet");
    return data;
  })
  .handler(async ({ data }): Promise<ByggeanalyseResultat> => {
    return withAuth(data.token, async () => {
      const { token: _token, ...analysisInput } = data;

      let ruleEngineResult: import("@/lib/rule-engine/types").RuleEngineResult | undefined;
      try {
        const { assembleRuleEngineInput } = await import("@/lib/rule-engine/input-assembler");
        const { runRuleEngine } = await import("@/lib/rule-engine/engine");
        const { input: ruleInput, missingFields } = assembleRuleEngineInput({
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
        ruleEngineResult = runRuleEngine(ruleInput, missingFields);
      } catch (e) {
        logger.warn(
          "[ByggeanalyseService] Regelkerne fejlede (ikke kritisk):",
          (e as Error).message,
        );
      }

      const { ByggeanalyseService } = await import("@/integrations/ai/byggeanalyse");
      return ByggeanalyseService.analyse({ ...analysisInput, ruleEngineResult });
    });
  });
