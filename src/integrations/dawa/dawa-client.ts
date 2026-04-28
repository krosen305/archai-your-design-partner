/**
 * Typedef for et adresseforslag fra DAWA-autocomplete endpointet.
 * Dokumentation: https://api.dataforsyningen.dk/autocomplete/adresse
 */
export type DawaAdresseSuggestion = {
  tekst: string;                     // Fulde tekst-søgeresultat
  forslagstekst: string;             // Søgeforslagstekst (præsentation)
  adgangsadresseid: string;          // ID til adgangsadresse (kan bruges til opslag af detaljer)
  adresseid: string;                 // ID til adresse (fysisk adresse)
};

/**
 * Detaljeret DAWA-adresse vha. /adresser/{id}
 * Inkluderer bl.a. BBR-Id (kvhx) i BBR reference (hvis tilgængelig)
 * Dokumentation: https://api.dataforsyningen.dk/adresser/{id}
 */
export type DawaAdresseDetaljer = {
  id: string;
  adressebetegnelse: string;
  adgangsadresseid: string;
  status: number;
  vejstykke: {
    navn: string;
    kode: string;
  };
  husnr: string;
  etage: string | null;
  dør: string | null;
  supplerendebynavn: string | null;
  postnr: string;
  postnrnavn: string;
  kommune: {
    kode: string;
    navn: string;
  };
  matrikel?: {
    ejerlavnavn: string;
    matrikelnr: string;
  };
  bbr?: {
    kvhxid?: string;  // BBR-id, kan være null/undefined
  };
  x: number;
  y: number;
  stormodtagerpostnr?: string | null;
};

/**
 * Henter adresseforslag fra 'https://dawa.aws.dk/adresser/autocomplete' baseret på tekstsøgning.
 * @param query Søgetekst
 * @param options Mulighed for at angive signal og baseUrl (bruges sjældent)
 */
export async function fetchDawaAdresseForslag(
  query: string,
  options?: { signal?: AbortSignal; baseUrl?: string }
): Promise<DawaAdresseSuggestion[]> {
  const baseUrl = options?.baseUrl?.replace(/\/+$/, '') || 'https://dawa.aws.dk';
  const url = `${baseUrl}/adresser/autocomplete?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error(`DAWA autocomplete fejl: ${res.status} (${res.statusText})`);
  }
  const data = (await res.json()) as { tekst: string; forslagstekst: string; adgangsadresseid: string; adresseid: string }[];
  return data.map(forslag => ({
    tekst: forslag.tekst,
    forslagstekst: forslag.forslagstekst,
    adgangsadresseid: forslag.adgangsadresseid,
    adresseid: forslag.adresseid,
  }));
}

/**
 * Slår detaljer op på en adresse ud fra adresse-id.
 * @param adresseId DAWA adresse-id (fx fra adresseforslag)
 * @param options Mulighed for at angive signal og baseUrl (bruges sjældent)
 */
export async function fetchDawaAdresseDetaljer(
  adresseId: string,
  options?: { signal?: AbortSignal; baseUrl?: string }
): Promise<DawaAdresseDetaljer> {
  const baseUrl = options?.baseUrl?.replace(/\/+$/, '') || 'https://dawa.aws.dk';
  const url = `${baseUrl}/adresser/${encodeURIComponent(adresseId)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error(`DAWA adresseopslag fejl: ${res.status} (${res.statusText})`);
  }
  return await res.json() as DawaAdresseDetaljer;
}

export type DawaAdresse = {
  id: string;
  adressebetegnelse: string;
  adgangsadresseid: string;
  status?: number;
  vejstykke?: {
    navn: string;
    kode: string;
  };
  husnr?: string;
  etage?: string | null;
  dør?: string | null;
  supplerendebynavn?: string | null;
  postnr?: string;
  postnrnavn?: string;
  kommunekode?: string;
  x?: number;
  y?: number;
};

export type DawaClientOptions = {
  /**
   * Defaults to https://api.dataforsyningen.dk
   * Can be overridden via env: VITE_DAWA_BASE_URL or DAWA_BASE_URL
   */
  baseUrl?: string;
  /**
   * Pass through AbortSignal to cancel requests (e.g. on debounced search)
   */
  signal?: AbortSignal;
};

function getDawaBaseUrl(explicit?: string) {
  const fromEnv =
    (import.meta as any)?.env?.VITE_DAWA_BASE_URL ||
    (process as any)?.env?.DAWA_BASE_URL;

  const baseUrl = (explicit || fromEnv || 'https://api.dataforsyningen.dk').toString().replace(/\/+$/, '');
  return baseUrl;
}

async function fetchJson<T>(url: string, opts?: { signal?: AbortSignal }) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DAWA request failed (${res.status} ${res.statusText})${text ? `: ${text}` : ''}`);
  }

  return (await res.json()) as T;
}

function toQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Free-text address suggestions (best for autocomplete).
 * Docs: https://dawadocs.dataforsyningen.dk/dok/api/adresse
 */
export async function dawaSuggestAdresser(
  q: string,
  options?: DawaClientOptions & {
    /**
     * Max number of suggestions (DAWA uses "maxantal")
     */
    maxAntal?: number;
  }
): Promise<DawaAdresseSuggestion[]> {
  const baseUrl = getDawaBaseUrl(options?.baseUrl);
  const qs = toQueryString({
    q,
    type: 'adresse',
    maxantal: options?.maxAntal ?? 10,
  });
  return fetchJson<DawaAdresseSuggestion[]>(`${baseUrl}/autocomplete${qs}`, { signal: options?.signal });
}

/**
 * Lookup a full address by DAWA address id.
 * Endpoint: /adresser/{id}
 */
export async function dawaGetAdresseById(
  adresseId: string,
  options?: DawaClientOptions
): Promise<DawaAdresse> {
  const baseUrl = getDawaBaseUrl(options?.baseUrl);
  return fetchJson<DawaAdresse>(`${baseUrl}/adresser/${encodeURIComponent(adresseId)}`, { signal: options?.signal });
}

