/**
 * DAWA – Danmarks Adressers Web API
 * Docs: https://dawadocs.dataforsyningen.dk
 *
 * Denne fil er den eneste DAWA-klient i projektet.
 * SLET: src/integrations/dawa/dawa-client.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DawaSuggestion = {
  id: string;          // adresseid – brug til getAddressDetails()
  tekst: string;       // "Hasselvej 48, 2800 Kongens Lyngby"
  forslagstekst: string;
};

export type DawaAddressDetails = {
  adresse: string;             // "Hasselvej 48, 2800 Kongens Lyngby"
  postnr: string;              // "2800"
  postnrnavn: string;          // "Kongens Lyngby"
  kommunekode: string;         // "0173"
  kommunenavn: string;         // "Lyngby-Taarbæk"
  matrikel: string | null;     // "14a Lyngby" eller null
  adgangsadresseid: string;    // VIGTIGT – bruges til BBR-opslag
  koordinater: {
    lat: number;               // WGS84 breddegrad
    lng: number;               // WGS84 længdegrad
  };
  bbrId: string | null;        // kvhx hvis tilgængeligt
};

// ---------------------------------------------------------------------------
// Intern hjælpefunktion
// ---------------------------------------------------------------------------

const BASE_URL = 'https://dawa.aws.dk';

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (e) {
    throw new Error(`DAWA netværksfejl: ${(e as Error).message ?? String(e)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `DAWA fejl (${res.status} ${res.statusText})${text ? `: ${text}` : ''}`
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('DAWA returnerede ugyldig JSON');
  }
}

// ---------------------------------------------------------------------------
// DawaService
// ---------------------------------------------------------------------------

export class DawaService {
  /**
   * Returnerer adresseforslag baseret på fritekst.
   * Bruges til autocomplete-søgefeltet.
   */
  static async getSuggestions(
    query: string,
    signal?: AbortSignal
  ): Promise<DawaSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const url = `${BASE_URL}/adresser/autocomplete?q=${encodeURIComponent(q)}&per_side=8`;
    const raw = await fetchJson<
      {
        tekst: string;
        forslagstekst: string;
        adgangsadresseid: string;
        adresseid: string;
      }[]
    >(url, signal);

    return raw.map((r) => ({
      id: r.adresseid || r.adgangsadresseid,
      tekst: r.tekst,
      forslagstekst: r.forslagstekst,
    }));
  }

  /**
   * Returnerer fulde adressedetaljer inkl. koordinater og adgangsadresseid.
   * Kald denne når brugeren vælger en adresse fra forslagslisten.
   */
  static async getAddressDetails(
    adresseId: string,
    signal?: AbortSignal
  ): Promise<DawaAddressDetails> {
    const id = adresseId.trim();
    if (!id) throw new Error('DAWA: adresseId er påkrævet');

    const url = `${BASE_URL}/adresser/${encodeURIComponent(id)}`;
    const raw = await fetchJson<{
      id: string;
      adressebetegnelse: string;
      adgangsadresseid: string;
      postnr: string;
      postnrnavn: string;
      kommune: { kode: string; navn: string };
      x: number; // WGS84 længdegrad
      y: number; // WGS84 breddegrad
      matrikel?: { ejerlavnavn: string; matrikelnr: string };
      bbr?: { kvhx?: string | null; kvhxid?: string | null };
    }>(url, signal);

    const matrikel = raw.matrikel
      ? `${raw.matrikel.matrikelnr} ${raw.matrikel.ejerlavnavn}`.trim()
      : null;

    const bbrId = raw.bbr?.kvhx ?? raw.bbr?.kvhxid ?? null;

    return {
      adresse: raw.adressebetegnelse,
      postnr: raw.postnr,
      postnrnavn: raw.postnrnavn,
      kommunekode: raw.kommune?.kode ?? '',
      kommunenavn: (raw.kommune?.navn ?? 'Ukendt').trim(),
      matrikel,
      adgangsadresseid: raw.adgangsadresseid,
      koordinater: {
        lat: raw.y,
        lng: raw.x,
      },
      bbrId,
    };
  }
}