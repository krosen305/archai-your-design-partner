// SERVER-SIDE ONLY – uses DAWA's open REST API.
// NaboService — find nabobygninger via DAWA adresser-i-cirkel.
//
// Kilde: https://dawa.aws.dk/adgangsadresser?cirkel={lon},{lat},{radius_m}
// Open API, ingen auth påkrævet.
// Bruges til at estimere nærmeste nabobygnings afstand fra parcelcentrum.

const DAWA_BASE = "https://dawa.aws.dk";
const RADIUS_M = 40;
const MAX_BUILDINGS = 10;

export type NeighborBuilding = {
  adgangsadresseid: string;
  adresse: string;
  distanceM: number;
};

export type NeighborBuildingData = {
  count: number;
  nearestDistanceM: number | null;
  buildings: NeighborBuilding[];
  fejl: string | null;
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class NaboService {
  /**
   * Henter nabobygninger inden for 40 m via DAWA's åbne REST API.
   *
   * @param lat       WGS84 breddegrad for adressepunktet
   * @param lng       WGS84 længdegrad for adressepunktet
   * @param ownId     Nuværende adresses adgangsadresseid (udelades fra resultat)
   */
  static async getNaboer(lat: number, lng: number, ownId?: string): Promise<NeighborBuildingData> {
    if (!lat || !lng) {
      return { count: 0, nearestDistanceM: null, buildings: [], fejl: "Koordinater påkrævet" };
    }

    try {
      const url = new URL(`${DAWA_BASE}/adgangsadresser`);
      url.searchParams.set("cirkel", `${lng},${lat},${RADIUS_M}`);
      url.searchParams.set("format", "json");
      url.searchParams.set("struktur", "mini");
      url.searchParams.set("per_side", String(MAX_BUILDINGS + 1));

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        throw new Error(`DAWA HTTP ${res.status}`);
      }

      const raw: Array<{
        id: string;
        adressebetegnelse?: string;
        betegnelse?: string;
        x?: number;
        y?: number;
      }> = await res.json();

      const buildings: NeighborBuilding[] = raw
        .filter((a) => !ownId || a.id !== ownId)
        .map((a) => {
          const neighborLng = a.x ?? lng;
          const neighborLat = a.y ?? lat;
          return {
            adgangsadresseid: a.id,
            adresse: a.adressebetegnelse ?? a.betegnelse ?? a.id,
            distanceM: Math.round(haversineM(lat, lng, neighborLat, neighborLng)),
          };
        })
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, MAX_BUILDINGS);

      const nearestDistanceM = buildings.length > 0 ? buildings[0].distanceM : null;

      return { count: buildings.length, nearestDistanceM, buildings, fejl: null };
    } catch (e) {
      console.warn("[NaboService] fejl:", (e as Error).message);
      return {
        count: 0,
        nearestDistanceM: null,
        buildings: [],
        fejl: (e as Error).message,
      };
    }
  }
}
