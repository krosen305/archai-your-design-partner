/**
 * Tests for BbrService (GraphQL-version)
 * Kør med: bun test
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { BbrService } from './client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  apiKey: 'test-api-key',
  endpoint: 'https://graphql.datafordeler.dk/BBR/v1',
};

type MockResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json: any;
};

function mockFetch(responses: MockResponse[]) {
  let callCount = 0;
  const mockedFetch = mock(async (_url: any, _init?: any) => {
    const r = responses[callCount++] ?? { json: { data: {} } };
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? 'OK',
      headers: { get: (_name: string) => null },
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    } as unknown as Response;
  });
  globalThis.fetch = mockedFetch as any;
  return mockedFetch;
}

const MOCK_BYGNING = {
  byg026Opfoerelsesaar: 1992,
  byg021BygningensAnvendelse: '120',
  byg038SamletBygningsareal: 185,
  byg041BebyggetAreal: 120,
  byg054AntalEtager: 1,
};

// Grundareal sendes nu udefra (fra MAT) – ikke fra BBR_Grund.
// Testene bruger grundareal=1000 direkte som parameter hvor relevant.
const GRUNDAREAL = 1000;

const okResponse = (bygning: any[]) => ({
  json: { data: { BBR_Bygning: { nodes: bygning } } },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BbrService.getKompliantData (GraphQL)', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it('sender POST med apiKey som query-param og uden Authorization-header', async () => {
    const fetchSpy = mockFetch([okResponse([MOCK_BYGNING])]);

    await BbrService.getKompliantData(
      '0a3f50a0-4660-32b8-e044-0003ba298018',
      null,
      MOCK_CONFIG
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://graphql.datafordeler.dk/BBR/v1?apiKey=test-api-key'
    );
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    // Datafordeler afviser med DAF-AUTH-0002 hvis vi sender BÅDE
    // query-param og Authorization-header.
    expect(headers['Authorization']).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.variables.id).toBe('0a3f50a0-4660-32b8-e044-0003ba298018');
    expect(body.query).toContain('BBR_Bygning');
  });

  it('beregner bebyggelsesprocent: 120m² / 1000m² = 12.0%', async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData('test-id', GRUNDAREAL, MOCK_CONFIG);

    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBe(1000);
    expect(result.bebyggelsesprocent).toBe(12.0);
    expect(result.beregning_mulig).toBe(true);
    expect(result.fejl).toBeNull();
  });

  it('beregner bebyggelsesprocent: 220m² / 1000m² = 22.0%', async () => {
    mockFetch([okResponse([{ ...MOCK_BYGNING, byg041BebyggetAreal: 220 }])]);

    const result = await BbrService.getKompliantData('test-id', GRUNDAREAL, MOCK_CONFIG);
    expect(result.bebyggelsesprocent).toBe(22.0);
  });

  it('oversætter anvendelseskode 120 til tekst', async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.anvendelse_tekst).toBe('Fritliggende enfamilieshus');
  });

  it('vælger boligbygning frem for garage (anvendelseskode 910)', async () => {
    const garage = { ...MOCK_BYGNING, byg021BygningensAnvendelse: '910' };
    mockFetch([okResponse([garage, MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.anvendelse_tekst).toBe('Fritliggende enfamilieshus');
  });

  it('returnerer beregning_mulig: false ved tomt bygningsarray', async () => {
    mockFetch([okResponse([])]);

    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toBe('Ingen bygning fundet på adressen');
    expect(result.bebyggelsesprocent).toBeNull();
  });

  it('returnerer beregning_mulig: false når grundareal er null', async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    // grundareal=null simulerer at MAT-opslaget fejlede eller data mangler
    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBeNull();
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('Grundareal ikke tilgængeligt');
  });

  it('propagerer GraphQL errors-array som fejl', async () => {
    mockFetch([
      {
        json: {
          errors: [{ message: 'Field "bygning" not found' }],
        },
      },
    ]);

    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('Field "bygning" not found');
  });

  it('returnerer fejl ved 401 fra Datafordeler', async () => {
    mockFetch([
      {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: { error: 'invalid api key' },
      },
    ]);

    const result = await BbrService.getKompliantData('test-id', null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('401');
  });

  it('returnerer fejl ved tomt adgangsadresseid', async () => {
    const result = await BbrService.getKompliantData('', null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('adgangsadresseid er påkrævet');
  });

  it('kaster fejl hvis API-nøgle mangler', async () => {
    // getConfig() kaster *før* try/catch i getKompliantData, så det
    // propagerer som rejected promise.
    await expect(
      BbrService.getKompliantData('test-id', null, { apiKey: '', endpoint: 'x' })
    ).rejects.toThrow('DATAFORDELER_API_KEY');
  });
});
