// PLANDATA – Danmarks officielle planregister
// WFS (Web Feature Service) via geoserver.plandata.dk
//
// Plandata WFS er offentligt tilgængeligt og bruges her som planfaglig kilde.
// Felter og typenames er verificeret mod live DescribeFeatureType/GetCapabilities
// for ARCH-244 den 2026-05-24.

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import {
  selectKommuneplanrammeForCompliance,
  selectMostSpecificDelomraade,
  selectPreferredByggefelt,
  selectPreferredWastewaterPlan,
  selectPrimaryLokalplanForPdf,
} from "./selectors";
import { logServerEvent } from "@/lib/server-logger";
import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { z } from "zod";
import type * as GeoJSON from "geojson";

// WFS er et offentligt endpoint — retry på 502/503/504, ikke 429.
const WFS_RETRY = { timeoutMs: 15_000, retries: 1, retryOnStatuses: [502, 503, 504] };

export type Lokalplan = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  datoVedtaget: string | null;
  datoIkraft: string | null;
  plandokumentLink: string | null;
  plantype: string | null;
  status: string | null;
  anvgen: number | null;
  anvendelseGenerel: string | null;
};

export type Kommuneplanramme = {
  planid: string;
  plannavn: string;
  plannr: string | null;
  kommunenavn: string | null;
  komnr: number | null;
  bebygpct: number | null;
  maxetager: number | null;
  maxbygnhjd: number | null;
  anvgen: number | null;
  anvendelseGenerel: string | null;
  fremtidigzonestatus: string | null;
  sforhold: string | null;
  planstatus: string | null;
  datoIkraft: string | null;
  plandokumentLink: string | null;
};

export type PlandataResult = {
  lokalplaner: Lokalplan[];
  fejl: string | null;
  rawCount: number;
};

export type PlanZoneType = "byzone" | "landzone" | "sommerhusomraade" | "unknown";

export type PlanContextResult = {
  zoneType: PlanZoneType | null;
  futureZoneType: PlanZoneType | null;
  landzonePermitRequired: boolean | null;
  lokalplanDelomraadeId: string | null;
  lokalplanByggefeltPresent: boolean | null;
  withinBuildingField: boolean | null;
  buildingFieldSourceId: string | null;
  wastewaterPlanStatus: string | null;
  sewerAreaType: string | null;
  sourceLokalplanId: string | null;
  sourceKommuneplanId: string | null;
  zoneSourcePlanId: string | null;
  wastewaterSourceId: string | null;
};

type Koordinat = { lat: number; lng: number };

type Delomraade = {
  id: string | null;
  planid: string | null;
  lokplanId: string | null;
  delnr: string | null;
  datoVedtaget: string | null;
  datoIkraft: string | null;
  status: string | null;
  zoneStatus: string | null;
};

type Byggefelt = {
  id: string | null;
  planid: string | null;
  lokplanId: string | null;
  delnr: string | null;
  datoVedtaget: string | null;
  datoIkraft: string | null;
  status: string | null;
};

type ZonekortFeature = {
  planid: string | null;
  zone: number | null;
  zonestatus: string | null;
};

type WastewaterPlan = {
  uuid: string | null;
  objektId: string | null;
  datoVedtaget: string | null;
  datoIkraft: string | null;
  status: string | null;
  name: string | null;
  typeA: number | null;
  valueA: string | null;
  typeB: number | null;
  valueB: string | null;
};

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";

const LOKALPLAN_TYPE = "pdk:theme_pdk_lokalplan_vedtaget";
const LOKALPLAN_FORSLAG_TYPE = "pdk:theme_pdk_lokalplan_forslag";
const KOMMUNEPLANRAMME_TYPE = "pdk:theme_pdk_kommuneplanramme_alle_vedtaget_v";
const ZONEKORT_TYPE = "pdk:theme_pdk_zonekort_v";
const LOKALPLAN_DELOMRAADE_TYPE = "pdk:theme_pdk_lokalplandelomraade_vedtaget";
const BYGGEFELT_TYPE = "pdk:theme_pdk_byggefelt_vedtaget";
const KLOAKOPLAND_TYPE = "pdk:theme_pdk_kloakopland_vedtaget_v";

