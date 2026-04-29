// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// Kald kun denne service fra TanStack Start server functions eller
// Cloudflare Workers handlers. Aldrig direkte fra en React-komponent.
//
// Docs: https://confluence.sdfi.dk/pages/viewpage.action?pageId=16056582
// Note: REST (BBRPublic) udfases Q2-2026 – migrér til GraphQL på sigt.

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type BbrClientConfig = {
  baseUrl?: string;
  username?: string;
  password?: string;
};

function getConfig(explicit?: BbrClientConfig): Required<BbrClientConfig> {
  const baseUrl =
    explicit?.baseUrl ??
    (process as any)?.env?.DATAFORDELER_BASE_URL ??
    'https://services.datafordeler.dk';

  const username =
    explicit?.username ??
    (process as any)?.env?.DATAFORDELER_USERNAME ??
    '';

  const password =
    explicit?.password ??
    (process as any)?.env?.DATAFORDELER_PASSWORD ??
    '';

  if (!username || !password) {
    throw new Error(
      'BBR: Manglende DATAFORDELER_USERNAME/PASSWORD. ' +
      'Sæt disse som server-side environment variables (ikke VITE_ prefix).'
    );
  }

  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ''),
    username: String(username),
    password: String(password),
  };
}

// ---------------------------------------------------------------------------
// Kodelister
// ---------------------------------------------------------------------------

const ANVENDELSE_KODER: Record<string, string> = {
  '110': 'Stuehus til landbrugsejendom',
  '120': 'Fritliggende enfamilieshus',
  '121': 'Sammenbygget enfamilieshus',
  '122': 'Dobbelthus',
  '130': 'Række-, kæde- eller dobbelthus',
  '131': 'Række- og kædehus',
  '132': 'Dobbelthus',
  '140': 'Etagebolig',
  '150': 'Kollegium',
  '160': 'Boligbygning til døgninstitution',
  '190': 'Anden helårsbeboelse',
  '210': 'Erhvervsmæssig produktion',
  '220': 'Kontor, handel, lager',
  '221': 'Kontor',
  '222': 'Detailhandel',
  '223': 'Lager',
  '290': 'Andet erhverv',
  '321': 'Liberalt erhverv',
  '322': 'Liberalt erhverv med beboelse',
  '390': 'Andet',
  '510': 'Sommerhus',
  '585': 'Anneks',
  '910': 'Garage',
  '920': 'Carport',
  '930': 'Udhus',
  '940': 'Drivhus',
  '990': 'Anden bygning til garageanlæg',
};

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type BbrKompliantData = {
  // Bygningsdata
  byggeaar: string | null;
  bebygget_areal: number | null;      // byg041BebyggetAreal
  samlet_areal: number | null;        // byg039BygningensSamledeAreal
  antal_etager: number | null;        // byg054AntalEtager
  anvendelseskode: string | null;     // byg021BygningensAnvendelse
  anvendelse_tekst: string | null;    // oversat fra kode
  ydervæg_kode: string | null;        // byg032YdervæggensMateriale
  tagdækning_kode: string | null;     // byg033Tagdækningsmateriale
  varme_kode: string | null;          // byg056Varmeinstallation

  // Grunddata
  grundareal: number | null;

  // Beregnet
  bebyggelsesprocent: number | null;  // (bebygget_areal / grundareal) * 100
  beregning_mulig: boolean;

  // Meta
  fejl: string | null;                // dansk fejlbesked hvis noget mangler
};

// ---------------------------------------------------------------------------
// Intern hjælp
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 10_000;

