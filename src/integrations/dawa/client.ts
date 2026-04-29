/**
 * DAWA – Danmarks Adressers Web API
 *
 * KRITISK OPDAGELSE: /adresser/autocomplete returnerer IDs nested under
 * `r.adresse.id` og `r.adresse.adgangsadresseid`, IKKE på top-niveau.
 *
 * Reelt autocomplete-svar:
 * {
 *   "tekst": "Hasselvej 48, 2830 Virum",
 *   "adresse": {
 *     "id": "0a3f50a6-...",           ← adresseid
 *     "adgangsadresseid": "0a3f507d-...",
 *     "kommunekode": "0173",
 *     "postnr": "2830",
 *     "postnrnavn": "Virum",
 *     "x": 12.48,
 *     "y": 55.79
 *   }
 * }
 */

// API-base – brug api.dataforsyningen.dk (matchers href i DAWA-svaret)
const BASE_URL = 'https://api.dataforsyningen.dk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DawaSuggestion = {
  adresseid: string;
  adgangsadresseid: string;
  tekst: string;
  // Data tilgængeligt direkte fra autocomplete (ingen ekstra kald nødvendigt)
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  koordinater: { lat: number; lng: number };
};

export type DawaAddressDetails = {
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  kommunenavn: string;
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
};

// ---------------------------------------------------------------------------
// Intern hjælp
// ---------------------------------------------------------------------------

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
    throw new Error(`DAWA ${res.status} for ${url}`);
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
   * Returnerer adresseforslag (max 5) med korrekt nested parsing.
   */
  static async getSuggestions(
    query: string,
    signal?: AbortSignal
  ): Promise<DawaSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const url = `${BASE_URL}/adresser/autocomplete?q=${encodeURIComponent(q)}&per_side=5`;
    const raw = await fetchJson<
      {
        tekst: string;
        // IDs er nested under "adresse" – IKKE på top-niveau!
        adresse: {
          id: string;
          adgangsadresseid: string;
          postnr: string;
          postnrnavn: string;
          kommunekode: string;
          x: number; // WGS84 længdegrad
          y: number; // WGS84 breddegrad
        };
      }[]
    >(url, signal);

    return raw
      .filter((r) => r.adresse?.id && r.adresse?.adgangsadresseid)
      .map((r) => ({
        adresseid: r.adresse.id,
        adgangsadresseid: r.adresse.adgangsadresseid,
        tekst: r.tekst,
        postnr: r.adresse.postnr ?? '',
        postnrnavn: r.adresse.postnrnavn ?? '',
        kommunekode: r.adresse.kommunekode ?? '',
        koordinater: {
          lat: r.adresse.y,
          lng: r.adresse.x,
        },
      }));
  }

  /**
   * Henter fulde adressedetaljer: kommunenavn + matrikel.
   * Alt andet (postnr, koordinater, adgangsadresseid) kommer fra suggestion.
   */
  static async getAddressDetails(
    adresseid: string,
    signal?: AbortSignal
  ): Promise<DawaAddressDetails> {
    const id = adresseid.trim();
    if (!id) throw new Error('DAWA: adresseid er påkrævet');

    // Kalder det præcise endpoint som DAWA selv angiver i href-feltet
    const url = `${BASE_URL}/adresser/${encodeURIComponent(id)}`;
    const raw = await fetchJson<{
      id: string;
      adressebetegnelse: string;
      adgangsadresseid: string;
      postnr: string;
      postnrnavn: string;
      kommune: { kode: string; navn: string };
      x: number;
      y: number;
      // Matrikel kan sidde direkte eller nested
      matrikel?: { ejerlavnavn: string; matrikelnr: string };
      adgangsadresse?: {
        matrikel?: { ejerlavnavn: string; matrikelnr: string };
      };
    }>(url, signal);

    // Matrikel kan sidde direkte eller under adgangsadresse
    const matrikelData = raw.matrikel ?? raw.adgangsadresse?.matrikel;
    const matrikel = matrikelData
      ? `${matrikelData.matrikelnr} ${matrikelData.ejerlavnavn}`.trim()
      : null;

    return {
      adresse: raw.adressebetegnelse,
      postnr: raw.postnr,
      postnrnavn: raw.postnrnavn,
      kommunekode: raw.kommune?.kode ?? '',
      kommunenavn: (raw.kommune?.navn ?? 'Ukendt').trim(),
      matrikel,
      adgangsadresseid: raw.adgangsadresseid,
      koordinater: { lat: raw.y, lng: raw.x },
      bbrId: null,
    };
  }
}