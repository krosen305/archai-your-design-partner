import { z } from "zod";
import { dataStatusMapSchema } from "@/lib/datacheck";

const complianceFlagSourceValues = [
  "bbr",
  "plandata",
  "servitut",
  "beregnet",
  "sdfi",
  "dkjord",
  "geus",
  "regelkerne",
  "fbb",
] as const;

const coordinateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const complianceFlagSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["ok", "advarsel", "blocker"]),
  detalje: z.string().nullable(),
  aktuelVærdi: z.string().nullable(),
  tilladt: z.string().nullable(),
  kilde: z.enum(complianceFlagSourceValues),
  dispensationMulig: z.boolean().optional(),
  dispensationMyndighed: z.string().optional(),
});

export const vurDataSchema = z
  .object({
    ejendomsvaerdi: z.number().nullable(),
    grundvaerdi: z.number().nullable(),
    vurderetAreal: z.number().nullable(),
    vurderingsaar: z.number().nullable(),
    bfeNr: z.string(),
    fejl: z.string().nullable(),
  })
  .passthrough();

export const fjernvarmeResultatSchema = z
  .object({
    fjernvarmeDaekket: z.boolean().nullable(),
    fejl: z.string().nullable(),
  })
  .passthrough();

const neighborBuildingSchema = z
  .object({
    adgangsadresseid: z.string(),
    adresse: z.string(),
    distanceM: z.number(),
  })
  .passthrough();

export const neighborBuildingDataSchema = z
  .object({
    count: z.number(),
    nearestDistanceM: z.number().nullable(),
    buildings: z.array(neighborBuildingSchema),
    fejl: z.string().nullable(),
    kilde: z.string().nullable(),
    accessRoadNearby: z.boolean().nullable(),
    roadDistanceM: z.number().nullable(),
  })
  .passthrough();

export const matParcelGeometryPayloadSchema = z
  .object({
    polygonAreaM2: z.number().nullable(),
    registreretArealM2: z.number().nullable(),
    areaDiscrepancyM2: z.number().nullable(),
    centroidLat: z.number().nullable(),
    centroidLng: z.number().nullable(),
    bbox25832: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
    featureCount: z.number(),
    hasCanonicalPolygon: z.boolean(),
  })
  .passthrough();

export const ruleEngineBbrDataSchema = z
  .object({
    grundareal: z.number().nullable(),
    bebygget_areal: z.number().nullable(),
    samlet_areal: z.number().nullable(),
    antal_etager: z.number().nullable(),
    byggeaar: z.string().nullable(),
    anvendelseskode: z.string().nullable(),
    anvendelse_tekst: z.string().nullable(),
    bebyggelsesprocent: z.number().nullable(),
    beregning_mulig: z.boolean(),
    fejl: z.string().nullable(),
    varmeinstallation: z.string().nullable(),
    opvarmningsmiddel: z.string().nullable(),
    ydervaegs_materiale: z.string().nullable(),
    tagdaekning: z.string().nullable(),
    fredet: z.boolean().nullable(),
    mat_strandbeskyttelse: z.boolean().nullable(),
    mat_fredskov: z.boolean().nullable(),
    mat_klitfredning: z.boolean().nullable(),
    bygning_lokal_id: z.string().nullable(),
    fbb_reference: z.string().nullable(),
    alle_bygning_lokal_ids: z.array(z.string()),
    jordstykke_lokal_id: z.string().nullable(),
    canonical_building_lokal_id: z.string().nullable(),
    canonical_selection_reason: z.string().nullable(),
    canonical_candidates_count: z.number(),
    aggregated_bebygget_areal_all_primary: z.number().nullable(),
    bygning_samlet_boligareal: z.number().nullable(),
  })
  .passthrough();

export const ruleEngineLokalplanSchema = z
  .object({
    planid: z.string(),
    plannavn: z.string(),
    plannr: z.string().nullable(),
    kommunenavn: z.string().nullable(),
    komnr: z.number().nullable(),
    datoVedtaget: z.string().nullable(),
    datoIkraft: z.string().nullable(),
    plandokumentLink: z.string().nullable(),
    plantype: z.string().nullable(),
    status: z.string().nullable(),
    anvgen: z.number().nullable(),
    anvendelseGenerel: z.string().nullable(),
  })
  .passthrough();

export const ruleEngineKommuneplanrammeSchema = z
  .object({
    planid: z.string(),
    plannavn: z.string(),
    plannr: z.string().nullable(),
    kommunenavn: z.string().nullable(),
    komnr: z.number().nullable(),
    bebygpct: z.number().nullable(),
    maxetager: z.number().nullable(),
    maxbygnhjd: z.number().nullable(),
    anvgen: z.number().nullable(),
    anvendelseGenerel: z.string().nullable(),
    fremtidigzonestatus: z.string().nullable(),
    sforhold: z.string().nullable(),
    planstatus: z.string().nullable(),
    datoIkraft: z.string().nullable(),
    plandokumentLink: z.string().nullable(),
  })
  .passthrough();