async function fetchBbrJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Datafordeler BBR fejl (${res.status} ${res.statusText})${text ? `: ${text}` : ''}`
      );
    }

    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Datafordeler BBR timeout – prøv igen senere');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function buildBbrUrl(
  baseUrl: string,
  endpoint: string,
  username: string,
  password: string,
  extraParams: Record<string, string>
): string {
  const params = new URLSearchParams({
    username,
    password,
    Format: 'JSON',
    MedDybde: 'true',
    RegistreringFra: '1900-01-01',
    RegistreringTil: '2100-01-01',
    ...extraParams,
  });
  return `${baseUrl}/BBR/BBRPublic/1/rest/${endpoint}?${params.toString()}`;
}

function toNum(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(val: unknown): string | null {
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'string' && val.trim() !== '') return val.trim();
  return null;
}

function pickByggeaar(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    'byg026Opførelsesår',
    'byg026Opfoerelsesaar',
    'opfoerelsesaar',
    'opførelsesår',
    'byggeaar',
    'byggeår',
  ];
  for (const k of candidates) {
    const v = toStr(obj[k]);
    if (v) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// BbrService
// ---------------------------------------------------------------------------

export class BbrService {
  /**
   * Henter komplet compliance-relevant bygnings- og grunddata for en adresse.
   *
   * @param adgangsadresseid – fra DawaService.getAddressDetails()
   * @param config – valgfrit; bruges primært til test
   */
  static async getKompliantData(
    adgangsadresseid: string,
    config?: BbrClientConfig
  ): Promise<BbrKompliantData> {
    const id = adgangsadresseid.trim();
    if (!id) {
      return {
        byggeaar: null,
        bebygget_areal: null,
        samlet_areal: null,
        antal_etager: null,
        anvendelseskode: null,
        anvendelse_tekst: null,
        ydervæg_kode: null,
        tagdækning_kode: null,
        varme_kode: null,
        grundareal: null,
        bebyggelsesprocent: null,
        beregning_mulig: false,
        fejl: 'adgangsadresseid er påkrævet',
      };
    }

    const { baseUrl, username, password } = getConfig(config);

    // ----- Hent bygning -----
    let bygning: any = null;
    try {
      const bygUrl = buildBbrUrl(baseUrl, 'bygning', username, password, {
        AdresseIdentificerer: id,
      });
      const raw = await fetchBbrJson<any>(bygUrl);
      const arr = Array.isArray(raw) ? raw : [raw];

      // Filtrér irrelevante bygningstyper (garage, udhus etc.)
      // og tag den primære boligbygning
      const relevante = arr.filter((b: any) => {
        const kode = toStr(b?.byg021BygningensAnvendelse) ?? '';
        // Udeluk ren garage/carport/udhus hvis der er andre bygninger
        return !['910', '920', '930', '940'].includes(kode) || arr.length === 1;
      });

      bygning = relevante[0] ?? arr[0] ?? null;
    } catch (e) {
      console.error('[BBR] Bygningsopslag fejlede:', e);
    }

    if (!bygning) {
      return {
        byggeaar: null,
        bebygget_areal: null,
        samlet_areal: null,
        antal_etager: null,
        anvendelseskode: null,
        anvendelse_tekst: null,
        ydervæg_kode: null,
        tagdækning_kode: null,
        varme_kode: null,
        grundareal: null,
        bebyggelsesprocent: null,
        beregning_mulig: false,
        fejl: 'Ingen bygning fundet på adressen',
      };
    }

    // ----- Udtræk bygningsfelter -----
    const anvendelseskode = toStr(bygning.byg021BygningensAnvendelse);
    const bebygget_areal = toNum(bygning.byg041BebyggetAreal);

    const bygData = {
      byggeaar: pickByggeaar(bygning),
      bebygget_areal,
      samlet_areal: toNum(bygning.byg039BygningensSamledeAreal),
      antal_etager: toNum(bygning.byg054AntalEtager),
      anvendelseskode,
      anvendelse_tekst: anvendelseskode
        ? (ANVENDELSE_KODER[anvendelseskode] ?? `Kode ${anvendelseskode}`)
        : null,
      ydervæg_kode: toStr(bygning.byg032YdervæggensMateriale),
      tagdækning_kode: toStr(bygning.byg033Tagdækningsmateriale),
      varme_kode: toStr(bygning.byg056Varmeinstallation),
    };

    // ----- Hent grund (til grundareal) -----
    let grundareal: number | null = null;
    try {
      const grundUrl = buildBbrUrl(baseUrl, 'grund', username, password, {
        AdresseIdentificerer: id,
      });
      const rawGrund = await fetchBbrJson<any>(grundUrl);
      const grundArr = Array.isArray(rawGrund) ? rawGrund : [rawGrund];
      const grund = grundArr[0];

      if (grund) {
        // Forsøg at finde grundareal fra jordstykke-listen
        const jordstykker = grund.jordstykke ?? grund.JordstykkeList ?? [];
        if (Array.isArray(jordstykker) && jordstykker.length > 0) {
          const areal = jordstykker.reduce((sum: number, j: any) => {
            return sum + (toNum(j.jse030Areal) ?? toNum(j.areal) ?? 0);
          }, 0);
          if (areal > 0) grundareal = areal;
        }

        // Fallback: direkte arealtfelt på grund
        if (grundareal === null) {
          grundareal =
            toNum(grund.gru040Areal) ??
            toNum(grund.areal) ??
            null;
        }
      }
    } catch (e) {
      console.error('[BBR] Grundopslag fejlede:', e);
    }

    // ----- Beregn bebyggelsesprocent -----
    let bebyggelsesprocent: number | null = null;
    if (bebygget_areal !== null && grundareal !== null && grundareal > 0) {
      bebyggelsesprocent = Math.round((bebygget_areal / grundareal) * 1000) / 10;
    }

    const beregning_mulig = bebyggelsesprocent !== null;
    const fejl = grundareal === null
      ? 'Grundareal ikke tilgængeligt – bebyggelsesprocent kan ikke beregnes'
      : null;

    return {
      ...bygData,
      grundareal,
      bebyggelsesprocent,
      beregning_mulig,
      fejl,
    };
  }

  /**
   * @deprecated Brug getKompliantData(adgangsadresseid) i stedet.
   * Denne metode slår op på bygningId (ikke adgangsadresseid) og
   * returnerer kun byggeaar.
   */
  static async getBygningById(
    bygningId: string,
    config?: BbrClientConfig
  ): Promise<{ byggeaar: string | null }> {
    const id = bygningId.trim();
    if (!id) throw new Error('BBR bygningId er påkrævet');

    const { baseUrl, username, password } = getConfig(config);
    const url = buildBbrUrl(baseUrl, 'bygning', username, password, { Id: id });
    const raw = await fetchBbrJson<any>(url);
    const first = Array.isArray(raw) ? raw[0] : raw;
    return { byggeaar: pickByggeaar(first) ?? pickByggeaar(first?.Bygning) ?? null };
  }
}