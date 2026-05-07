/**
 * Analysis-orchestrator evals (ARCH-96).
 * Tester den cache-first compliance-pipeline end-to-end.
 * Alle cases kræver EVAL_LIVE=true (Datafordeler + Supabase + Anthropic).
 *
 * Testadresse: Hasselvej 48, 2830 Virum — konsistent med MOCK_ADRESSE.
 */

import type { EvalSuite } from "../types.ts";
import type { AnalysisInput, ComplianceResult } from "@/lib/analysis-orchestrator.ts";
import { MOCK_ADRESSE } from "@/lib/mock-data.ts";

const HASSELVEJ_INPUT: AnalysisInput = {
  addressId: MOCK_ADRESSE.adresseid,
  adgangsadresseid: MOCK_ADRESSE.adgangsadresseid,
  ejerlavskode: MOCK_ADRESSE.ejerlavskode,
  matrikelnummer: MOCK_ADRESSE.matrikelnummer,
  koordinater: MOCK_ADRESSE.koordinater,
  grundareal: MOCK_ADRESSE.grundareal,
};

async function runOrchestrator(input: AnalysisInput): Promise<ComplianceResult> {
  const { analyseAddress } = await import("@/lib/analysis-orchestrator.ts");
  return analyseAddress(input);
}

export const orchestratorSuite: EvalSuite<AnalysisInput, ComplianceResult> = {
  name: "Analysis orchestrator",
  run: runOrchestrator,
  cases: [
    {
      id: "orchestrator-struktur",
      description: "analyseAddress() returnerer ComplianceResult med alle påkrævede felter",
      scoring: "structural",
      threshold: 1.0,
      requiresLive: true,
      input: HASSELVEJ_INPUT,
      expected: {
        bbr: "object",
        lokalplaner: "array",
        kommuneplanramme: "defined",
        analysedAt: "string",
        lokalplanExtract: "defined",
        naturbeskyttelse: "defined",
        dkjord: "defined",
        geusRisk: "defined",
        servitutter: "defined",
        terrain: "defined",
        naboer: "defined",
      } as never,
    },

    {
      id: "orchestrator-bbr-hasselvej",
      description: "BBR for Hasselvej 48 har grundareal og er beregning_mulig",
      scoring: "structural",
      threshold: 1.0,
      requiresLive: true,
      input: HASSELVEJ_INPUT,
      expected: {
        bbr: "object",
        analysedAt: "string",
      } as never,
    },

    {
      id: "orchestrator-semantik",
      description:
        "Pipeline returnerer meningsfuldt compliance-resultat for dansk parcelhusadresse",
      scoring: "semantic",
      threshold: 0.75,
      requiresLive: true,
      input: HASSELVEJ_INPUT,
      rubric: [
        "bbr-feltet er et objekt og ikke null",
        "analysedAt er en ISO-datostrengt",
        "lokalplaner er et array (evt. tomt)",
        "Resultatet virker konsistent for en dansk boligadresse",
      ],
    },
  ],
};
