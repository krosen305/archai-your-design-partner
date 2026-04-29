/**
 * DAWA – Danmarks Adressers Web API
 *
 * ⚠️  UDFASES 17. AUGUST 2026 – se DAWA_MIGRATION.md for plan.
 *
 * Migreringsstatus:
 *   getSuggestions()     → FASE 3: erstattes af Adressevælger-widget eller DAR-søgning
 *   getAddressDetails()  → FASE 2: erstattes af dar/client.ts (DAR GraphQL)
 *                          grundareal-kald (kald C+D) → FASE 1: erstattes af mat/client.ts
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
  // Jordstykkets registrerede areal i m² – bruges til bebyggelsesprocent i BBR-klienten
  grundareal: number | null;
  // Til MAT-opslag (fase 1): ejerlav-kode og matrikelnummer separat
  // Fase 1: disse sendes til MatService.getGrundareal() i stedet for at følge jordstykke.href
  ejerlavskode: number | null;
  matrikelnummer: string | null;
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
   * Henter fulde adressedetaljer: kommunenavn + matrikel + grundareal.
   *
   * ⚠️  FASE 1: grundareal hentes stadig via DAWA jordstykke-href.
   *     Migrér til MatService.getGrundareal() når mat/client.ts er testet.
   * ⚠️  FASE 2: Hele denne metode erstattes af DarService.getAddressDetails().
   */
  static async getAddressDetails(
    adresseid: string,
    signal?: AbortSignal
  ): Promise<DawaAddressDetails> {
    const id = adresseid.trim();
    if (!id) throw new Error('DAWA: adresseid er påkrævet');

    // Primært kald: adresse-detaljer (kommunenavn, matrikel, adgangsadresseid)
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
      matrikel?: { ejerlavnavn: string; matrikelnr: string };
      adgangsadresse?: {
        id?: string; // adgangsadresseid – primær kilde i nestet format
        matrikel?: { ejerlavnavn: string; matrikelnr: string };
        ejerlav?: { kode: number; href?: string };
        matrikelnr?: string;
      };
    }>(url, signal);

    // Matrikel kan sidde direkte eller under adgangsadresse
    const matrikelData = raw.matrikel ?? raw.adgangsadresse?.matrikel;
    const matrikel = matrikelData
      ? `${matrikelData.matrikelnr} ${matrikelData.ejerlavnavn}`.trim()
      : null;

    // I DAWA's nestet format sidder adgangsadresseid under adgangsadresse.id, ikke på top-niveau
    const adgangsadresseid = raw.adgangsadresseid || raw.adgangsadresse?.id || '';

    // Sekundært kald: adgangsadresse-endpoint har ejerlav.kode, matrikelnr, og jordstykke.href
    let grundareal: number | null = null;
    let ejerlavskode: number | null = null;
    let matrikelnummer: string | null = null;

    try {
      const adgangsurl = `${BASE_URL}/adgangsadresser/${encodeURIComponent(adgangsadresseid)}`;
      const adgang = await fetchJson<{
        ejerlav?: { kode: number; href?: string };
        matrikelnr?: string;
        jordstykke?: { href?: string };
      }>(adgangsurl, signal);

      // Udpak ejerlav-kode og matrikelnummer til brug i MAT-opslag (fase 1)
      ejerlavskode = adgang.ejerlav?.kode ?? null;
      matrikelnummer = adgang.matrikelnr ?? null;

      // DAWA returnerer jordstykke som en reference med href – registreretAreal
      // kræver et ekstra kald til jordstykke-endpointet.
      // TODO (fase 1): erstat dette med MatService.getGrundareal(ejerlavskode, matrikelnummer)
      const jordstykkeHref = adgang.jordstykke?.href;
      if (jordstykkeHref) {
        const jordstykke = await fetchJson<{ registreretAreal?: number }>(
          jordstykkeHref,
          signal
        );
        grundareal = jordstykke.registreretAreal ?? null;
      }
    } catch (e) {
      console.warn('[DAWA] adgangsadresse-kald fejlede:', (e as Error).message);
    }

    return {
      adresse: raw.adressebetegnelse,
      postnr: raw.postnr,
      postnrnavn: raw.postnrnavn,
      kommunekode: raw.kommune?.kode ?? '',
      kommunenavn: (raw.kommune?.navn ?? 'Ukendt').trim(),
      matrikel,
      adgangsadresseid,
      koordinater: { lat: raw.y, lng: raw.x },
      bbrId: null,
      grundareal,
      ejerlavskode,
      matrikelnummer,
    };
  }
}