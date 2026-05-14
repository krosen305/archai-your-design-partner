// SERVER-SIDE ONLY — credentials must never be exposed to the browser.
//
// FBB (Fredede og Bevaringsværdige Bygninger) via Kulturarvsstyrelsens GeoServer WFS.
//
// Endpoint: https://www.kulturarv.dk/geoserver/wfs
// typename: fbb:view_bygningslag
// CQL_FILTER: bygningsid IN ({comma-separated integer BBR building ids})
//
// SAVE-skala 1-9: lavere tal = højere bevaringsværdi.
//   1-3: Høj bevaringsværdi — nedrivning/ombygning kræver kommunal tilladelse (PL §14)
//   4-6: Middel bevaringsværdi
//   7-9: Lav bevaringsværdi
//   -1:  Ikke SAVE-registreret
//
// bygningsid = integer BBR id_lokalId fra BBR Public Service (api.dataforsyningen.dk)
// — forskellig fra Datafordeler UUID id_lokalId.

const FBB_WFS = "https://www.kulturarv.dk/geoserver/wfs";

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type FbbBygning = {
  bygningsid: number;
  bygningsnummer: number;
  bevaringsvaerdi: number;
  fredningsstatus: string | null;
};

export type FbbResultat = {
  fbb_bygninger: FbbBygning[];
  fbb_bedste_bygning: {
    bygningsid: number;
    bevaringsvaerdi: number;
    fredningsstatus: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// WFS-kald
// ---------------------------------------------------------------------------

async function fetchWfs(ids: number[]): Promise<FbbBygning[]> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename: "fbb:view_bygningslag",
    outputFormat: "application/json",
    CQL_FILTER: `bygningsid IN (${ids.join(",")})`,
  });
  const url = `${FBB_WFS}?${params}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json, application/xml, */*" },
    signal: AbortSignal.timeout(10_000),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`FBB WFS HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json") || bodyText.trimStart().startsWith("{")) {
    return parseJson(bodyText);
  }
  return parseXml(bodyText);
}

// ---------------------------------------------------------------------------
// JSON-parser (GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

function parseJson(body: string): FbbBygning[] {
  const geojson = JSON.parse(body) as {
    features?: Array<{
      id?: string;
      properties?: Record<string, unknown>;
    }>;
  };

  return (geojson.features ?? []).flatMap((f) => {
    const props = f.properties ?? {};
    const bevaringsvaerdi = Number(props["bevaringsvaerdi"] ?? props["BEVARINGSVAERDI"] ?? NaN);
    const bbrnummer = props["bbrnummer"] ?? props["BBRNUMMER"] ?? null;
    const bygningsnummerRaw =
      props["bygningsnummer"] ??
      props["BYGNINGSNUMMER"] ??
      (typeof bbrnummer === "string" ? bbrnummer.split("-").at(-1) : NaN);
    const bygningsnummer = Number(bygningsnummerRaw);
    const fredningsstatusRaw = props["fredningsstatus"] ?? props["FREDNINGSSTATUS"] ?? null;
    const fredningsstatus = fredningsstatusRaw === null ? null : String(fredningsstatusRaw);

    if (isNaN(bevaringsvaerdi) || isNaN(bygningsnummer)) return [];

    const propBygningsid = Number(props["bygningsid"] ?? props["BYGNINGSID"] ?? NaN);

    // bygningsid: primært fra view_bygningslag.bygningsid, fallback fra feature-id.
    const featureIdStr = typeof f.id === "string" ? f.id : "";
    const idMatch = featureIdStr.match(/\.(\d+)$/);
    const bygningsid = Number.isFinite(propBygningsid)
      ? propBygningsid
      : idMatch
        ? Number(idMatch[1])
        : Number(props["id"] ?? props["ID"] ?? bygningsnummer);

    return [{ bygningsid, bygningsnummer, bevaringsvaerdi, fredningsstatus }];
  });
}

// ---------------------------------------------------------------------------
// XML-parser (GML WFS 2.0 — simpel regex, ingen DOMParser i Workers)
// ---------------------------------------------------------------------------

function xmlText(xml: string, tag: string): string | null {
  // Matcher namespace-prefix og lokalt navn, fx <fbb:bevaringsvaerdi> eller <bevaringsvaerdi>
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>(.*?)<\\/(?:[^:>]+:)?${tag}>`, "s");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseXml(body: string): FbbBygning[] {
  // Splitter på <fbb:bygningslag ...> blokke (eller namespace-løst <bygningslag>)
  const blockRe = /<(?:[^:>]+:)?bygningslag\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?bygningslag>/g;
  const results: FbbBygning[] = [];
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(body)) !== null) {
    const block = m[1];
    const featureHeader = m[0];

    const bevaringsvaerdi = Number(xmlText(block, "bevaringsvaerdi"));
    const bygningsnummer = Number(xmlText(block, "bygningsnummer"));
    const fredningsstatus = xmlText(block, "fredningsstatus");

    if (isNaN(bevaringsvaerdi) || isNaN(bygningsnummer)) continue;

    // Udled bygningsid fra gml:id attribut (fx gml:id="bygningslag.4600919")
    const gmlIdMatch = featureHeader.match(/gml:id="[^."]*\.(\d+)"/);
    const bygningsid = gmlIdMatch ? Number(gmlIdMatch[1]) : bygningsnummer;

    results.push({ bygningsid, bygningsnummer, bevaringsvaerdi, fredningsstatus });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Vælg bedste bygning: laveste bevaringsvaerdi >= 1 (ekskluder -1 = ingen SAVE)
// ---------------------------------------------------------------------------

function vælgBedsteBygning(bygninger: FbbBygning[]): FbbResultat["fbb_bedste_bygning"] {
  const kandidater = bygninger.filter((b) => b.bevaringsvaerdi >= 1);
  if (!kandidater.length) return null;

  const bedste = kandidater.reduce((a, b) => (b.bevaringsvaerdi < a.bevaringsvaerdi ? b : a));

  return {
    bygningsid: bedste.bygningsid,
    bevaringsvaerdi: bedste.bevaringsvaerdi,
    fredningsstatus: bedste.fredningsstatus,
  };
}

// ---------------------------------------------------------------------------
// FbbService
// ---------------------------------------------------------------------------

export class FbbService {
  /**
   * Henter SAVE-bevaringsværdi og fredningsstatus fra Kulturarvsstyrelsens FBB GeoServer.
   *
   * Fail-open: API-fejl returnerer { fbb_bygninger: [], fbb_bedste_bygning: null }.
   * Bygninger med bevaringsvaerdi = -1 medtages i fbb_bygninger men ekskluderes fra bedste.
   *
   * @param bygningIds  Integer BBR building IDs fra BBR Public Service (id_lokalId)
   */
  static async getSaveData(bygningIds: number[]): Promise<FbbResultat> {
    const empty: FbbResultat = { fbb_bygninger: [], fbb_bedste_bygning: null };

    if (!bygningIds.length) return empty;

    try {
      const bygninger = await fetchWfs(bygningIds);
      return {
        fbb_bygninger: bygninger,
        fbb_bedste_bygning: vælgBedsteBygning(bygninger),
      };
    } catch (e) {
      console.warn("[FBB] GeoServer fejl:", (e as Error).message);
      return empty;
    }
  }
}
