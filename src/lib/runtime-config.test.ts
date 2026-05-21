import { describe, expect, it } from "bun:test";
import { buildRuntimeConfig } from "./runtime-config";

describe("buildRuntimeConfig", () => {
  it("builds typed defaults when env is missing", () => {
    const config = buildRuntimeConfig(() => undefined);

    expect(config.integrations.gsearch.endpoint).toBe(
      "https://api.dataforsyningen.dk/rest/gsearch/v2.0",
    );
    expect(config.integrations.gsearch.resultLimit).toBe(5);
    expect(config.integrations.dataforsyningenToken).toBe("");
    expect(config.integrations.datafordeler.darEndpoint).toBe(
      "https://graphql.datafordeler.dk/DAR/v1",
    );
    expect(config.integrations.datafordeler.bbrEndpoint).toBe(
      "https://graphql.datafordeler.dk/BBR/v2",
    );
    expect(config.integrations.datafordeler.matEndpoint).toBe(
      "https://graphql.datafordeler.dk/MAT/v2",
    );
    expect(config.integrations.datafordeler.ebrEndpoint).toBe(
      "https://graphql.datafordeler.dk/EBR/v1",
    );
    expect(config.integrations.datafordeler.vurEndpoint).toBe(
      "https://graphql.datafordeler.dk/VUR/v1",
    );
    expect(config.featureFlags.tinglysningMock).toBe(true);
    expect(config.featureFlags.pdfExtractorMock).toBe(false);
  });

  it("uses env overrides and parses booleans and limits", () => {
    const env: Record<string, string> = {
      DATAFORSYNINGEN_GSEARCH_ENDPOINT: "https://example.test/gsearch",
      DATAFORSYNINGEN_GSEARCH_LIMIT: "12",
      DATAFORSYNINGEN_TOKEN: "df-token",
      DATAFORDELER_DAR_ENDPOINT: "https://example.test/dar",
      DATAFORDELER_BBR_ENDPOINT: "https://example.test/bbr",
      DATAFORDELER_MAT_ENDPOINT: "https://example.test/mat",
      DATAFORDELER_EBR_ENDPOINT: "https://example.test/ebr",
      DATAFORDELER_VUR_ENDPOINT: "https://example.test/vur",
      ANTHROPIC_API_KEY: "anthropic-key",
      LOVABLE_API_KEY: "lovable-key",
      FEATURE_TINGLYSNING_MOCK: "false",
      FEATURE_PDF_EXTRACTOR_MOCK: "true",
      FEATURE_HUS_DNA_MOCK: "yes",
      FEATURE_BYGGEANALYSE_MOCK: "1",
      FEATURE_FJERNVARME_MOCK: "on",
      FEATURE_BILLEDANALYSE_MOCK: "0",
    };
    let reads = 0;

    const config = buildRuntimeConfig((key) => {
      reads += 1;
      return env[key];
    });

    expect(config.integrations.gsearch.endpoint).toBe("https://example.test/gsearch");
    expect(config.integrations.gsearch.resultLimit).toBe(12);
    expect(config.integrations.dataforsyningenToken).toBe("df-token");
    expect(config.integrations.datafordeler.darEndpoint).toBe("https://example.test/dar");
    expect(config.integrations.datafordeler.bbrEndpoint).toBe("https://example.test/bbr");
    expect(config.integrations.datafordeler.matEndpoint).toBe("https://example.test/mat");
    expect(config.integrations.datafordeler.ebrEndpoint).toBe("https://example.test/ebr");
    expect(config.integrations.datafordeler.vurEndpoint).toBe("https://example.test/vur");
    expect(config.ai.anthropicApiKey).toBe("anthropic-key");
    expect(config.ai.lovableApiKey).toBe("lovable-key");
    expect(config.featureFlags.tinglysningMock).toBe(false);
    expect(config.featureFlags.pdfExtractorMock).toBe(true);
    expect(config.featureFlags.husDnaMock).toBe(true);
    expect(config.featureFlags.byggeanalyseMock).toBe(true);
    expect(config.featureFlags.fjernvarmeMock).toBe(true);
    expect(config.featureFlags.billedanalyseMock).toBe(false);
    expect(reads).toBe(16);
  });
});
