import { getEnvOptional } from "@/lib/env";

export type RuntimeConfig = {
  integrations: {
    gsearch: {
      endpoint: string;
      resultLimit: number;
    };
    dataforsyningenToken: string;
    datafordeler: {
      darEndpoint: string;
      bbrEndpoint: string;
      matEndpoint: string;
      ebrEndpoint: string;
      vurEndpoint: string;
    };
  };
  ai: {
    anthropicApiKey: string;
    lovableApiKey: string;
  };
  featureFlags: {
    tinglysningMock: boolean;
    pdfExtractorMock: boolean;
    husDnaMock: boolean;
    byggeanalyseMock: boolean;
    fjernvarmeMock: boolean;
    billedanalyseMock: boolean;
    geusMock: boolean;
    dhmMock: boolean;
  };
};

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildRuntimeConfig(
  readEnv: (key: string) => string | undefined = getEnvOptional,
): RuntimeConfig {
  return {
    integrations: {
      gsearch: {
        endpoint:
          readEnv("DATAFORSYNINGEN_GSEARCH_ENDPOINT") ??
          "https://api.dataforsyningen.dk/rest/gsearch/v2.0",
        resultLimit: parseIntEnv(readEnv("DATAFORSYNINGEN_GSEARCH_LIMIT"), 5),
      },
      dataforsyningenToken: readEnv("DATAFORSYNINGEN_TOKEN") ?? "",
      datafordeler: {
        darEndpoint:
          readEnv("DATAFORDELER_DAR_ENDPOINT") ?? "https://graphql.datafordeler.dk/DAR/v2",
        bbrEndpoint:
          readEnv("DATAFORDELER_BBR_ENDPOINT") ?? "https://graphql.datafordeler.dk/BBR/v2",
        matEndpoint:
          readEnv("DATAFORDELER_MAT_ENDPOINT") ?? "https://graphql.datafordeler.dk/MAT/v2",
        ebrEndpoint:
          readEnv("DATAFORDELER_EBR_ENDPOINT") ?? "https://graphql.datafordeler.dk/EBR/v1",
        vurEndpoint:
          readEnv("DATAFORDELER_VUR_ENDPOINT") ?? "https://graphql.datafordeler.dk/VUR/v1",
      },
    },
    ai: {
      anthropicApiKey: readEnv("ANTHROPIC_API_KEY") ?? "",
      lovableApiKey: readEnv("LOVABLE_API_KEY") ?? "",
    },
    featureFlags: {
      tinglysningMock: parseBooleanEnv(readEnv("FEATURE_TINGLYSNING_MOCK"), true),
      pdfExtractorMock: parseBooleanEnv(readEnv("FEATURE_PDF_EXTRACTOR_MOCK"), false),
      husDnaMock: parseBooleanEnv(readEnv("FEATURE_HUS_DNA_MOCK"), false),
      byggeanalyseMock: parseBooleanEnv(readEnv("FEATURE_BYGGEANALYSE_MOCK"), false),
      fjernvarmeMock: parseBooleanEnv(readEnv("FEATURE_FJERNVARME_MOCK"), false),
      billedanalyseMock: parseBooleanEnv(readEnv("FEATURE_BILLEDANALYSE_MOCK"), false),
      geusMock: parseBooleanEnv(readEnv("FEATURE_GEUS_MOCK"), true),
      dhmMock: parseBooleanEnv(readEnv("FEATURE_DHM_MOCK"), true),
    },
  };
}

export const runtimeConfig = buildRuntimeConfig();
