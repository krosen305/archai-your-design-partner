import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock env before importing service
mock.module("@/lib/env", () => ({
  getEnvOptional: (key: string) => {
    if (key === "EMODATA_USERNAME") return "test-user";
    if (key === "EMODATA_PASSWORD") return "test-pass";
    return undefined;
  },
  getEnvRequired: (key: string) => { throw new Error(`Missing: ${key}`); },
  validateEnv: () => {},
}));

const { EnergyLabelService } = await import("@/integrations/energimaerke/client");

const VALID_SOAP_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SearchEnergyLabelBBRResponse xmlns="http://emoweb.dk/EMOData">
      <EnergimaerkeKlasse>C</EnergimaerkeKlasse>
      <GyldigTil>2030-01-01</GyldigTil>
      <Faerdiggoerelsesdato>2023-03-15</Faerdiggoerelsesdato>
      <RapportUrl>https://sparenergi.dk/rapport/abc123</RapportUrl>
      <RapportId>abc123</RapportId>
    </SearchEnergyLabelBBRResponse>
  </soap:Body>
</soap:Envelope>`;

const EXPIRED_SOAP_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SearchEnergyLabelBBRResponse xmlns="http://emoweb.dk/EMOData">
      <EnergimaerkeKlasse>E</EnergimaerkeKlasse>
      <GyldigTil>2015-06-01</GyldigTil>
      <Faerdiggoerelsesdato>2005-06-01</Faerdiggoerelsesdato>
      <RapportUrl></RapportUrl>
      <RapportId>xyz999</RapportId>
    </SearchEnergyLabelBBRResponse>
  </soap:Body>
</soap:Envelope>`;

const NO_HIT_SOAP_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Building not found</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

describe("EnergyLabelService.getLabel", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("returns confirmed ok result with valid label", async () => {
    globalThis.fetch = mock(async () =>
      new Response(VALID_SOAP_RESPONSE, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("building-uuid-123");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.energimaerke_klasse).toBe("C");
    expect(result.data?.gyldig_til).toBe("2030-01-01");
    expect(result.data?.er_udloebet).toBe(false);
    expect(result.data?.match_type).toBe("bbr_id");
  });

  it("marks er_udloebet=true for expired label", async () => {
    globalThis.fetch = mock(async () =>
      new Response(EXPIRED_SOAP_RESPONSE, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("building-uuid-456");

    expect(result.status).toBe("ok");
    expect(result.data?.er_udloebet).toBe(true);
    expect(result.data?.energimaerke_klasse).toBe("E");
  });

  it("returns ok with no_hit on SOAP Fault", async () => {
    globalThis.fetch = mock(async () =>
      new Response(NO_HIT_SOAP_RESPONSE, {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("unknown-building");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data?.match_type).toBe("no_hit");
    expect(result.data?.energimaerke_klasse).toBeNull();
  });

  it("returns error on network failure — does NOT map to no_hit", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("test-uuid");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    expect(result.confidence).toBe("unknown");
  });
});

describe("EnergyLabelService.getLabel without credentials", () => {
  it("returns skipped when EMODATA_USERNAME is not set", async () => {
    // Re-mock env with no credentials
    mock.module("@/lib/env", () => ({
      getEnvOptional: () => undefined,
      getEnvRequired: (key: string) => { throw new Error(`Missing: ${key}`); },
      validateEnv: () => {},
    }));
    const { EnergyLabelService: ServiceNoAuth } = await import(
      "@/integrations/energimaerke/client"
    );

    const result = await ServiceNoAuth.getLabel("any-uuid");

    expect(result.status).toBe("skipped");
    expect(result.data).toBeNull();
  });
});
