// SERVER-SIDE ONLY — loads trusted compliance state from Supabase.
// Never call directly from client code.

import { loadProject } from "@/integrations/supabase/repositories/projects.repository";
import { getSiteConstraints } from "@/integrations/supabase/repositories/site-constraints.repository";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { logServerEvent } from "@/lib/server-logger";
import type { Byggeoenske } from "@/types/project-state";
import type { ByggeanalyseGatedResult } from "@/integrations/ai/byggeanalyse";

function extractComplianceField<T>(complianceData: unknown, key: string): T | null {
  if (
    typeof complianceData !== "object" ||
    complianceData === null ||
    !(key in (complianceData as Record<string, unknown>))
  ) {
    return null;
  }
  const value = (complianceData as Record<string, unknown>)[key];
  return (value ?? null) as T | null;
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

  const bbrData = extractComplianceField(cd, "bbrData");
  const fbbData = extractComplianceField(cd, "fbbData");
  const lokalplaner = extractComplianceField<unknown[]>(cd, "lokalplaner") ?? [];
  const lokalplanExtract = extractComplianceField(cd, "lokalplanExtract");
  const kommuneplanramme = extractComplianceField(cd, "kommuneplanramme");
  const naturbeskyttelse = extractComplianceField(cd, "naturbeskyttelse");
  const geusRisk = extractComplianceField(cd, "geusRisk");
  const servitutter = extractComplianceField(cd, "servitutter");
  const terrain = extractComplianceField(cd, "terrain");

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
      bbr: bbrData as import("@/integrations/bbr/client").BbrKompliantData,
      kommuneplanramme:
        (kommuneplanramme as import("@/integrations/plandata/client").Kommuneplanramme) ?? null,
      lokalplaner:
        (lokalplaner as import("@/integrations/plandata/client").Lokalplan[]) ?? [],
      lokalplanExtract:
        (lokalplanExtract as import("@/integrations/ai/pdf-extractor").LokalplanExtract) ?? null,
      naturbeskyttelse:
        (naturbeskyttelse as import("@/integrations/sdfi/naturbeskyttelse").NaturbeskyttelsesResultat) ?? null,
      geusRisk: (geusRisk as import("@/integrations/geus/client").GeusRiskData) ?? null,
      servitutter:
        (servitutter as import("@/integrations/tinglysning/client").TinglysningResult) ?? null,
      terrain: (terrain as import("@/integrations/sdfi/dhm-client").TerrainData) ?? null,
      fbbData: (fbbData as import("@/integrations/fbb/client").FbbResultat) ?? null,
      dkjord: null,
      byggeoenske: byggeoenske as import("@/types/project-state").Byggeoenske,
      municipality: "",
      kommunekode: "",
    });
    ruleEngineResult = runRuleEngine(input, missingFields);

    const illegalViolations = ruleEngineResult.violations.filter(
      (v) => v.severity === "illegal",
    );
    if (illegalViolations.length > 0) {
      const reason = illegalViolations.map((v) => v.reason).join("; ");
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

  const primaryLp = selectPrimaryLokalplanForPdf(
    lokalplaner as import("@/integrations/plandata/client").Lokalplan[],
  );
  const lokalplanNavn = primaryLp?.plannavn ?? primaryLp?.plannr ?? "Ukendt lokalplan";

  const resultat = await ByggeanalyseService.analyse({
    byggeoenske,
    lokalplanExtract:
      (lokalplanExtract as import("@/integrations/ai/pdf-extractor").LokalplanExtract) ?? null,
    bbr: bbrData as import("@/integrations/bbr/client").BbrKompliantData,
    lokalplanNavn,
    kommuneplanramme:
      (kommuneplanramme as import("@/integrations/plandata/client").Kommuneplanramme) ?? null,
    lokalplaner:
      (lokalplaner as import("@/integrations/plandata/client").Lokalplan[]) ?? [],
    naturbeskyttelse:
      (naturbeskyttelse as import("@/integrations/sdfi/naturbeskyttelse").NaturbeskyttelsesResultat) ?? null,
    geusRisk: (geusRisk as import("@/integrations/geus/client").GeusRiskData) ?? null,
    servitutter:
      (servitutter as import("@/integrations/tinglysning/client").TinglysningResult) ?? null,
    terrain: (terrain as import("@/integrations/sdfi/dhm-client").TerrainData) ?? null,
    fbbData: (fbbData as import("@/integrations/fbb/client").FbbResultat) ?? null,
    ruleEngineResult,
  });

  return { status: "ok", ...resultat };
}
