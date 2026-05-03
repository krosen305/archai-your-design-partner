// SERVER-SIDE ONLY — never import from browser code.
// GSearch v2.0 (Dataforsyningen) — replaces DawaService.getSuggestions() (DAWA Phase 3).
// Requires DATAFORSYNINGEN_TOKEN (free, register at dataforsyningen.dk).
// API docs: https://github.com/SDFIdk/gsearch/tree/v2.0/doc
//
// Response fields per adresse result (confirmed against live API):
//   id, visningstekst, kommunenavn, kommunekode, postnummer, postnummernavn,
//   vejnavn, husnummer, geometri (MultiPoint EPSG:25832), vejpunkt_geometri
//
// adgangsadresseid is not returned — enriched by DarService.getAddressDetails().

const GSEARCH_BASE = "https://api.dataforsyningen.dk/rest/gsearch/v2.0";

export type GsearchSuggestion = {
  adresseid: string;
  adgangsadresseid: string;
  tekst: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  koordinater: { lat: number; lng: number };
};

type GsearchResult = {
  id: string;
  visningstekst: string;
  postnummer?: string;
  postnummernavn?: string;
  kommunekode?: string;
  geometri?: { type: string; coordinates?: number[][] };
};

// EPSG:25832 (UTM 32N) → WGS84 — mirrors dar/client.ts
function utm32NToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const k0 = 0.9996,
    a = 6378137.0,
    e2 = 0.00669437999014;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = 9 * (Math.PI / 180);
  const x = easting - 500000,
    y = northing;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sp = Math.sin(phi1),
    cp = Math.cos(phi1),
    tp = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sp * sp);
  const T1 = tp * tp,
    C1 = (e2 * cp * cp) / (1 - e2);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sp * sp, 1.5);
  const D = x / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * tp) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 + 24 * T1 * T1) * D ** 5) / 120) /
      cp;
  return { lat: lat * (180 / Math.PI), lng: lon * (180 / Math.PI) };
}

export class GsearchService {
  static async getSuggestions(query: string): Promise<GsearchSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const token = (process as any)?.env?.DATAFORSYNINGEN_TOKEN ?? "";
    const params = new URLSearchParams({ q, limit: "5" });
    if (token) params.set("token", token);

    const url = `${GSEARCH_BASE}/adresse?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    } catch (e) {
      throw new Error(`GSearch netværksfejl: ${(e as Error).message ?? String(e)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GSearch HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    let raw: GsearchResult[];
    try {
      raw = (await res.json()) as GsearchResult[];
    } catch {
      throw new Error("GSearch returnerede ugyldig JSON");
    }

    if (!Array.isArray(raw)) return [];

    return raw
      .filter((r) => r.id)
      .map((r) => {
        // geometri er MultiPoint i EPSG:25832 — konvertér første punkt til WGS84
        const coords = r.geometri?.coordinates?.[0];
        const koordinater =
          coords && coords.length >= 2 ? utm32NToWgs84(coords[0], coords[1]) : { lat: 0, lng: 0 };

        return {
          adresseid: r.id,
          adgangsadresseid: "", // Fyldes af DarService.getAddressDetails() efter valg
          tekst: r.visningstekst,
          postnr: r.postnummer ?? "",
          postnrnavn: r.postnummernavn ?? "",
          kommunekode: r.kommunekode ?? "",
          koordinater,
        };
      });
  }
}