export const ruleEngineFbbResultSchema = z
  .object({
    fbb_bygninger: z.array(
      z
        .object({
          bygningsid: z.number(),
          bygningsnummer: z.number(),
          bevaringsvaerdi: z.number(),
          fredningsstatus: z.string().nullable(),
          fredet: z.boolean(),
        })
        .passthrough(),
    ),
    fbb_bedste_bygning: z
      .object({
        bygningsid: z.number(),
        bevaringsvaerdi: z.number(),
        fredningsstatus: z.string().nullable(),
      })
      .passthrough()
      .nullable(),
    fbb_er_fredet: z.boolean(),
    kilde: z.enum(["fbb-wfs", "adresse-fallback", "fejl", "ingen-ids"]).optional(),
  })
  .passthrough();

export const ruleEngineNaturbeskyttelsesResultatSchema = z
  .object({
    strandbeskyttelse: z.boolean(),
    skovbyggelinje: z.boolean(),
    aabeskyttelse: z.boolean(),
    soebeskyttelse: z.boolean(),
    klitfredning: z.boolean(),
    kirkebyggelinje: z.boolean(),
  })
  .passthrough();

export const ruleEngineGeusRiskDataSchema = z
  .object({
    radonRisk: z.enum(["low", "medium", "high", "unknown"]),
    groundwaterDepthM: z.number().nullable(),
    groundwaterDataSource: z.string().nullable(),
    groundwaterDepthWinterM: z.number().nullable(),
    groundwaterDepthSummerM: z.number().nullable(),
    groundwaterModelUncertaintyM: z.number().nullable(),
    geoteknikJordart: z.string().nullable(),
    kilde: z.enum(["geus", "mock"]),
  })
  .passthrough();

const ruleEngineServitutSchema = z
  .object({
    dokumentId: z.string(),
    type: z.enum(["brugsret", "vejret", "byggelinje", "højdebegrænsning", "andet"]),
    tekst: z.string(),
    tinglystDato: z.string(),
    kritisk: z.boolean(),
  })
  .passthrough();

export const ruleEngineTinglysningResultSchema = z
  .object({
    servitutter: z.array(ruleEngineServitutSchema),
    pant: z.number(),
    kilde: z.enum(["tinglysning", "mock"]),
  })
  .passthrough();

export const ruleEngineTerrainDataSchema = z
  .object({
    minElevationM: z.number(),
    maxElevationM: z.number(),
    avgElevationM: z.number(),
    slopePercent: z.number(),
    lowPointM: z.number(),
    bluespotRisk: z.boolean().nullable(),
    northOrientation: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
    kotepunkter: z.array(
      z
        .object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        })
        .passthrough(),
    ),
    kilde: z.enum(["dhm", "mock"]),
  })
  .passthrough();

export const ruleEngineDkJordResultatSchema = z
  .object({
    v1Kortlagt: z.boolean().nullable(),
    v2Kortlagt: z.boolean().nullable(),
    olietank: z
      .object({
        eksisterer: z.boolean().nullable(),
        driftsstatus: z.string().nullable(),
      })
      .passthrough(),
    omraadeklassificering: z.string().nullable(),
    nuancering: z.string().nullable(),
    lokalitetsId: z.string().nullable(),
    kilde: z.enum(["dkjord", "mock"]),
  })
  .passthrough();

export const ruleEnginePlandataContextSchema = z
  .object({
    zoneType: z.enum(["byzone", "landzone", "sommerhusomraade", "unknown"]).nullable(),
    futureZoneType: z.enum(["byzone", "landzone", "sommerhusomraade", "unknown"]).nullable(),
    landzonePermitRequired: z.boolean().nullable(),
    lokalplanDelomraadeId: z.string().nullable(),
    lokalplanByggefeltPresent: z.boolean().nullable(),
    withinBuildingField: z.boolean().nullable(),
    buildingFieldSourceId: z.string().nullable(),
    wastewaterPlanStatus: z.string().nullable(),
    sewerAreaType: z.string().nullable(),
    sourceLokalplanId: z.string().nullable(),
    sourceKommuneplanId: z.string().nullable(),
    zoneSourcePlanId: z.string().nullable(),
    wastewaterSourceId: z.string().nullable(),
  })
  .passthrough();

