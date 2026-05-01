/**
 * Tests for MatService (Datafordeler GraphQL v2)
 * Kør med: bun test src/integrations/mat/mat.test.ts
 *
 * MatService laver 2 sekventielle kald:
 *   1. MAT_Ejerlav (ejerlavskode → id_lokalId)
 *   2. MAT_Jordstykke (ejerlavLokalId + matrikelnummer → registreretAreal)
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { MatService } from './client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  apiKey: 'test-api-key',
  endpoint: 'https://graphql.datafordeler.dk/MAT/v2',
};

const EJERLAV_LOKAL_ID = 'mat-ejerlav-0000-0000-000000000001';

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

const ejerlavResponse = (lokalId = EJERLAV_LOKAL_ID, navn = 'Virum By, Virum') => ({
  data: { MAT_Ejerlav: { nodes: [{ id_lokalId: lokalId, ejerlavsnavn: navn }] } },
});

const jordstykkeResponse = (areal: number, matr = '48a') => ({
  data: { MAT_Jordstykke: { nodes: [{ registreretAreal: areal, matrikelnummer: matr }] } },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MatService.getGrundareal', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it('returnerer korrekt grundareal via ejerlav + jordstykke kæde', async () => {
    mockFetch([ejerlavResponse(), jordstykkeResponse(850)]);

    const result = await MatService.getGrundareal(12352, '48a', MOCK_CONFIG);

    expect(result.registreretAreal).toBe(850);
    expect(result.ejerlavLokalId).toBe(EJERLAV_LOKAL_ID);
    expect(result.ejerlavsnavn).toBe('Virum By, Virum');
    expect(result.fejl).toBeNull();
  });

  it('sender POST med apiKey som query-param', async () => {
    const spy = mockFetch([ejerlavResponse(), jordstykkeResponse(500)]);

    await MatService.getGrundareal(12352, '48a', MOCK_CONFIG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('apiKey=test-api-key');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('første query indeholder ejerlavskode som variabel', async () => {
    const spy = mockFetch([ejerlavResponse(), jordstykkeResponse(500)]);

    await MatService.getGrundareal(12352, '48a', MOCK_CONFIG);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables.kode).toBe(12352);
    expect(body.query).toContain('MAT_Ejerlav');
  });

  it('anden query indeholder ejerlavLokalId + matrikelnummer', async () => {
    const spy = mockFetch([ejerlavResponse(), jordstykkeResponse(500)]);

    await MatService.getGrundareal(12352, '48a', MOCK_CONFIG);

    const [, init] = spy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables.ejerlavLokalId).toBe(EJERLAV_LOKAL_ID);
    expect(body.variables.matrikelnummer).toBe('48a');
    expect(body.query).toContain('MAT_Jordstykke');
  });

  it('returnerer fejl når MAT_Ejerlav ikke kendes', async () => {
    mockFetch([
      { data: { MAT_Ejerlav: { nodes: [] } } },
    ]);

    const result = await MatService.getGrundareal(99999, '1a', MOCK_CONFIG);

    expect(result.registreretAreal).toBeNull();
    expect(result.fejl).toContain('MAT_Ejerlav ikke fundet');
  });

  it('returnerer fejl når MAT_Jordstykke ikke kendes', async () => {
    mockFetch([
      ejerlavResponse(),
      { data: { MAT_Jordstykke: { nodes: [] } } },
    ]);

    const result = await MatService.getGrundareal(12352, 'ukendt', MOCK_CONFIG);

    expect(result.registreretAreal).toBeNull();
    expect(result.fejl).toContain('MAT_Jordstykke ikke fundet');
  });

  it('returnerer fejl uden API-kald ved manglende parametre', async () => {
    const result = await MatService.getGrundareal(0, '', MOCK_CONFIG);

    expect(result.registreretAreal).toBeNull();
    expect(result.fejl).toContain('påkrævet');
  });

  it('returnerer fejl ved 401 fra Datafordeler', async () => {
    const mockedFetch = mock(async () => ({
      ok: false,
      status: 401,
      headers: { get: (_: string) => null },
      text: async () => JSON.stringify({ error: 'invalid api key' }),
    }));
    globalThis.fetch = mockedFetch as any;

    const result = await MatService.getGrundareal(12352, '48a', MOCK_CONFIG);

    expect(result.registreretAreal).toBeNull();
    expect(result.fejl).toContain('401');
  });

  it('kaster fejl hvis API-nøgle mangler', async () => {
    await expect(
      MatService.getGrundareal(12352, '48a', { apiKey: '', endpoint: 'x' })
    ).rejects.toThrow('DATAFORDELER_API_KEY');
  });

  it('håndterer areal på store grunde korrekt', async () => {
    mockFetch([ejerlavResponse(), jordstykkeResponse(12500)]);

    const result = await MatService.getGrundareal(12352, '1a', MOCK_CONFIG);
    expect(result.registreretAreal).toBe(12500);
  });
});
