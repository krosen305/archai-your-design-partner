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

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type Lokalplan = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  datoVedtaget: string | null;       // datovedt fra API (YYYYMMDD som tal)
  datoIkraft: string | null;         // datoikraft fra API
  plandokumentLink: string | null;   // doklink fra API
  plantype: string | null;           // f.eks. "20.1"
  status: string | null;             // "V" = vedtaget
  anvgen: number | null;             // numerisk anvendelseskode
  anvendelseGenerel: string | null;  // tekstbeskrivelse af anvendelse
};

export type Kommuneplanramme = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  bebygpct: number | null;           // max bebyggelsesprocent
  maxetager: number | null;          // max antal etager
  maxbygnhjd: number | null;         // max bygningshøjde i meter
  anvgen: number | null;             // numerisk anvendelseskode
  anvendelseGenerel: string | null;  // tekstbeskrivelse af anvendelse
  fremtidigzonestatus: string | null;
  sforhold: string | null;           // særlige forhold / planbestemmelser (fritekst)
  planstatus: string | null;         // "V" = vedtaget
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

const WFS_BASE = 'https://geoserver.plandata.dk/geoserver/wfs';

const LOKALPLAN_TYPE = 'pdk:theme_pdk_lokalplan_vedtaget';
const LOKALPLAN_FORSLAG_TYPE = 'pdk:theme_pdk_lokalplan_forslag';
const KOMMUNEPLANRAMME_TYPE = 'pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v';

// ---------------------------------------------------------------------------
// Hjælpefunktion: byg WFS GetFeature URL
// ---------------------------------------------------------------------------

function buildWfsUrl(
  typeName: string,
  lngWgs84: number,
  latWgs84: number,
  maxFeatures = 10
): string {
  const params = new URLSearchParams({
    servicename: 'wfs',
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
    maxFeatures: String(maxFeatures),
    CQL_FILTER: `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`,
  });

  return `${WFS_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Mapper: GeoServer GeoJSON feature → Lokalplan
// ---------------------------------------------------------------------------

function mapLokalplan(feature: any): Lokalplan {
  const p = feature.properties ?? {};

  return {
    planid: p.planid?.toString() ?? feature.id ?? '',
    plannavn: p.plannavn ?? '',
    plannr: p.plannr ?? null,
    kommunenavn: p.kommunenavn ?? null,
    komnr: p.komnr ?? null,
    datoVedtaget: p.datovedt?.toString() ?? null,
    datoIkraft: p.datoikraft?.toString() ?? null,
    plandokumentLink: p.doklink ?? null,
    plantype: p.plantype?.toString() ?? null,
    status: p.status ?? null,
    anvgen: p.anvgen ?? null,
    anvendelseGenerel: p.anvendelsegenerel ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mapper: GeoServer GeoJSON feature → Kommuneplanramme
// ---------------------------------------------------------------------------

function mapKommuneplanramme(feature: any): Kommuneplanramme {
  const p = feature.properties ?? {};

  return {
    planid: p.planid?.toString() ?? feature.id ?? '',
    plannavn: p.plannavn ?? '',
    plannr: p.plannr ?? null,
    kommunenavn: p.kommunenavn ?? null,
    komnr: p.komnr ?? null,
    bebygpct: p.bebygpct ?? null,
    maxetager: p.maxetager ?? null,
    maxbygnhjd: p.maxbygnhjd ?? null,
    anvgen: p.anvgen ?? null,
    anvendelseGenerel: p.anvendelsegenerel ?? null,
    fremtidigzonestatus: p.fremtidigzonestatus ?? null,
    sforhold: p.sforhold ?? null,
    planstatus: p.planstatus ?? null,
    datoIkraft: p.datoikraft?.toString() ?? null,
    plandokumentLink: p.doklink ?? null,
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
    includeForslag = false
  ): Promise<PlandataResult> {
    if (!lngWgs84 || !latWgs84) {
      return { lokalplaner: [], fejl: 'Koordinater mangler', rawCount: 0 };
    }

    try {
      const vedtagetRes = await fetch(
        buildWfsUrl(LOKALPLAN_TYPE, lngWgs84, latWgs84),
        { headers: { Accept: 'application/json' } }
      );

      if (!vedtagetRes.ok) {
        const body = await vedtagetRes.text();
        throw new Error(`Plandata WFS HTTP ${vedtagetRes.status}: ${body.slice(0, 300)}`);
      }

      const vedtagetJson = await vedtagetRes.json() as any;
      const vedtagetFeatures: any[] = vedtagetJson?.features ?? [];

      let forslagFeatures: any[] = [];
      if (includeForslag) {
        try {
          const forslagRes = await fetch(
            buildWfsUrl(LOKALPLAN_FORSLAG_TYPE, lngWgs84, latWgs84),
            { headers: { Accept: 'application/json' } }
          );
          if (forslagRes.ok) {
            const forslagJson = await forslagRes.json() as any;
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
        fejl: lokalplaner.length === 0 ? 'Ingen lokalplan fundet for denne adresse' : null,
        rawCount: allFeatures.length,
      };
    } catch (e) {
      console.error('[Plandata] WFS-kald fejlede:', e);
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
    latWgs84: number
  ): Promise<{ ramme: Kommuneplanramme | null; fejl: string | null }> {
    if (!lngWgs84 || !latWgs84) {
      return { ramme: null, fejl: 'Koordinater mangler' };
    }

    try {
      const res = await fetch(
        buildWfsUrl(KOMMUNEPLANRAMME_TYPE, lngWgs84, latWgs84, 1),
        { headers: { Accept: 'application/json' } }
      );

      if (!res.ok) {
        throw new Error(`Plandata WFS HTTP ${res.status}`);
      }

      const json = await res.json() as any;
      const features: any[] = json?.features ?? [];

      if (!features.length) {
        return { ramme: null, fejl: 'Ingen kommuneplanramme fundet' };
      }

      return { ramme: mapKommuneplanramme(features[0]), fejl: null };
    } catch (e) {
      console.error('[Plandata] Kommuneplanramme-kald fejlede:', e);
      return { ramme: null, fejl: (e as Error).message };
    }
  }
}
