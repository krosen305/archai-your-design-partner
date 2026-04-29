/**
 * Tests for BbrService
 * Kør med: bun test
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { BbrService } from './client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(responses: any[]) {
  let callCount = 0;
  const mockedFetch = mock(async (_url: any) => {
    const data = responses[callCount++] ?? [];
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as Response;
  });
  globalThis.fetch = mockedFetch as any;
  return mockedFetch;
}

const MOCK_CONFIG = {
  baseUrl: 'https://services.datafordeler.dk',
  username: 'testuser',
  password: 'testpass',
};

const MOCK_BYGNING = {
  byg026Opførelsesår: 1992,
  byg021BygningensAnvendelse: '120',
  byg039BygningensSamledeAreal: 185,
  byg041BebyggetAreal: 120,
  byg054AntalEtager: 1,
  byg032YdervæggensMateriale: '1',
  byg033Tagdækningsmateriale: '3',
  byg056Varmeinstallation: '1',
};

const MOCK_GRUND = {
  gru010Matrikelnummer: '14a',
  jordstykke: [{ jse030Areal: 1000 }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BbrService.getKompliantData', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it('konstruerer korrekt URL med adgangsadresseid', async () => {
    const fetchSpy = mockFetch([[MOCK_BYGNING], [MOCK_GRUND]]);

    await BbrService.getKompliantData(
      '0a3f50a0-4660-32b8-e044-0003ba298018',
      MOCK_CONFIG
    );

    const bygningUrl = (fetchSpy.mock.calls[0] as any[])[0] as string;
    expect(bygningUrl).toContain('/BBR/BBRPublic/1/rest/bygning');
    expect(bygningUrl).toContain('AdresseIdentificerer=0a3f50a0-4660-32b8-e044-0003ba298018');
    expect(bygningUrl).toContain('username=testuser');
    expect(bygningUrl).toContain('Format=JSON');

    const grundUrl = (fetchSpy.mock.calls[1] as any[])[0] as string;
    expect(grundUrl).toContain('/BBR/BBRPublic/1/rest/grund');
  });

  it('beregner bebyggelsesprocent: 120m² / 1000m² = 12.0%', async () => {
    mockFetch([[MOCK_BYGNING], [MOCK_GRUND]]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);

    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBe(1000);
    expect(result.bebyggelsesprocent).toBe(12.0);
    expect(result.beregning_mulig).toBe(true);
    expect(result.fejl).toBeNull();
  });

  it('beregner bebyggelsesprocent: 220m² / 1000m² = 22.0%', async () => {
    mockFetch([
      [{ ...MOCK_BYGNING, byg041BebyggetAreal: 220 }],
      [MOCK_GRUND],
    ]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);
    expect(result.bebyggelsesprocent).toBe(22.0);
  });

  it('oversætter anvendelseskode 120 til tekst', async () => {
    mockFetch([[MOCK_BYGNING], [MOCK_GRUND]]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);
    expect(result.anvendelseskode).toBe('120');
    expect(result.anvendelse_tekst).toBe('Fritliggende enfamilieshus');
  });

  it('returnerer beregning_mulig: false ved tomt bygningsarray', async () => {
    mockFetch([[], []]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toBe('Ingen bygning fundet på adressen');
    expect(result.bebyggelsesprocent).toBeNull();
  });

  it('returnerer fejl hvis grundareal mangler', async () => {
    mockFetch([[MOCK_BYGNING], [{ gru010Matrikelnummer: '14a' }]]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);
    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBeNull();
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('Grundareal ikke tilgængeligt');
  });

  it('summerer areal fra flere jordstykker', async () => {
    mockFetch([
      [MOCK_BYGNING],
      [{ jordstykke: [{ jse030Areal: 600 }, { jse030Areal: 400 }] }],
    ]);

    const result = await BbrService.getKompliantData('test-id', MOCK_CONFIG);
    expect(result.grundareal).toBe(1000);
    expect(result.bebyggelsesprocent).toBe(12.0);
  });

  it('kaster fejl hvis credentials mangler', async () => {
    expect(
      BbrService.getKompliantData('test-id', {
        baseUrl: 'https://services.datafordeler.dk',
        username: '',
        password: '',
      })
    ).rejects.toThrow('Manglende DATAFORDELER_USERNAME/PASSWORD');
  });

  it('returnerer fejl ved tomt adgangsadresseid', async () => {
    const result = await BbrService.getKompliantData('', MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('adgangsadresseid er påkrævet');
  });
});