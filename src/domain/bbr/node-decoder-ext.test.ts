import { describe, expect, it } from "bun:test";
import { parseBbrBygninger } from "@/domain/bbr/node-decoder";

const baseNode = {
  id_lokalId: "abc123",
  byg007Bygningsnummer: 1,
  byg021BygningensAnvendelse: "120",
  byg024AntalLejlighederMedKoekken: null,
  byg025AntalLejlighederUdenKoekken: null,
  byg026Opfoerelsesaar: 1965,
  byg027OmTilbygningsaar: 1985,
  byg029DatoForMidlertidigOpfoertBygning: null,
  byg030Vandforsyning: "1",
  byg031Afloebsforhold: "2",
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "1",
  byg038SamletBygningsareal: 120,
  byg039BygningensSamledeBoligAreal: 110,
  byg040BygningensSamledeErhvervsAreal: null,
  byg041BebyggetAreal: 80,
  byg054AntalEtager: 1,
  byg055AfvigendeEtager: null,
  byg056Varmeinstallation: "1",
  byg057Opvarmningsmiddel: "8",
  byg070Fredning: null,
  byg071BevaringsvaerdighedReference: null,
  byg094Revisionsdato: "2024-01-01",
  status: "6",
  registreringFra: "2020-01-01",
  registreringTil: null,
  virkningFra: "2020-01-01",
  virkningTil: null,
};

describe("parseBbrBygninger with new byg030/byg031 fields", () => {
  it("parses byg030Vandforsyning and byg031Afloebsforhold", () => {
    const result = parseBbrBygninger({ BBR_Bygning: { nodes: [baseNode] } });
    expect(result).toHaveLength(1);
    expect(result[0].byg030Vandforsyning).toBe("1");
    expect(result[0].byg031Afloebsforhold).toBe("2");
  });

  it("accepts null for both new fields", () => {
    const node = { ...baseNode, byg030Vandforsyning: null, byg031Afloebsforhold: null };
    const result = parseBbrBygninger({ BBR_Bygning: { nodes: [node] } });
    expect(result[0].byg030Vandforsyning).toBeNull();
    expect(result[0].byg031Afloebsforhold).toBeNull();
  });
});
