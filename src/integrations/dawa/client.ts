/**
 * DAWA – Danmarks Adressers Web API
 *
 * ⚠️  UDFASES AUGUST 2026
 *
 * Migreringsstatus:
 *   getSuggestions()     → FASE 3: afventer DATAFORSYNINGEN_TOKEN
 *                          GsearchService er klar i gsearch/client.ts
 *   getAddressDetails()  → FASE 2: ✅ MIGRERET til dar/client.ts
 *                          grundareal-kald → FASE 1: ✅ MIGRERET til mat/client.ts
 *
 * KRITISK OPDAGELSE: /adresser/autocomplete returnerer IDs nested under
 * `r.adresse.id` og `r.adresse.adgangsadresseid`, IKKE på top-niveau.
 */

const BASE_URL = "https://api.dataforsyningen.dk";

export type DawaSuggestion = {
  adresseid: string;
  adgangsadresseid: string;
  tekst: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  koordinater: { lat: number; lng: number };
};

export class DawaService {
  static async getSuggestions(query: string, signal?: AbortSignal): Promise<DawaSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const url = `${BASE_URL}/adresser/autocomplete?q=${encodeURIComponent(q)}&per_side=5`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (e) {
      throw new Error(`DAWA netværksfejl: ${(e as Error).message ?? String(e)}`);
    }

    if (!res.ok) throw new Error(`DAWA ${res.status} for ${url}`);

    let raw: {
      tekst: string;
      adresse: {
        id: string;
        adgangsadresseid: string;
        postnr: string;
        postnrnavn: string;
        kommunekode: string;
        x: number;
        y: number;
      };
    }[];
    try {
      raw = await res.json();
    } catch {
      throw new Error("DAWA returnerede ugyldig JSON");
    }

    return raw
      .filter((r) => r.adresse?.id && r.adresse?.adgangsadresseid)
      .map((r) => ({
        adresseid: r.adresse.id,
        adgangsadresseid: r.adresse.adgangsadresseid,
        tekst: r.tekst,
        postnr: r.adresse.postnr ?? "",
        postnrnavn: r.adresse.postnrnavn ?? "",
        kommunekode: r.adresse.kommunekode ?? "",
        koordinater: { lat: r.adresse.y, lng: r.adresse.x },
      }));
  }
}
