// PLANDATA – Danmarks officielle planregister
// WFS (Web Feature Service) via geoserver.plandata.dk
//
// Plandata WFS er OFFENTLIGT TILGÆNGELIGT – ingen registrering eller API-nøgle kræves.
// Vedligeholdes af Erhvervsstyrelsen.
//
// GeoServer endpoint:
//   https://geoserver.plandata.dk/geoserver/wfs
//   (kræver parameter: servicename=wfs – plandata-specifikt)
//
// Relevante themes (brug altid præfiks "pdk:" i typeName):
//   pdk:theme_pdk_lokalplan_vedtaget                   ← VEDTAGNE lokalplaner
//   pdk:theme_pdk_lokalplan_forslag                    ← Lokalplanforslag
//   pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v     ← Kommuneplanrammer
//
// Koordinatsystem:
//   Plandata gemmer data i EPSG:25832 (UTM zone 32N / EUREF89).
//   GeoServer understøtter SRID-angivelse i CQL_FILTER:
//     INTERSECTS(geometri, SRID=4326;POINT(lng lat))
//   → Ingen koordinatkonvertering nødvendig på klientsiden.
//
// Feltnavne verificeret mod live WFS-svar (ARCH-19, 2026-04-30):
//   Lokalplan:        planid, plannavn, plannr, kommunenavn, komnr,
//                     datovedt, datoikraft, doklink, plantype, status ("V"),
//                     anvgen (numerisk kode), anvendelsegenerel (tekst)
//   Kommuneplanramme: planid, plannavn, plannr, komnr, komunenavn, planstatus ("V"),
//                     bebygpct, maxetager, maxbygnhjd, anvgen, anvendelsegenerel,
//                     fremtidigzonestatus, sforhold, doklink, datoikraft

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { selectKommuneplanrammeForCompliance } from "./selectors";
import { logServerEvent } from "@/lib/server-logger";

// WFS er et offentligt endpoint — retry på 502/503/504, ikke 429.
const WFS_RETRY = { timeoutMs: 15_000, retries: 1, retryOnStatuses: [502, 503, 504] };

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type Lokalplan = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  datoVedtaget: string | null; // datovedt fra API (YYYYMMDD som tal)
  datoIkraft: string | null; // datoikraft fra API
  plandokumentLink: string | null; // doklink fra API
  plantype: string | null; // f.eks. "20.1"
  status: string | null; // "V" = vedtaget
  anvgen: number | null; // numerisk anvendelseskode
  anvendelseGenerel: string | null; // tekstbeskrivelse af anvendelse
};

export type Kommuneplanramme = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  bebygpct: number | null; // max bebyggelsesprocent
  maxetager: number | null; // max antal etager
  maxbygnhjd: number | null; // max bygningshøjde i meter
  anvgen: number | null; // numerisk anvendelseskode
  anvendelseGenerel: string | null; // tekstbeskrivelse af anvendelse
  fremtidigzonestatus: string | null;
  sforhold: string | null; // særlige forhold / planbestemmelser (fritekst)
  planstatus: string | null; // "V" = vedtaget
  datoIkraft: string | null;
  plandokumentLink: string | null;
};

export type PlandataResult = {
  lokalplaner: Lokalplan[];
  fejl: string | null;
  rawCount: number;
};

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";

const LOKALPLAN_TYPE = "pdk:theme_pdk_lokalplan_vedtaget";
const LOKALPLAN_FORSLAG_TYPE = "pdk:theme_pdk_lokalplan_forslag";
const KOMMUNEPLANRAMME_TYPE = "pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v";

// ---------------------------------------------------------------------------
// Hjælpefunktion: byg WFS GetFeature URL
// ---------------------------------------------------------------------------

