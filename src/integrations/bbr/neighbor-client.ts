// NaboService — find nabobygninger inden for radius.
//
// ARCH-226: dawa.aws.dk er forbudt (DAWA er udfaset).
// Naboopslag er deaktiveret indtil en godkendt Datafordeler-kilde til
// naboer inden for radius er tilgængelig.

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

export class NaboService {
  /**
   * Henter nabobygninger inden for 40 m.
   *
   * @param lat       WGS84 breddegrad for adressepunktet
   * @param lng       WGS84 længdegrad for adressepunktet
   * @param ownId     Nuværende adresses adgangsadresseid (udelades fra resultat)
   */
  static async getNaboer(lat: number, lng: number, ownId?: string): Promise<NeighborBuildingData> {
    // ARCH-226: dawa.aws.dk er forbudt (DAWA er udfaset). Naboopslag er deaktiveret
    // indtil en godkendt Datafordeler-kilde til naboer inden for radius er tilgængelig.
    // Se https://linear.app/archai-design-partner/issue/ARCH-226
    void lat;
    void lng;
    void ownId;
    return { count: 0, nearestDistanceM: null, buildings: [], fejl: null };
  }
}
