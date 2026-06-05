import { z } from "zod";
import { dataStatusMapSchema } from "@/lib/datacheck";
import {
  addressKoordinaterSchema,
  billedeAnalyseResultatSchema,
  byggeoenskeSchema,
  designPlacementSchema,
  byggeanalyseResultatSchema,
  fjernvarmeResultatSchema,
  husDnaSchema,
  neighborBuildingDataSchema,
  ruleEngineBbrDataSchema,
  ruleEngineDkJordResultatSchema,
  ruleEngineFbbResultSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEngineKommuneplanrammeSchema,
  ruleEngineLokalplanSchema,
  ruleEngineNaturbeskyttelsesResultatSchema,
  ruleEngineArealdataContextSchema,
  ruleEnginePlandataContextSchema,
  ruleEngineTerrainDataSchema,
  ruleEngineTinglysningResultSchema,
  vurDataSchema,
  tjekditnetCoverageSchema,
  energimaerkeSchema,
} from "./project-restore.schemas";

const tokenSchema = z.string().min(1);

export const addressSchema = z
  .object({
    adresseid: z.string(),
    adresse: z.string(),
    postnr: z.string(),
    postnrnavn: z.string(),
    kommune: z.string(),
    kommunekode: z.string(),
    matrikel: z.string().nullable(),
    adgangsadresseid: z.string(),
    koordinater: addressKoordinaterSchema.nullable(),
    bbrId: z.string().nullable(),
    ejerlavskode: z.number().nullable(),
    matrikelnummer: z.string().nullable(),
    grundareal: z.number().nullable(),
    centroid: addressKoordinaterSchema.nullable().optional(),
    rotationDeg: z.number().optional(),
    footprintAreaM2: z.number().nullable().optional(),
    minDistanceToBoundaryM: z.number().nullable().optional(),
    outsideParcelAreaM2: z.number().optional(),
  })
  .partial()
  .strict();

const complianceFlagSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["ok", "advarsel", "blocker"]),
    detalje: z.string().nullable(),
    aktuelVærdi: z.string().nullable(),
    tilladt: z.string().nullable(),
    kilde: z.enum([
      "bbr",
      "plandata",
      "servitut",
      "beregnet",
      "sdfi",
      "dkjord",
      "geus",
      "regelkerne",
      "fbb",
    ]),
    dispensationMulig: z.boolean().optional(),
    dispensationMyndighed: z.string().optional(),
  })
  .strict();

export const projectPatchSchema = z
  .object({
    address: addressSchema.optional(),
    bbrData: ruleEngineBbrDataSchema.nullable().optional(),
    husDna: husDnaSchema.nullable().optional(),
    byggeoenske: byggeoenskeSchema.optional(),
    designPlacement: designPlacementSchema.nullable().optional(),
    complianceFlags: z.array(complianceFlagSchema).optional(),
    lokalplaner: z.array(ruleEngineLokalplanSchema).optional(),
    kommuneplanramme: ruleEngineKommuneplanrammeSchema.nullable().optional(),
    plandataContext: ruleEnginePlandataContextSchema.nullable().optional(),
    arealdataContext: ruleEngineArealdataContextSchema.nullable().optional(),
    byggeanalyseResultat: byggeanalyseResultatSchema.nullable().optional(),
    vurderingData: vurDataSchema.nullable().optional(),
    naturbeskyttelse: ruleEngineNaturbeskyttelsesResultatSchema.nullable().optional(),
    dkjord: ruleEngineDkJordResultatSchema.nullable().optional(),
    geusRisk: ruleEngineGeusRiskDataSchema.nullable().optional(),
    servitutter: ruleEngineTinglysningResultSchema.nullable().optional(),
    terrain: ruleEngineTerrainDataSchema.nullable().optional(),
    naboer: neighborBuildingDataSchema.nullable().optional(),
    fjernvarme: fjernvarmeResultatSchema.nullable().optional(),
    fbbData: ruleEngineFbbResultSchema.nullable().optional(),
    billedanalyse: billedeAnalyseResultatSchema.nullable().optional(),
    tjekditnetCoverage: tjekditnetCoverageSchema.nullable().optional(),
    energimaerke: energimaerkeSchema.nullable().optional(),
    complianceDone: z.boolean().optional(),

    currentStep: z.string().optional(),
    projectDataStatus: dataStatusMapSchema.nullable().optional(),
    analysisRunId: z.string().uuid().nullable().optional(),
    budget_estimate: z.number().nullable().optional(),
  })
  .strict();

export const saveProjectSchema = z.object({
  accessToken: tokenSchema,
  patch: projectPatchSchema,
  projectId: z.string().uuid().nullable().optional(),
});

export const loadProjectSchema = z.object({
  accessToken: tokenSchema,
  projectId: z.string().uuid().nullable().optional(),
  addressId: z.string().optional().nullable(),
});

export const deleteProjectSchema = z.object({
  accessToken: tokenSchema,
  projectId: z.string().uuid(),
});

export const createProjectSchema = z.object({ accessToken: tokenSchema });

export { byggeoenskeSchema, designPlacementSchema } from "./project-restore.schemas";