export const ruleEngineArealdataContextSchema = z
  .object({
    paragraph3Nature: z.boolean().nullable(),
    natura2000: z.boolean().nullable(),
    protectedDige: z.boolean().nullable(),
    fortidsminde: z.boolean().nullable(),
    fortidsmindeBuffer: z.boolean().nullable(),
    bnbo: z.boolean().nullable(),
    osd: z.boolean().nullable(),
    rawMaterialArea: z.boolean().nullable(),
  })
  .passthrough();

const byggeanalyseItemSchema = z.object({
  emne: z.string(),
  begrundelse: z.string(),
});

const byggeanalyseDispensationSchema = z.object({
  emne: z.string(),
  begrundelse: z.string(),
  lovhjemmel: z.string(),
});

const byggeanalyseKonfliktSchema = z.object({
  emne: z.string(),
  konflikt: z.string(),
  lokalplan_krav: z.string(),
  bruger_oenske: z.string(),
});

const byggeanalyseMangelSchema = z.object({
  emne: z.string(),
  hvad_mangler: z.string(),
});

export const lokalplanExtractSchema = z
  .object({
    maxEtager: z.number().nullable(),
    maxBebyggelsespct: z.number().nullable(),
    tagform: z.string().nullable(),
    materialer: z.array(z.string()),
    byggelinjer: z.string().nullable(),
    specialBestemmelser: z.array(z.string()),
    kilde: z.enum(["mock", "anthropic"]),
  })
  .passthrough();

const ruleViolationSchema = z.object({
  rule: z.string(),
  severity: z.enum(["illegal", "dispensation_required", "warning"]),
  reason: z.string(),
  authority: z.string().optional(),
  confidence: z.number().optional(),
});

const dispensationItemSchema = z.object({
  rule: z.string(),
  label: z.string(),
  authority: z.string(),
  reason: z.string(),
});

const calcEntrySchema = z.object({
  actual: z.number().nullable(),
  limit: z.number().nullable(),
  appliedRule: z.enum(["lokalplan", "kommuneplan", "br18_default", "unknown"]),
  confidence: z.number(),
  compliant: z.boolean().nullable(),
  violation: ruleViolationSchema.nullable(),
});

const ruleEngineResultSchema = z.object({
  status: z.enum(["OK", "INCOMPLETE", "REQUIRES_DISPENSATION", "ILLEGAL"]),
  checkedRules: z.array(z.string()),
  missingInputs: z.array(z.string()),
  violations: z.array(ruleViolationSchema),
  dispensationList: z.array(dispensationItemSchema),
  calculations: z.object({
    buildingPercent: calcEntrySchema,
    height: calcEntrySchema,
    storeys: calcEntrySchema,
    setback: calcEntrySchema,
  }),
});

export const byggeanalyseResultatSchema = z
  .object({
    tilladt: z.array(byggeanalyseItemSchema),
    kraever_dispensation: z.array(byggeanalyseDispensationSchema),
    konflikt: z.array(byggeanalyseKonfliktSchema),
    mangler_data: z.array(byggeanalyseMangelSchema),
    stilOpsummering: z.string().nullable(),
    kilde: z.enum(["mock", "anthropic"]),
    ruleEngine: ruleEngineResultSchema.optional(),
  })
  .passthrough();

export const husDnaSchema = z
  .object({
    stil: z.string(),
    bruttoareal: z.string(),
    etager: z.string(),
    tagform: z.string(),
    energiklasse: z.string(),
    saerligeKrav: z.array(z.string()),
    confidence: z.number(),
    kilde: z.enum(["mock", "anthropic"]),
  })
  .passthrough();

const billedeAnalyseKategorierSchema = z.object({
  facade: z.array(z.string()),
  tagform: z.array(z.string()),
  vinduer: z.array(z.string()),
  materialer: z.array(z.string()),
  saerligeTraek: z.array(z.string()),
  farver: z.array(z.string()),
  stil: z.array(z.string()),
});

export const billedeAnalyseResultatSchema = z
  .object({
    kategorier: billedeAnalyseKategorierSchema,
    konflikter: z.array(
      z.object({
        kategori: z.enum([
          "facade",
          "tagform",
          "vinduer",
          "materialer",
          "saerligeTraek",
          "farver",
          "stil",
        ]),
        muligheder: z.array(z.array(z.string())),
        billedAntal: z.array(z.number()),
      }),
    ),
    ekstraTags: z.array(z.string()),
    confidence: z.number(),
    kilde: z.enum(["haiku", "mock"]),
  })
  .passthrough();

