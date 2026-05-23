// SERVER-SIDE ONLY — loads trusted compliance state from Supabase.
// Never call directly from client code.

import { z, type ZodType } from "zod";
import { loadProject } from "@/integrations/supabase/repositories/projects.repository";
import { getSiteConstraints } from "@/integrations/supabase/repositories/site-constraints.repository";
import type {
  RuleEngineBbrData,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEngineLokalplanExtract,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { logServerEvent } from "@/lib/server-logger";
import type { Byggeoenske } from "@/types/project-state";
import type { ByggeanalyseGatedResult } from "@/integrations/ai/byggeanalyse";
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

function decodeComplianceField<T>(
  complianceData: unknown,
  keys: string[],
  schema: ZodType<T>,
): T | null {
  if (typeof complianceData !== "object" || complianceData === null) {
    return null;
  }
  const record = complianceData as Record<string, unknown>;
  for (const key of keys) {
    const parsed = schema.safeParse(record[key]);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export async function runByggeanalyseGated(params: {
  projectId: string;
  userId: string;
  byggeoenske: Partial<Byggeoenske>;
}): Promise<ByggeanalyseGatedResult> {
  const { projectId, userId, byggeoenske } = params;

  const project = await loadProject(userId, projectId);

  if (!project) {
    logServerEvent({
      module: "byggeanalyse.server",
      operation: "runByggeanalyseGated",
      severity: "degraded",
      message: "Projekt ikke fundet for bruger",
      trace: null,
      metadata: { projectId },
    });
    return { status: "missing_data", reason: "Projekt ikke fundet" };
  }

  const siteConstraints = project.address_adresseid
    ? await getSiteConstraints(project.address_adresseid)
    : null;

  const saveValue = project.heritage_save_value ?? siteConstraints?.save_value ?? null;
  const isFredet = project.is_fredet ?? siteConstraints?.is_fredet ?? null;

  const hardStopEval = evaluateHardStop({
    saveValue,
    isFredet,
    strandbeskyttelse: siteConstraints?.strandbeskyttelse ?? null,
    fredskov: siteConstraints?.fredskov ?? null,
    klitfredning: siteConstraints?.klitfredning ?? null,
  });

  const isHardStop = project.hard_stop === true || hardStopEval.hardStop;
  const hardStopReason =
    project.hard_stop_reason ?? hardStopEval.hardStopReason ?? "Hard Stop detekteret";

  if (isHardStop) {
    logServerEvent({
      module: "byggeanalyse.server",
      operation: "runByggeanalyseGated",
      severity: "degraded",
      message: "AI-analyse blokeret af Hard Stop",
      trace: null,
      metadata: { projectId, hardStopReason },
    });
    return { status: "blocked", hardStopReason };
  }

  const cd = project.compliance_data;

  const bbrData = decodeComplianceField(cd, ["bbr", "bbrData"], ruleEngineBbrDataSchema);
  const fbbData = decodeComplianceField(cd, ["fbbData"], ruleEngineFbbResultSchema);
  const lokalplaner =
    decodeComplianceField(cd, ["lokalplaner"], z.array(ruleEngineLokalplanSchema)) ?? [];
  const lokalplanExtract = decodeComplianceField(cd, ["lokalplanExtract"], lokalplanExtractSchema);
  const kommuneplanramme = decodeComplianceField(
    cd,
    ["kommuneplanramme"],
    ruleEngineKommuneplanrammeSchema,
  );
  const naturbeskyttelse = decodeComplianceField(
    cd,
    ["naturbeskyttelse"],
    ruleEngineNaturbeskyttelsesResultatSchema,
  );
  const geusRisk = decodeComplianceField(cd, ["geusRisk"], ruleEngineGeusRiskDataSchema);
  const servitutter = decodeComplianceField(cd, ["servitutter"], ruleEngineTinglysningResultSchema);
  const terrain = decodeComplianceField(cd, ["terrain"], ruleEngineTerrainDataSchema);

  if (!bbrData) {
    return {
      status: "missing_data",
      reason: "Compliance-data ikke indlæst — kør adresseanalyse først",
    };
  }

  let ruleEngineResult: import("@/lib/rule-engine/types").RuleEngineResult | undefined;

  try {
    const { assembleRuleEngineInput } = await import("@/lib/rule-engine/input-assembler");
    const { runRuleEngine } = await import("@/lib/rule-engine/engine");
    const { input, missingFields } = assembleRuleEngineInput({
      bbr: bbrData,
      kommuneplanramme,
      lokalplaner,
      lokalplanExtract: (lokalplanExtract as RuleEngineLokalplanExtract) ?? null,
      naturbeskyttelse,
      geusRisk,
      servitutter,
      terrain,
      fbbData,
      dkjord: null,
      // Partial<Byggeoenske> is structurally compatible — assembler handles undefined fields via missingFields
      byggeoenske: (byggeoenske ?? null) as import("@/types/project-state").Byggeoenske | null,
      municipality: "", // not available from JSONB — rule engine uses missingFields for locality-specific rules
      kommunekode: "",
    });
    ruleEngineResult = runRuleEngine(input, missingFields);

    const blockers = ruleEngineResult.violations.filter(
      (v) => v.severity === "illegal" || v.severity === "dispensation_required",
    );
    if (blockers.length > 0) {
      const reason = blockers.map((v) => v.reason).join("; ");
      return { status: "blocked", hardStopReason: reason };
    }
  } catch (e) {
    logServerEvent({
      module: "byggeanalyse.server",
      operation: "runByggeanalyseGated",
      severity: "fatal",
      message: "Regelkerne fejlede — AI-analyse afbrudt",
      error: (e as Error).message,
      trace: null,
      metadata: { projectId },
    });
    return { status: "missing_data", reason: "Regelkerne fejlede — prøv igen" };
  }

  const { ByggeanalyseService } = await import("@/integrations/ai/byggeanalyse");
  const { selectPrimaryLokalplanForPdf } = await import("@/integrations/plandata/selectors");

  const primaryLp = selectPrimaryLokalplanForPdf(lokalplaner);
  const lokalplanNavn = primaryLp?.plannavn ?? primaryLp?.plannr ?? "Ukendt lokalplan";

  const resultat = await ByggeanalyseService.analyse({
    byggeoenske,
    lokalplanExtract,
    bbr: bbrData,
    lokalplanNavn,
    kommuneplanramme,
    lokalplaner,
    naturbeskyttelse,
    geusRisk,
    servitutter,
    terrain,
    fbbData,
    ruleEngineResult,
  });

  return { status: "ok", ...resultat };
}
