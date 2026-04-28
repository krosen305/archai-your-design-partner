type DawaResponse<T> = { data: T };

export interface DawaAutocompleteItem {
  data: DawaResponse<{
    tekst: string;
    forslagstekst: string;
    adgangsadresseid: string;
    adresseid: string;
  }>;
}

export interface DawaAdresseApiResponse {
  data: DawaResponse<{
    id: string;
    adressebetegnelse: string;
    postnr: string;
    postnrnavn: string;
    kommune: {
      kode: string;
      navn: string;
    };
    husnr: string;
    // Alias requested by requirement; DAWA uses "husnr" in practice.
    husnummer?: string;
    matrikel?: {
      ejerlavnavn: string;
      matrikelnr: string;
    };
    bbr?: {
      // Requirement calls this "kvhx" (important for BBR).
      kvhx?: string | null;
      // Some DAWA-like payloads use kvhxid; keep it optional for compatibility.
      kvhxid?: string | null;
    };
  }>;
}

export type DawaSuggestion = {
  id: string; // adresseid (preferred) or adgangsadresseid
  tekst: string;
  forslagstekst: string;
};

export type CleanAddressDetails = {
  adresse: string;
  postnr: string;
  kommune: string;
  matrikel: string | null;
  bbrId: string | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    throw new Error(`DAWA network error: ${(e as any)?.message ?? String(e)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `DAWA request failed (${res.status} ${res.statusText})${text ? `: ${text}` : ''}`
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('DAWA response was not valid JSON');
  }
}

export class DawaService {
  static async getSuggestions(query: string): Promise<DawaSuggestion[]> {
    const q = query.trim();
    if (!q) return [];

    const url = `https://dawa.aws.dk/adresser/autocomplete?q=${encodeURIComponent(q)}`;
    const raw = await fetchJson<
      { tekst: string; forslagstekst: string; adgangsadresseid: string; adresseid: string }[]
    >(url);

    return raw.map((r) => ({
      id: r.adresseid || r.adgangsadresseid,
      tekst: r.tekst,
      forslagstekst: r.forslagstekst,
    }));
  }

  static async getAddressDetails(id: string): Promise<CleanAddressDetails> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('DAWA address id is required');
    }

    const url = `https://dawa.aws.dk/adresser/${encodeURIComponent(trimmed)}`;
    const raw = await fetchJson<{
      id: string;
      adressebetegnelse: string;
      postnr: string;
      postnrnavn: string;
      kommune: { kode: string; navn: string };
      husnr: string;
      matrikel?: { ejerlavnavn: string; matrikelnr: string };
      bbr?: { kvhx?: string | null; kvhxid?: string | null };
    }>(url);

    const matrikel = raw.matrikel
      ? `${raw.matrikel.matrikelnr} ${raw.matrikel.ejerlavnavn}`.trim()
      : null;

    const bbrId = raw.bbr?.kvhx ?? raw.bbr?.kvhxid ?? null;

    return {
      adresse: raw.adressebetegnelse,
      postnr: raw.postnr,
      // Prefer the official municipality name (not postnr city name).
      kommune: (raw.kommune?.navn || 'Ukendt').trim(),
      matrikel,
      bbrId,
    };
  }
}

