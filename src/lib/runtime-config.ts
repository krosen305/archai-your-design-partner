import { getEnvOptional } from "@/lib/env";

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

export const runtimeConfig = {
  integrations: {
    gsearch: {
      get endpoint() {
        return (
          getEnvOptional("DATAFORSYNINGEN_GSEARCH_ENDPOINT") ??
          "https://api.dataforsyningen.dk/rest/gsearch/v2.0"
        );
      },
      get resultLimit() {
        return parseIntEnv(getEnvOptional("DATAFORSYNINGEN_GSEARCH_LIMIT"), 5);
      },
    },
    get dataforsyningenToken() {
      return getEnvOptional("DATAFORSYNINGEN_TOKEN") ?? "";
    },
    datafordeler: {
      get darEndpoint() {
        return (
          getEnvOptional("DATAFORDELER_DAR_ENDPOINT") ?? "https://graphql.datafordeler.dk/DAR/v1"
        );
      },
      get bbrEndpoint() {
        return (
          getEnvOptional("DATAFORDELER_BBR_ENDPOINT") ?? "https://graphql.datafordeler.dk/BBR/v2"
        );
      },
      get matEndpoint() {
        return (
          getEnvOptional("DATAFORDELER_MAT_ENDPOINT") ?? "https://graphql.datafordeler.dk/MAT/v2"
        );
      },
      get ebrEndpoint() {
        return (
          getEnvOptional("DATAFORDELER_EBR_ENDPOINT") ?? "https://graphql.datafordeler.dk/EBR/v1"
        );
      },
      get vurEndpoint() {
        return (
          getEnvOptional("DATAFORDELER_VUR_ENDPOINT") ?? "https://graphql.datafordeler.dk/VUR/v1"
        );
      },
    },
  },
  ai: {
    get anthropicApiKey() {
      return getEnvOptional("ANTHROPIC_API_KEY") ?? "";
    },
    get lovableApiKey() {
      return getEnvOptional("LOVABLE_API_KEY") ?? "";
    },
  },
  featureFlags: {
    get tinglysningMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_TINGLYSNING_MOCK"), true);
    },
    get pdfExtractorMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_PDF_EXTRACTOR_MOCK"), false);
    },
    get husDnaMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_HUS_DNA_MOCK"), false);
    },
    get byggeanalyseMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_BYGGEANALYSE_MOCK"), false);
    },
    get fjernvarmeMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_FJERNVARME_MOCK"), false);
    },
    get billedanalyseMock() {
      return parseBooleanEnv(getEnvOptional("FEATURE_BILLEDANALYSE_MOCK"), false);
    },
  },
} as const;
