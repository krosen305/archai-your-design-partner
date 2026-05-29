import { utm32ToWgs84 } from "@/lib/geometry-utils";
import { runtimeConfig } from "@/lib/runtime-config";
import { z } from "zod";

const gsearchGeometrySchema = z.object({
  type: z.string(),
  coordinates: z.array(z.tuple([z.number(), z.number()])).optional(),
});

const gsearchResultSchema = z.object({
  id: z.string().min(1),
  visningstekst: z.string(),
  postnummer: z.string().optional(),
  postnummernavn: z.string().optional(),
  kommunekode: z.string().optional(),
  geometri: gsearchGeometrySchema.nullable().optional(),
});

const gsearchResponseSchema = z.array(gsearchResultSchema);

export type GsearchSuggestion = {
  adresseid: string;
  adgangsadresseid: string;
  tekst: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  koordinater: { lat: number; lng: number } | null;
};

/** Husnummer-suggestion. P2 #1: GSearch /husnummer leverer adgangsadresseid
 *  direkte, så vi kan udfylde feltet tidligere end første DAR enrichment-kald. */
export type GsearchHusnummerSuggestion = {
  adgangsadresseid: string;
  tekst: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  koordinater: { lat: number; lng: number } | null;
};

export class GsearchService {
  static async getSuggestions(
    query: string,
    tokenOverride?: string | null,
  ): Promise<GsearchSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const token = tokenOverride ?? runtimeConfig.integrations.dataforsyningenToken;
    const params = new URLSearchParams({
      q,
      limit: String(runtimeConfig.integrations.gsearch.resultLimit),
    });
    if (token) params.set("token", token);

    const url = `${runtimeConfig.integrations.gsearch.endpoint}/adresse?${params.toString()}`;
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GSearch HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    let raw: z.infer<typeof gsearchResponseSchema>;
    try {
      const json = await res.json();
      const parsed = gsearchResponseSchema.safeParse(json);
      if (!parsed.success) return [];
      raw = parsed.data;
    } catch {
      throw new Error("GSearch returnerede ugyldig JSON");
    }

    return raw.map((r) => {
      const coords = r.geometri?.coordinates?.[0];
      return {
        adresseid: r.id,
        adgangsadresseid: "",
        tekst: r.visningstekst,
        postnr: r.postnummer ?? "",
        postnrnavn: r.postnummernavn ?? "",
        kommunekode: r.kommunekode ?? "",
        koordinater: coords ? utm32ToWgs84(coords[0], coords[1]) : null,
      };
    });
  }

  /**
   * P2 #1 (Hasselvej 48 audit): GSearch /husnummer returnerer id = adgangsadresseid
   * (DAR husnummer-id). Kalden er fortsat dækket af CLAUDE.md Data Source Rules
   * (autocomplete-undtagelse for /adresse og /husnummer). Bruges som supplement
   * til /adresse for at udfylde address.adgangsadresseid allerede ved adressevalg
   * — DAR enrichment validerer stadig før compliance-output.
   */
  static async getHusnummerSuggestions(
    query: string,
    tokenOverride?: string | null,
  ): Promise<GsearchHusnummerSuggestion[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const token = tokenOverride ?? runtimeConfig.integrations.dataforsyningenToken;
    const params = new URLSearchParams({
      q,
      limit: String(runtimeConfig.integrations.gsearch.resultLimit),
    });
    if (token) params.set("token", token);

    const url = `${runtimeConfig.integrations.gsearch.endpoint}/husnummer?${params.toString()}`;
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GSearch /husnummer HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    let raw: z.infer<typeof gsearchResponseSchema>;
    try {
      const json = await res.json();
      const parsed = gsearchResponseSchema.safeParse(json);
      if (!parsed.success) return [];
      raw = parsed.data;
    } catch {
      throw new Error("GSearch /husnummer returnerede ugyldig JSON");
    }

    return raw.map((r) => {
      const coords = r.geometri?.coordinates?.[0];
      return {
        adgangsadresseid: r.id,
        tekst: r.visningstekst,
        postnr: r.postnummer ?? "",
        postnrnavn: r.postnummernavn ?? "",
        kommunekode: r.kommunekode ?? "",
        koordinater: coords ? utm32ToWgs84(coords[0], coords[1]) : null,
      };
    });
  }
}
