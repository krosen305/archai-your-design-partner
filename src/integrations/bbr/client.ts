export type BbrClientConfig = {
  /**
   * Datafordeler BBR REST base URL.
   * Default: https://services.datafordeler.dk
   */
  baseUrl?: string;
  /**
   * Datafordeler credentials (REST username/password).
   * Prefer server-side usage; exposing credentials client-side is not safe.
   */
  username?: string;
  password?: string;
};

export type CleanBbrBygning = {
  byggeaar: string | null;
};

function getConfig(explicit?: BbrClientConfig): Required<BbrClientConfig> {
  const baseUrl =
    explicit?.baseUrl ||
    (import.meta as any)?.env?.VITE_DATAFORDELER_BASE_URL ||
    (process as any)?.env?.DATAFORDELER_BASE_URL ||
    'https://services.datafordeler.dk';

  const username =
    explicit?.username ||
    (process as any)?.env?.DATAFORDELER_USERNAME ||
    (import.meta as any)?.env?.VITE_DATAFORDELER_USERNAME ||
    '';

  const password =
    explicit?.password ||
    (process as any)?.env?.DATAFORDELER_PASSWORD ||
    (import.meta as any)?.env?.VITE_DATAFORDELER_PASSWORD ||
    '';

  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ''),
    username: String(username),
    password: String(password),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Datafordeler BBR request failed (${res.status} ${res.statusText})${text ? `: ${text}` : ''}`
    );
  }
  return (await res.json()) as T;
}

function pickByggeaar(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    'opfoerelsesaar',
    'opførelsesår',
    'byggeaar',
    'byggeår',
    'bygningOpfoerelsesAar',
    'bygning_opfoerelsesaar',
    'bygningOpførelsesår',
    'bygningOpfoerelsesaarDato',
  ];
  for (const k of candidates) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Minimal Datafordeler REST client for BBR.
 *
 * Note: Datafordeler REST (BBRPublic) is being phased out end of 2026; prefer GraphQL long-term.
 * Docs: https://confluence.sdfi.dk/pages/viewpage.action?pageId=16056582
 */
export class BbrService {
  static async getBygningById(
    bygningId: string,
    config?: BbrClientConfig
  ): Promise<CleanBbrBygning> {
    const id = bygningId.trim();
    if (!id) throw new Error('BBR bygningId is required');

    const { baseUrl, username, password } = getConfig(config);
    if (!username || !password) {
      throw new Error(
        'Missing Datafordeler credentials. Set DATAFORDELER_USERNAME and DATAFORDELER_PASSWORD (server-side).'
      );
    }

    // Interval required by REST services. Use wide range to get current/most recent.
    const qs = new URLSearchParams({
      Format: 'JSON',
      MedDybde: 'true',
      Id: id,
      RegistreringFra: '1900-01-01',
      RegistreringTil: '2100-01-01',
      username,
      password,
    }).toString();

    const url = `${baseUrl}/BBR/BBRPublic/1/rest/bygning?${qs}`;
    const raw = await fetchJson<any>(url);

    // Datafordeler often returns an array (versions). Try first element, then object itself.
    const first = Array.isArray(raw) ? raw[0] : raw;
    const byggeaar = pickByggeaar(first) ?? pickByggeaar(first?.Bygning) ?? null;

    return { byggeaar };
  }
}

