/**
 * Tests for DarService (GraphQL + MAT lookup)
 * Kør med: bun test src/integrations/dar/dar.test.ts
 *
 * DarService kalder 4 faser:
 *   1. DAR_Adresse  (1 kald)
 *   2. DAR_Husnummer (1 kald)
 *   3. DAR_Postnummer + DAR_Adressepunkt + MAT_Jordstykke (3 parallelle kald)
 *   4. MAT_Ejerlav  (1 kald, betinget af jordstykkeFK)
 * Total: 6 fetch-kald for en fuld adresse med matrikeldata.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { DarService } from "./client";

// ---------------------------------------------------------------------------
// Test-IDs
// ---------------------------------------------------------------------------

const DAR_ADRESSE_ID = "aaaa0001-0000-0000-0000-000000000001";
const HUSNUMMER_ID = "aaaa0002-0000-0000-0000-000000000002";
const ADGANGSPUNKT_ID = "aaaa0003-0000-0000-0000-000000000003";
const POSTNUMMER_ID = "aaaa0004-0000-0000-0000-000000000004";
const JORDSTYKKE_ID = "aaaa0005-0000-0000-0000-000000000005";
const EJERLAV_ID = "aaaa0006-0000-0000-0000-000000000006";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  apiKey: "test-api-key",
  endpoint: "https://graphql.datafordeler.dk/DAR/v1",
};

type MockJson = Record<string, unknown>;

function mockFetch(responses: MockJson[]) {
  let callCount = 0;
  const mockedFetch = mock(async (_url: unknown, _init?: unknown) => {
    const body = responses[callCount++] ?? { data: {} };
    return {
      ok: true,
      status: 200,
      headers: { get: (_: string) => null },
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  globalThis.fetch = mockedFetch as any;
  return mockedFetch;
}

// WKT-koordinat i EPSG:25832 (svarende til ca. Virum)
const WKT = "POINT(723000.00 6176000.00)";

// Kanoniske mock-svar i kalde-rækkefølge for en fuld adresse
function fullAddressResponses() {
  return [
    // 1: DAR_Adresse
    {
      data: {
        DAR_Adresse: {
          nodes: [
            {
              id_lokalId: DAR_ADRESSE_ID,
              adressebetegnelse: "Hasselvej 48, 2830 Virum",
              husnummer: HUSNUMMER_ID,
              etagebetegnelse: null,
              doerbetegnelse: null,
              status: "Gældende",
            },
          ],
        },
      },
    },
    // 2: DAR_Husnummer
    {
      data: {
        DAR_Husnummer: {
          nodes: [
            {
              id_lokalId: HUSNUMMER_ID,
              adgangsadressebetegnelse: "Hasselvej 48",
              husnummertekst: "48",
              adgangspunkt: ADGANGSPUNKT_ID,
              postnummer: POSTNUMMER_ID,
              kommuneinddeling: "kom-id",
              navngivenVej: "vej-id",
              jordstykke: JORDSTYKKE_ID,
              status: "Gældende",
            },
          ],
        },
      },
    },
    // 3a: DAR_Postnummer  (parallel)
    { data: { DAR_Postnummer: { nodes: [{ postnr: "2830", navn: "Virum" }] } } },
    // 3b: DAR_Adressepunkt (parallel)
    { data: { DAR_Adressepunkt: { nodes: [{ position: { wkt: WKT } }] } } },
    // 3c: MAT_Jordstykke  (parallel)
    {
      data: {
        MAT_Jordstykke: {
          nodes: [
            {
              matrikelnummer: "48a",
              ejerlavLokalId: EJERLAV_ID,
              registreretAreal: 850,
            },
          ],
        },
      },
    },
    // 4: MAT_Ejerlav
    {
      data: { MAT_Ejerlav: { nodes: [{ ejerlavskode: 12352, ejerlavsnavn: "Virum By, Virum" }] } },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DarService.getAddressDetails", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returnerer fuld adressedetalje inkl. koordinater og matrikeldata", async () => {
    mockFetch(fullAddressResponses());

    const result = await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);

    expect(result.adresse).toBe("Hasselvej 48, 2830 Virum");
    expect(result.postnr).toBe("2830");
    expect(result.postnrnavn).toBe("Virum");
    expect(result.adgangsadresseid).toBe(HUSNUMMER_ID);
    expect(result.matrikelnummer).toBe("48a");
    expect(result.matrikel).toBe("48a");
    expect(result.ejerlavskode).toBe(12352);
    expect(result.koordinater.lat).toBeGreaterThan(55);
    expect(result.koordinater.lat).toBeLessThan(57);
    expect(result.koordinater.lng).toBeGreaterThan(11);
    expect(result.koordinater.lng).toBeLessThan(13);
  });

  it("sender POST med apiKey som query-param og uden Authorization-header", async () => {
    const spy = mockFetch(fullAddressResponses());

    await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("apiKey=test-api-key");
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect(init.method).toBe("POST");
  });

  it("foretager 6 fetch-kald for en fuld adresse med matrikeldata", async () => {
    const spy = mockFetch(fullAddressResponses());
    await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);
    expect(spy.mock.calls.length).toBe(6);
  });

  it("returnerer null-koordinater når adressepunkt mangler WKT", async () => {
    const responses = fullAddressResponses();
    // Erstat adressepunkt-svar med tom nodes
    responses[3] = { data: { DAR_Adressepunkt: { nodes: [] } } };
    mockFetch(responses);

    const result = await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);
    expect(result.koordinater).toEqual({ lat: 0, lng: 0 });
  });

  it("returnerer null ejerlavskode + matrikelnummer når jordstykke mangler", async () => {
    const responses = fullAddressResponses();
    // Erstat husnummer-svar uden jordstykke-FK
    responses[1] = {
      data: {
        DAR_Husnummer: {
          nodes: [
            {
              id_lokalId: HUSNUMMER_ID,
              adgangsadressebetegnelse: "Hasselvej 48",
              husnummertekst: "48",
              adgangspunkt: ADGANGSPUNKT_ID,
              postnummer: POSTNUMMER_ID,
              kommuneinddeling: "kom-id",
              navngivenVej: "vej-id",
              jordstykke: null,
              status: "Gældende",
            },
          ],
        },
      },
    };
    // Fjern de 2 MAT-kald (de foretages ikke når jordstykke er null)
    mockFetch(responses.slice(0, 4));

    const result = await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);
    expect(result.ejerlavskode).toBeNull();
    expect(result.matrikelnummer).toBeNull();
  });

  it("returnerer null ejerlavskode hvis MAT_Ejerlav fejler", async () => {
    const responses = fullAddressResponses();
    // Erstat MAT_Ejerlav-svar med GraphQL-fejl
    responses[5] = { errors: [{ message: "MAT_Ejerlav ikke fundet" }] };
    mockFetch(responses);

    const result = await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);
    // Fejl i MAT_Ejerlav er graceful — ejerlavskode forbliver null
    expect(result.ejerlavskode).toBeNull();
    // Men matrikelnummer fra MAT_Jordstykke er stadig populeret
    expect(result.matrikelnummer).toBe("48a");
  });

  it("kaster fejl hvis DAR_Adresse ikke findes", async () => {
    mockFetch([{ data: { DAR_Adresse: { nodes: [] } } }]);

    await expect(DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG)).rejects.toThrow(
      "DAR_Adresse ikke fundet",
    );
  });

  it("kaster fejl ved tomt darAdresseLokalId", async () => {
    mockFetch([]);
    await expect(DarService.getAddressDetails("", MOCK_CONFIG)).rejects.toThrow(
      "darAdresseLokalId er påkrævet",
    );
  });

  it("kaster fejl hvis API-nøgle mangler", async () => {
    await expect(
      DarService.getAddressDetails(DAR_ADRESSE_ID, { apiKey: "", endpoint: "x" }),
    ).rejects.toThrow("DATAFORDELER_API_KEY");
  });

  it("sender husnummer-FK i anden query", async () => {
    const spy = mockFetch(fullAddressResponses());
    await DarService.getAddressDetails(DAR_ADRESSE_ID, MOCK_CONFIG);

    // Kald 2 skal indeholde husnummer-ID'et som variabel
    const [, init] = spy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables.id).toBe(HUSNUMMER_ID);
    expect(body.query).toContain("DAR_Husnummer");
  });
});
