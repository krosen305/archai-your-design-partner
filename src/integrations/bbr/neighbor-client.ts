// NaboService — find nabobygninger inden for radius.
//
// ARCH-226: dawa.aws.dk er forbudt (DAWA er udfaset).
// GeoDanmarkNaboService erstatter dette — se src/integrations/geodanmark/client.ts (ARCH-240).

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
  kilde: string | null;             // "geodanmark" | null — tri-state source tag
  accessRoadNearby: boolean | null; // true/false/null — null = ukendt
  roadDistanceM: number | null;     // meter til nærmeste vej, null = ukendt
};

export class NaboService {
  /**
   * Henter nabobygninger inden for 40 m.
   *
   * @deprecated Erstattet af GeoDanmarkNaboService (ARCH-240). Returnerer tom liste.
   *
   * @param lat       WGS84 breddegrad for adressepunktet
   * @param lng       WGS84 længdegrad for adressepunktet
   * @param ownId     Nuværende adresses adgangsadresseid (udelades fra resultat)
   */
  static async getNaboer(lat: number, lng: number, ownId?: string): Promise<NeighborBuildingData> {
    void lat;
    void lng;
    void ownId;
    return {
      count: 0,
      nearestDistanceM: null,
      buildings: [],
      fejl: null,
      kilde: null,
      accessRoadNearby: null,
      roadDistanceM: null,
    };
  }
}