export const restoredComplianceDataSchema = z
  .object({
    bbr: ruleEngineBbrDataSchema.nullable().optional().default(null),
    flags: z.array(complianceFlagSchema).optional().default([]),
    lokalplaner: z.array(ruleEngineLokalplanSchema).optional().default([]),
    kommuneplanramme: ruleEngineKommuneplanrammeSchema.nullable().optional().default(null),
    plandataContext: ruleEnginePlandataContextSchema.nullable().optional().default(null),
    arealdataContext: ruleEngineArealdataContextSchema.nullable().optional().default(null),
    byggeanalyseResultat: byggeanalyseResultatSchema.nullable().optional().default(null),
    vurderingData: vurDataSchema.nullable().optional().default(null),
  })
  .passthrough();

export const addressKoordinaterSchema = coordinateSchema;

export const byggeoenskeSchema = z
  .object({
    byggetype: z.enum(["nybyg", "tilbyg", "ombyg"]).optional(),
    husstandsstoerrelse: z.number().int().optional(),
    voksne: z.number().int().optional(),
    boern: z.number().int().optional(),
    livsfase: z.enum(["ung", "etableret", "senior"]).optional(),
    oensketAreal: z.number().optional(),
    antalEtager: z.union([z.literal(1), z.literal(1.5), z.literal(2), z.literal(3)]).optional(),
    antalSovevaerelser: z.number().int().optional(),
    antalBadevaerelser: z.number().int().optional(),
    hjemmekontor: z.boolean().optional(),
    arkitektoniskStil: z
      .enum(["moderne", "klassisk", "skandinavisk", "industriel", "minimalistisk"])
      .optional(),
    tagform: z.enum(["fladt", "saddeltag", "valm", "ensidig"]).optional(),
    facademateriale: z.enum(["tegl", "trae", "puds", "metal", "kombineret"]).optional(),
    vinduesandel: z.enum(["lille", "mellem", "stor"]).optional(),
    udeomraade: z.enum(["terrasse", "have", "altan", "tagterrasse"]).optional(),
    energiklasse: z.enum(["BR18", "lavenergi", "passiv", "plusenergi"]).optional(),
    varmekilde: z.enum(["varmepumpe", "fjernvarme", "jordvarme", "solvarme"]).optional(),
    solceller: z.boolean().optional(),
    ventilation: z.enum(["naturlig", "mekanisk", "balanceret"]).optional(),
    ladestander: z.boolean().optional(),
    budget: z.enum(["under-3", "3-5", "5-8", "8-12", "over-12"]).optional(),
    inspirationsbilleder: z.array(z.string()).optional(),
    inspirationsbilledePaths: z.array(z.string()).optional(),
    designDroem: z.string().optional(),
    valgteDesignforslag: z.string().optional(),
    genererededDesignforslag: z.array(z.string()).optional(),
  })
  .strict();

const geoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const designPlacementSchema = z
  .object({
    footprintGeojson: geoJsonPolygonSchema.nullable(),
    footprintAreaM2: z.number().nullable(),
    centroid: coordinateSchema.nullable(),
    rotationDeg: z.number(),
    floors: z.number().nullable(),
    heightM: z.number().nullable(),
    minDistanceToBoundaryM: z.number().nullable(),
    outsideParcelAreaM2: z.number(),
    source: z.enum(["user", "generated"]),
  })
  .strict();

const genericJsonObjectSchema = z.record(z.string(), z.unknown());

export const persistedProjectSchema = z.object({
  id: z.string(),
  address_full: z.string().nullable(),
  address_kommune: z.string().nullable(),
  address_matrikel: z.string().nullable(),
  address_bbr: z.string().nullable(),
  address_adresseid: z.string().nullable(),
  address_postnr: z.string().nullable(),
  address_postnrnavn: z.string().nullable(),
  address_koordinater: addressKoordinaterSchema.nullable(),
  address_ejerlavskode: z.number().nullable(),
  address_matrikelnummer: z.string().nullable(),
  compliance_data: restoredComplianceDataSchema.nullable(),
  design_byggeoenske: byggeoenskeSchema.nullable(),
  compliance_done: z.boolean(),
  current_step: z.string(),
  project_data_status: dataStatusMapSchema.nullable(),
  heritage_save_value: z.number().nullable(),
  is_fredet: z.boolean().nullable(),
  grundareal_m2: z.number().nullable(),
  bebygget_areal_m2: z.number().nullable(),
  hard_stop: z.boolean(),
  hard_stop_reason: z.string().nullable(),
  budget_estimate: z.number().nullable(),
  bfe_nr: z.string().nullable(),
  billedanalyse: billedeAnalyseResultatSchema.nullable(),
  design_hus_dna: husDnaSchema.nullable(),
  design_placement: designPlacementSchema.nullable(),
  updated_at: z.string().nullable(),
});

export const existingProjectSnapshotSchema = z.object({
  compliance_data: genericJsonObjectSchema.nullable(),
  address_adresseid: z.string().nullable(),
});
