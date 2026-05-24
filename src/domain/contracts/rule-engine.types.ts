export type RuleEngineBbrData = {
  grundareal: number | null;
  bebygget_areal: number | null;
  samlet_areal: number | null;
  antal_etager: number | null;
  byggeaar: string | null;
  anvendelseskode: string | null;
  anvendelse_tekst: string | null;
  bebyggelsesprocent: number | null;
  beregning_mulig: boolean;
  fejl: string | null;
  varmeinstallation: string | null;
  opvarmningsmiddel: string | null;
  ydervaegs_materiale: string | null;
  tagdaekning: string | null;
  fredet: boolean | null;
  mat_strandbeskyttelse: boolean | null;
  mat_fredskov: boolean | null;
  mat_klitfredning: boolean | null;
  bygning_lokal_id: string | null;
  fbb_reference: string | null;
  alle_bygning_lokal_ids: string[];
  jordstykke_lokal_id: string | null;
  canonical_building_lokal_id: string | null;
  canonical_selection_reason: string | null;
  canonical_candidates_count: number;
  aggregated_bebygget_areal_all_primary: number | null;
  bygning_samlet_boligareal: number | null;
};

export type RuleEngineFbbResult = {
  fbb_bygninger: Array<{
    bygningsid: number;
    bygningsnummer: number;
    bevaringsvaerdi: number;
    fredningsstatus: string | null;
    fredet: boolean;
  }>;
  fbb_bedste_bygning: {
    bygningsid: number;
    bevaringsvaerdi: number;
    fredningsstatus: string | null;
  } | null;
  fbb_er_fredet: boolean;
  kilde?: "fbb-wfs" | "adresse-fallback" | "fejl" | "ingen-ids";
};

export type RuleEngineLokalplan = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  datoVedtaget: string | null;
  datoIkraft: string | null;
  plandokumentLink: string | null;
  plantype: string | null;
  status: string | null;
  anvgen: number | null;
  anvendelseGenerel: string | null;
};

export type RuleEngineKommuneplanramme = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  bebygpct: number | null;
  maxetager: number | null;
  maxbygnhjd: number | null;
  anvgen: number | null;
  anvendelseGenerel: string | null;
  fremtidigzonestatus: string | null;
  sforhold: string | null;
  planstatus: string | null;
  datoIkraft: string | null;
  plandokumentLink: string | null;
};

export type RuleEngineLokalplanExtract = {
  maxBebyggelsespct: number | null;
  maxEtager: number | null;
  byggelinjer: string | null;
  tagform: string | null;
  materialer: string[];
  specialBestemmelser: string[];
  kilde: "mock" | "anthropic";
};

export type RuleEngineNaturbeskyttelsesResultat = {
  strandbeskyttelse: boolean;
  skovbyggelinje: boolean;
  aabeskyttelse: boolean;
  soebeskyttelse: boolean;
  klitfredning: boolean;
  kirkebyggelinje: boolean;
};

export type RuleEngineGeusRiskData = {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  groundwaterDataSource: string | null;
  groundwaterDepthWinterM: number | null;
  groundwaterDepthSummerM: number | null;
  groundwaterModelUncertaintyM: number | null;
  geoteknikJordart: string | null;
  kilde: "geus" | "mock";
};

export type RuleEngineServitut = {
  dokumentId: string;
  type: "brugsret" | "vejret" | "byggelinje" | "højdebegrænsning" | "andet";
  tekst: string;
  tinglystDato: string;
  kritisk: boolean;
};

export type RuleEngineTinglysningResult = {
  servitutter: RuleEngineServitut[];
  pant: number;
  kilde: "tinglysning" | "mock";
};

export type RuleEngineTerrainData = {
  minElevationM: number;
  maxElevationM: number;
  avgElevationM: number;
  slopePercent: number;
  lowPointM: number;
  bluespotRisk: boolean | null;
  northOrientation: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  kotepunkter: Array<{ x: number; y: number; z: number }>;
  kilde: "dhm" | "mock";
};

export type RuleEngineDkJordResultat = {
  v1Kortlagt: boolean | null;
  v2Kortlagt: boolean | null;
  olietank: {
    eksisterer: boolean | null;
    driftsstatus: string | null;
  };
  omraadeklassificering: string | null;
  nuancering: string | null;
  lokalitetsId: string | null;
  kilde: "dkjord" | "mock";
};

export type RuleEnginePlandataContext = {
  zoneType: "byzone" | "landzone" | "sommerhusomraade" | "unknown" | null;
  futureZoneType: "byzone" | "landzone" | "sommerhusomraade" | "unknown" | null;
  landzonePermitRequired: boolean | null;
  lokalplanDelomraadeId: string | null;
  lokalplanByggefeltPresent: boolean | null;
  withinBuildingField: boolean | null;
  buildingFieldSourceId: string | null;
  wastewaterPlanStatus: string | null;
  sewerAreaType: string | null;
  sourceLokalplanId: string | null;
  sourceKommuneplanId: string | null;
  zoneSourcePlanId: string | null;
  wastewaterSourceId: string | null;
};
