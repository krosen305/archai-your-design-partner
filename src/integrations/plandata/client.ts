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
//   pdk:theme_pdk_lokalplan_vedtaget_v       ← VEDTAGNE lokalplaner (brug denne)
//   pdk:theme_pdk_lokalplan_forslag_v         ← Lokalplanforslag (under behandling)
//   pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v ← Kommuneplanrammer
//
// Koordinatsystem:
//   Plandata gemmer data i EPSG:25832 (UTM zone 32N / EUREF89).
//   Vores adresser kommer fra DAWA i WGS84 (EPSG:4326).
//   GeoServer understøtter SRID-angivelse i CQL_FILTER:
//     INTERSECTS(geometri, SRID=4326;POINT(lng lat))
//   → Ingen koordinatkonvertering nødvendig på klientsiden.
//
// Bekræftede facts om tjenesten:
//   - WFS version 1.0.0 og 1.1.0 understøttet
//   - outputFormat=application/json understøttet
//   - CQL_FILTER med INTERSECTS/DWITHIN understøttet
//   - maxFeatures parameter understøttet
//
// ⚠️  Felter (properties) i lokalplan-temaet er IKKE fuldt bekræftet mod live schema.
//     Første gang klienten kører mod produktion, log det rå svar og verificér feltnavne.
//     Se TODO-kommentarer nedenfor.

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type Lokalplan = {
  planid: string;
  plannavn: string;
  plannummer: string | null;
  kommunenavn: string | null;
  kommunekode: string | null;
  datoVedtaget: string | null;        // ISO dato for endelig vedtagelse
  plandokumentLink: string | null;    // URL til PDF-dokument på plandata.dk
  plantype: string | null;            // f.eks. "Lokalplan"
  status: string | null;              // f.eks. "Vedtaget"
  anvendelseGenerel: string | null;   // generel anvendelse (bolig, erhverv, etc.)
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

// Vedtagne lokalplaner – primært tema til compliance-analyse
const LOKALPLAN_TYPE = 'pdk:theme_pdk_lokalplan_vedtaget_v';

// Forslag til lokalplaner – sekundært (kommende planer kan påvirke byggesager)
const LOKALPLAN_FORSLAG_TYPE = 'pdk:theme_pdk_lokalplan_forslag_v';

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
    // SRID=4326 fortæller GeoServer at POINT-koordinaterne er i WGS84
    // lng (x) kommer FØR lat (y) i WFS POINT-syntaks
    CQL_FILTER: `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`,
  });

  return `${WFS_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Mapper: GeoServer GeoJSON feature → Lokalplan
// ---------------------------------------------------------------------------

function mapFeature(feature: any): Lokalplan {
  const p = feature.properties ?? {};

  // TODO: Verificér feltnavne mod live svar første gang
  // Mulige varianter baseret på Plandata-konventioner:
  //   planid       → planId, plan_id
  //   plannavn     → planNavn, plan_navn
  //   plannummer   → planNr, plan_nummer
  //   kommunenavn  → kommuneNavn, KommuneNavn
  //   plandokumentlink → plandokument_link, plandokumentLink, dokument_url
  // Log p i dev for at se de reelle felter.

  const planid: string =
    p.planid ?? p.planId ?? p.plan_id ?? feature.id ?? '';

  const plannavn: string =
    p.plannavn ?? p.planNavn ?? p.plan_navn ?? '';

  const plannummer: string | null =
    p.plannummer ?? p.planNr ?? p.plannr ?? p.plan_nummer ?? null;

  const kommunenavn: string | null =
    p.kommunenavn ?? p.KommuneNavn ?? p.kommuneNavn ?? null;

  const kommunekode: string | null =
    p.kommunekode ?? p.KommuneKode ?? null;

  // Dato for endelig vedtagelse
  const datoVedtaget: string | null =
    p.datovedtagetendelig ??
    p.datoVedtagetEndelig ??
    p.vedtagetdato ??
    p.dato_vedtaget ??
    null;

  // Link til plandokument (PDF)
  const plandokumentLink: string | null =
    p.plandokumentlink ??
    p.plandokument_link ??
    p.dokument_url ??
    p.dokumentlink ??
    // Konstruér link fra planid hvis direkte link ikke findes
    (planid ? `https://plandata.dk/document/id/${planid}` : null);

  const plantype: string | null =
    p.plantype ?? p.PlanType ?? null;

  const status: string | null =
    p.planstatus ?? p.status ?? p.Status ?? null;

  const anvendelseGenerel: string | null =
    p.anvgenerel ?? p.anvendelse_generel ?? p.anvGenereL ?? null;

  return {
    planid,
    plannavn,
    plannummer,
    kommunenavn,
    kommunekode,
    datoVedtaget,
    plandokumentLink,
    plantype,
    status,
    anvendelseGenerel,
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
   *
   * Bemærk: En adresse kan dækkes af mere end én lokalplan (f.eks. en ældre der
   * ikke er aflyst, og en nyere). Vi returnerer alle og lader kalderen sortere.
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
      // Hent vedtagne lokalplaner
      const vedtagetUrl = buildWfsUrl(LOKALPLAN_TYPE, lngWgs84, latWgs84);
      const vedtagetRes = await fetch(vedtagetUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!vedtagetRes.ok) {
        const body = await vedtagetRes.text();
        throw new Error(`Plandata WFS HTTP ${vedtagetRes.status}: ${body.slice(0, 300)}`);
      }

      const vedtagetJson = await vedtagetRes.json() as any;
      const vedtagetFeatures: any[] = vedtagetJson?.features ?? [];

      // Hent forslag hvis ønsket
      let forslagFeatures: any[] = [];
      if (includeForslag) {
        try {
          const forslagUrl = buildWfsUrl(LOKALPLAN_FORSLAG_TYPE, lngWgs84, latWgs84);
          const forslagRes = await fetch(forslagUrl, {
            headers: { Accept: 'application/json' },
          });
          if (forslagRes.ok) {
            const forslagJson = await forslagRes.json() as any;
            forslagFeatures = forslagJson?.features ?? [];
          }
        } catch {
          // Forslag er ikke kritisk – ignorer fejl
        }
      }

      const allFeatures = [...vedtagetFeatures, ...forslagFeatures];
      const lokalplaner = allFeatures.map(mapFeature);

      // TODO (dev): Log p for at verificere feltnavne mod live data:
      // if (allFeatures.length > 0) {
      //   console.log('[Plandata] Felter:', Object.keys(allFeatures[0].properties ?? {}));
      // }

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
   * Returnerer den gældende ramme der bestemmer max bebyggelsesprocent og etager.
   *
   * ⚠️  Kommuneplanrammer indeholder typisk:
   *   - Max bebyggelsesprocent (ramme_max_bebyg)
   *   - Max etager (ramme_max_etager)
   *   - Max bygningshøjde (ramme_max_byghoejde)
   *   - Anvendelse (ramme_anvend_generel)
   * Feltnavne skal verificeres mod live svar.
   */
  static async getKommuneplanrammeForKoordinat(
    lngWgs84: number,
    latWgs84: number
  ): Promise<{ ramme: any | null; fejl: string | null }> {
    const url = buildWfsUrl(
      'pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v',
      lngWgs84,
      latWgs84,
      1  // vi forventer maksimalt én ramme pr. punkt
    );

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new Error(`Plandata WFS HTTP ${res.status}`);
      }
      const json = await res.json() as any;
      const features: any[] = json?.features ?? [];

      if (!features.length) {
        return { ramme: null, fejl: 'Ingen kommuneplanramme fundet' };
      }

      return { ramme: features[0].properties, fejl: null };
    } catch (e) {
      console.error('[Plandata] Kommuneplanramme-kald fejlede:', e);
      return { ramme: null, fejl: (e as Error).message };
    }
  }
}