const PLANDATA_EXT_SOURCE_URL = `${WFS_BASE}?service=WFS&request=GetFeature&typeName=${encodeURIComponent(
  [ZONEKORT_TYPE, LOKALPLAN_DELOMRAADE_TYPE, BYGGEFELT_TYPE, KLOAKOPLAND_TYPE].join(","),
)}`;

type PlandataWfsFeature = {
  id?: string;
  properties: Record<string, unknown> | null;
};

const plandataWfsFeatureSchema = z.object({
  id: z.string().optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const plandataWfsResponseSchema = z.object({
  features: z.array(plandataWfsFeatureSchema).optional().default([]),
});

function parseWfsResponse(payload: unknown): PlandataWfsFeature[] {
  return plandataWfsResponseSchema.parse(payload).features;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function wfsPolygonFilter(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string | null {
  const feature = geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (!feature) return null;

  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;

  const ring = geom.coordinates[0];
  if (!ring || ring.length < 4) return null;

  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${wkt}))`;
}

function normalizeZoneType(value: string | number | null | undefined): PlanZoneType | null {
  if (value == null) return null;

  if (typeof value === "number") {
    if (value === 1) return "byzone";
    if (value === 2) return "landzone";
    if (value === 3) return "sommerhusomraade";
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("byzone") || normalized === "1") return "byzone";
  if (normalized.includes("landzone") || normalized === "2") return "landzone";
  if (normalized.includes("sommerhus") || normalized === "3") return "sommerhusomraade";
  return "unknown";
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

function mapZonekortFeature(feature: PlandataWfsFeature): ZonekortFeature {
  const p = feature.properties ?? {};
  return {
    planid: str(p.planid),
    zone: num(p.zone),
    zonestatus: str(p.zonestatus),
  };
}

function mapDelomraade(feature: PlandataWfsFeature): Delomraade {
  const p = feature.properties ?? {};
  return {
    id: str(p.id) ?? feature.id ?? null,
    planid: str(p.planid),
    lokplanId: str(p.lokplan_id),
    delnr: str(p.delnr),
    datoVedtaget: str(p.datovedt),
    datoIkraft: str(p.datoikraft),
    status: str(p.status),
    zoneStatus: str(p.zonestatus),
  };
}

function mapByggefelt(feature: PlandataWfsFeature): Byggefelt {
  const p = feature.properties ?? {};
  return {
    id: str(p.id) ?? feature.id ?? null,
    planid: str(p.planid),
    lokplanId: str(p.lokplan_id),
    delnr: str(p.delnr),
    datoVedtaget: str(p.datovedt),
    datoIkraft: str(p.datoikraft),
    status: str(p.status),
  };
}

function mapWastewaterPlan(feature: PlandataWfsFeature): WastewaterPlan {
  const p = feature.properties ?? {};
  return {
    uuid: str(p.uuid),
    objektId: str(p.objekt_id),
    datoVedtaget: str(p.datovedt),
    datoIkraft: str(p.datoikraft),
    status: str(p.status),
    name: str(p.navn1201),
    typeA: num(p.type1201a),
    valueA: str(p.vaerd1201a),
    typeB: num(p.type1201b),
    valueB: str(p.vaerd1201b),
  };
}

function buildSpatialFilter(
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): string {
  if (polygon) {
    const polygonWkt = wfsPolygonFilter(polygon);
    if (polygonWkt) {
      return `INTERSECTS(geometri,SRID=4326;${polygonWkt})`;
    }
  }

  return `INTERSECTS(geometri,SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}))`;
}

function buildWfsUrl(typeName: string, cqlFilter: string, maxFeatures = 25): string {
  const params = new URLSearchParams({
    servicename: "wfs",
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
    CQL_FILTER: cqlFilter,
  });

  return `${WFS_BASE}?${params.toString()}`;
}

function buildPlanIdFilter(planId: string): string {
  return `lokplan_id=${planId} OR planid=${planId}`;
}

async function fetchFeatures(typeName: string, cqlFilter: string, maxFeatures = 25) {
  const res = await fetchWithRetry(
    buildWfsUrl(typeName, cqlFilter, maxFeatures),
    { headers: { Accept: "application/json" } },
    WFS_RETRY,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plandata WFS HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  return parseWfsResponse(await res.json());
}

async function countByPlanId(typeName: string, planId: string): Promise<number> {
  const features = await fetchFeatures(typeName, buildPlanIdFilter(planId), 100);
  return features.length;
}

function deriveWastewaterStatus(entry: WastewaterPlan | null): string | null {
  if (!entry) return null;
  return entry.status ?? entry.name ?? null;
}

function deriveSewerAreaType(entry: WastewaterPlan | null): string | null {
  if (!entry) return null;

  if (entry.valueA) return entry.valueA;
  if (entry.valueB) return entry.valueB;
  if (entry.typeA !== null) return `type_${entry.typeA}`;
  if (entry.typeB !== null) return `type_${entry.typeB}`;
  return null;
}

export class PlandataService {
  static async fetchKloakoplandForPoint(
    latWgs84: number,
    lngWgs84: number,
  ): Promise<"separat" | "faelles" | null> {
    const { normalizeKloakoplandType } = await import("./normalize-kloakopland");
    const cqlFilter = `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`;
    const features = await fetchFeatures(KLOAKOPLAND_TYPE, cqlFilter, 10);
    const entries = features.map(mapWastewaterPlan);
    const selected = selectPreferredWastewaterPlan(
      entries.map((e) => ({ ...e, sourceId: e.uuid ?? e.objektId })),
    );
    if (!selected) return null;
    return (
      normalizeKloakoplandType(selected.valueA) ?? normalizeKloakoplandType(selected.valueB) ?? null
    );
  }

  static async getLokalplanerForKoordinat(
    lngWgs84: number,
    latWgs84: number,
    includeForslag = false,
  ): Promise<PlandataResult> {
    if (!lngWgs84 || !latWgs84) {
      return { lokalplaner: [], fejl: "Koordinater mangler", rawCount: 0 };
    }

    try {
      const cqlFilter = `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`;
      const vedtagetFeatures = await fetchFeatures(LOKALPLAN_TYPE, cqlFilter, 10);

      let forslagFeatures: PlandataWfsFeature[] = [];
      if (includeForslag) {
        try {
          forslagFeatures = await fetchFeatures(LOKALPLAN_FORSLAG_TYPE, cqlFilter, 10);
        } catch {
          forslagFeatures = [];
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

  static async getKommuneplanrammeForKoordinat(
    lngWgs84: number,
    latWgs84: number,
  ): Promise<{ ramme: Kommuneplanramme | null; fejl: string | null }> {
    if (!lngWgs84 || !latWgs84) {
      return { ramme: null, fejl: "Koordinater mangler" };
    }

    try {
      const cqlFilter = `INTERSECTS(geometri,SRID=4326;POINT(${lngWgs84} ${latWgs84}))`;
      const features = await fetchFeatures(KOMMUNEPLANRAMME_TYPE, cqlFilter, 10);

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

  static async getPlanContextForParcel(input: {
    koordinat: Koordinat | null;
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null;
    lokalplaner?: Lokalplan[];
    kommuneplanramme?: Kommuneplanramme | null;
  }): Promise<SourceResult<PlanContextResult>> {
    const { koordinat, parcelPolygon, lokalplaner = [], kommuneplanramme = null } = input;

    if (!koordinat) {
      return makeErrorResult<PlanContextResult>(new Error("Koordinater mangler"), {
        kilde: "plandata_ext",
        sourceUrl: PLANDATA_EXT_SOURCE_URL,
      });
    }

    try {
      const spatialFilter = buildSpatialFilter(koordinat, parcelPolygon);
      const [zoneFeatures, delomraadeFeatures, byggefeltHits, wastewaterFeatures] =
        await Promise.all([
          fetchFeatures(ZONEKORT_TYPE, spatialFilter, 10),
          fetchFeatures(LOKALPLAN_DELOMRAADE_TYPE, spatialFilter, 25),
          fetchFeatures(BYGGEFELT_TYPE, spatialFilter, 25),
          fetchFeatures(KLOAKOPLAND_TYPE, spatialFilter, 10),
        ]);

      const zone = zoneFeatures.map(mapZonekortFeature)[0] ?? null;
      const delomraader = delomraadeFeatures.map(mapDelomraade);
      const primaryLokalplanId =
        selectPrimaryLokalplanForPdf(lokalplaner)?.planid ?? kommuneplanramme?.planid ?? null;
      const selectedDelomraade = selectMostSpecificDelomraade(delomraader, primaryLokalplanId);

      const byggefelter = byggefeltHits.map(mapByggefelt);
      const preferredByggefelt = selectPreferredByggefelt(
        byggefelter,
        selectedDelomraade?.lokplanId ?? primaryLokalplanId,
        selectedDelomraade?.delnr ?? null,
      );

      let lokalplanByggefeltPresent: boolean | null = null;
      const localplanIdForByggefelt =
        selectedDelomraade?.lokplanId ??
        primaryLokalplanId ??
        preferredByggefelt?.lokplanId ??
        null;
      if (localplanIdForByggefelt) {
        lokalplanByggefeltPresent =
          (await countByPlanId(BYGGEFELT_TYPE, localplanIdForByggefelt)) > 0;
      }

      const wastewaterEntries = wastewaterFeatures.map(mapWastewaterPlan);
      const selectedWastewater = selectPreferredWastewaterPlan(
        wastewaterEntries.map((entry) => ({
          ...entry,
          sourceId: entry.uuid ?? entry.objektId,
        })),
      ) as (WastewaterPlan & { sourceId: string | null }) | null;

      const zoneType =
        normalizeZoneType(zone?.zonestatus ?? zone?.zone) ??
        normalizeZoneType(selectedDelomraade?.zoneStatus) ??
        normalizeZoneType(kommuneplanramme?.fremtidigzonestatus);

      const futureZoneType =
        normalizeZoneType(selectedDelomraade?.zoneStatus) ??
        normalizeZoneType(kommuneplanramme?.fremtidigzonestatus);

      const totalFeatures =
        zoneFeatures.length +
        delomraadeFeatures.length +
        byggefeltHits.length +
        wastewaterFeatures.length;

      return makeOkResult<PlanContextResult>(
        {
          zoneType: zoneType ?? null,
          futureZoneType: futureZoneType ?? null,
          landzonePermitRequired: zoneType === "landzone",
          lokalplanDelomraadeId: selectedDelomraade?.id ?? null,
          lokalplanByggefeltPresent,
          withinBuildingField:
            lokalplanByggefeltPresent === null
              ? null
              : lokalplanByggefeltPresent
                ? byggefeltHits.length > 0
                : null,
          buildingFieldSourceId: preferredByggefelt?.id ?? null,
          wastewaterPlanStatus: deriveWastewaterStatus(selectedWastewater),
          sewerAreaType: deriveSewerAreaType(selectedWastewater),
          sourceLokalplanId:
            selectedDelomraade?.lokplanId ??
            primaryLokalplanId ??
            preferredByggefelt?.lokplanId ??
            null,
          sourceKommuneplanId: kommuneplanramme?.planid ?? null,
          zoneSourcePlanId: zone?.planid ?? null,
          wastewaterSourceId: selectedWastewater?.uuid ?? selectedWastewater?.objektId ?? null,
        },
        {
          kilde: "plandata_ext",
          sourceUrl: PLANDATA_EXT_SOURCE_URL,
          rawFeatureCount: totalFeatures,
        },
      );
    } catch (e) {
      logServerEvent({
        module: "plandata/client",
        operation: "getPlanContextForParcel",
        severity: "degraded",
        message: "Udvidet plandata-kald fejlede",
        error: e,
      });
      return makeErrorResult<PlanContextResult>(e, {
        kilde: "plandata_ext",
        sourceUrl: PLANDATA_EXT_SOURCE_URL,
      });
    }
  }
}
