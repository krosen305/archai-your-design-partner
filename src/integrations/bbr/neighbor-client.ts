// NaboService — find nabobygninger inden for radius.
//
// ARCH-226: dawa.aws.dk er forbudt (DAWA er udfaset).
// GeoDanmarkNaboService erstatter dette — se src/integrations/geodanmark/client.ts (ARCH-240).

import type { NeighborBuildingData } from "@/domain/contracts/analysis.types";

export type { NeighborBuilding, NeighborBuildingData } from "@/domain/contracts/analysis.types";

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