function buildWfsUrl(
  typeName: string,
  lngWgs84: number,
  latWgs84: number,
  maxFeatures = 10,
): string {
  const params = new URLSearchParams({
    servicename: "wfs",
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
    CQL_FILTER: `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`,
  });

  return `${WFS_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Mapper: GeoServer GeoJSON feature → Lokalplan
// ---------------------------------------------------------------------------

type PlandataWfsFeature = {
  id?: string;
  properties: Record<string, unknown> | null;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function mapLokalplan(feature: PlandataWfsFeature): Lokalplan {
  const p = feature.properties ?? {};

  return {
    planid: str(p.planid) ?? feature.id ?? "",
    plannavn: str(p.plannavn) ?? "",
    plannr: str(p.plannr),
    kommunenavn: str(p.kommunenavn),
    komnr: num(p.komnr),
    datoVedtaget: str(p.datovedt),
    datoIkraft: str(p.datoikraft),
    plandokumentLink: str(p.doklink),
    plantype: str(p.plantype),
    status: str(p.status),
    anvgen: num(p.anvgen),
    anvendelseGenerel: str(p.anvendelsegenerel),
  };
}

// ---------------------------------------------------------------------------
// Mapper: GeoServer GeoJSON feature → Kommuneplanramme
// ---------------------------------------------------------------------------

function mapKommuneplanramme(feature: PlandataWfsFeature): Kommuneplanramme {
  const p = feature.properties ?? {};

  return {
    planid: str(p.planid) ?? feature.id ?? "",
    plannavn: str(p.plannavn) ?? "",
    plannr: str(p.plannr),
    kommunenavn: str(p.kommunenavn),
    komnr: num(p.komnr),
    bebygpct: num(p.bebygpct),
    maxetager: num(p.maxetager),
    maxbygnhjd: num(p.maxbygnhjd),
    anvgen: num(p.anvgen),
    anvendelseGenerel: str(p.anvendelsegenerel),
    fremtidigzonestatus: str(p.fremtidigzonestatus),
    sforhold: str(p.sforhold),
    planstatus: str(p.planstatus),
    datoIkraft: str(p.datoikraft),
    plandokumentLink: str(p.doklink),
  };
}

// ---------------------------------------------------------------------------
// PlandataService
// ---------------------------------------------------------------------------

export class PlandataService {
  /**
   * Finder vedtagne lokalplaner der dækker det angivne koordinat.
   *
   * @param lngWgs84  Længdegrad (x) i WGS84 – fra DAWA/DAR
   * @param latWgs84  Breddegrad (y) i WGS84 – fra DAWA/DAR
   * @param includeForslag  Om forslag til lokalplaner også skal hentes (default: false)
   */
  static async getLokalplanerForKoordinat(
    lngWgs84: number,
    latWgs84: number,
    includeForslag = false,
  ): Promise<PlandataResult> {
    if (!lngWgs84 || !latWgs84) {
      return { lokalplaner: [], fejl: "Koordinater mangler", rawCount: 0 };
    }

    try {
      const vedtagetRes = await fetchWithRetry(
        buildWfsUrl(LOKALPLAN_TYPE, lngWgs84, latWgs84),
        { headers: { Accept: "application/json" } },
        WFS_RETRY,
      );

      if (!vedtagetRes.ok) {
        const body = await vedtagetRes.text();
        throw new Error(`Plandata WFS HTTP ${vedtagetRes.status}: ${body.slice(0, 300)}`);
      }

      const vedtagetJson = (await vedtagetRes.json()) as any;
      const vedtagetFeatures: any[] = vedtagetJson?.features ?? [];

      let forslagFeatures: any[] = [];
      if (includeForslag) {
        try {
          const forslagRes = await fetchWithRetry(
            buildWfsUrl(LOKALPLAN_FORSLAG_TYPE, lngWgs84, latWgs84),
            { headers: { Accept: "application/json" } },
            WFS_RETRY,
          );
          if (forslagRes.ok) {
            const forslagJson = (await forslagRes.json()) as any;
            forslagFeatures = forslagJson?.features ?? [];
          }
        } catch {
          // Forslag er ikke kritisk – ignorer fejl
        }
      }

      const allFeatures = [...vedtagetFeatures, ...forslagFeatures];
      const lokalplaner = allFeatures.map(mapLokalplan);

      return {
        lokalplaner,
        fejl: lokalplaner.length === 0 ? "Ingen lokalplan fundet for denne adresse" : null,
        rawCount: allFeatures.length,
      };
    } catch (e) {
      logServerEvent({
        module: "plandata/client",
        operation: "getLokalplanerForKoordinat",
        severity: "fatal",
        message: "WFS-kald fejlede",
        error: e,
      });
      return {
        lokalplaner: [],
        fejl: (e as Error).message,
        rawCount: 0,
      };
    }
  }

  /**
   * Henter kommuneplanramme for koordinatet.
   * Returnerer bebyggelsesprocent, max etager, max bygningshøjde og anvendelse.
   */
  static async getKommuneplanrammeForKoordinat(
    lngWgs84: number,
    latWgs84: number,
  ): Promise<{ ramme: Kommuneplanramme | null; fejl: string | null }> {
    if (!lngWgs84 || !latWgs84) {
      return { ramme: null, fejl: "Koordinater mangler" };
    }

    try {
      const res = await fetchWithRetry(
        buildWfsUrl(KOMMUNEPLANRAMME_TYPE, lngWgs84, latWgs84, 10),
        { headers: { Accept: "application/json" } },
        WFS_RETRY,
      );

      if (!res.ok) {
        throw new Error(`Plandata WFS HTTP ${res.status}`);
      }

      const json = (await res.json()) as any;
      const features: any[] = json?.features ?? [];

      if (!features.length) {
        return { ramme: null, fejl: "Ingen kommuneplanramme fundet" };
      }

      const rammer = features.map(mapKommuneplanramme);
      return { ramme: selectKommuneplanrammeForCompliance(rammer), fejl: null };
    } catch (e) {
      logServerEvent({
        module: "plandata/client",
        operation: "getKommuneplanrammeForKoordinat",
        severity: "fatal",
        message: "Kommuneplanramme-kald fejlede",
        error: e,
      });
      return { ramme: null, fejl: (e as Error).message };
    }
  }
}
