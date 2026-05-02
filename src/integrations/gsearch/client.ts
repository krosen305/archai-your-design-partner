// SERVER-SIDE ONLY — never import from browser code.
// GSearch v2.0 (Dataforsyningen) — replaces DawaService.getSuggestions() (DAWA Phase 3).
// API docs: https://github.com/SDFIdk/gsearch/tree/v2.0/doc
//
// Endpoint: GET https://api.dataforsyningen.dk/rest/gsearch/v2.0/adresse?q=...&limit=5[&token=...]
// Response per result: { id, visningstekst, geometri, vejpunkt_geometri }
//   id              – DAR adresse id_lokalId (same UUID as DAWA adresseid)
//   visningstekst   – display text, e.g. "Hasselvej 48, 2830 Virum"
//
// Fields not returned by GSearch (adgangsadresseid, postnr, postnrnavn, kommunekode,
// koordinater) are enriched immediately after selection by DarService.getAddressDetails().

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
};

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
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
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
      .map((r) => ({
        adresseid: r.id,
        adgangsadresseid: "",
        tekst: r.visningstekst,
        postnr: "",
        postnrnavn: "",
        kommunekode: "",
        koordinater: { lat: 0, lng: 0 },
      }));
  }
}
