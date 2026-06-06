import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BbrService } from "./client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

const CONFIG = {
  apiKey: "test-api-key",
  endpoint: "https://graphql.datafordeler.dk/BBR/v2",
};

const house = {
  id_lokalId: "building-house",
  byg007Bygningsnummer: 1,
  byg021BygningensAnvendelse: "131",
  byg026Opfoerelsesaar: 1937,
  byg027OmTilbygningsaar: 1967,
  byg029DatoForMidlertidigOpfoertBygning: null,
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "2",
  byg038SamletBygningsareal: 121,
  byg039BygningensSamledeBoligAreal: 129,
  byg040BygningensSamledeErhvervsAreal: null,
  byg041BebyggetAreal: 68,
  byg054AntalEtager: 2,
  byg055AfvigendeEtager: "10",
  byg056Varmeinstallation: "2",
  byg057Opvarmningsmiddel: "7",
  byg058SupplerendeVarme: "2",
  byg070Fredning: null,
  byg071BevaringsvaerdighedReference: null,
  byg094Revisionsdato: "2017-08-28T10:08:31.391205Z",
  status: "6",
  registreringTil: null,
  virkningTil: null,
};

const garage = {
  ...house,
  id_lokalId: "building-garage",
  byg007Bygningsnummer: 2,
  byg021BygningensAnvendelse: "910",
  byg026Opfoerelsesaar: 1955,
  byg027OmTilbygningsaar: null,
  byg032YdervaeggensMateriale: "5",
  byg038SamletBygningsareal: null,
  byg039BygningensSamledeBoligAreal: null,
  byg041BebyggetAreal: 15,
  byg054AntalEtager: null,
  byg055AfvigendeEtager: null,
  byg056Varmeinstallation: null,
  byg057Opvarmningsmiddel: null,
  byg058SupplerendeVarme: null,
  byg094Revisionsdato: "2017-08-28T10:12:02.267080Z",
};

describe("BbrService.getDueDiligenceData", () => {
  beforeEach(() => {
    mock.restore();
    resetMockedFetch();
  });

  it("keeps buildings, units, technical installations and semantic area fields separate", async () => {
    installSequentialJsonFetch([
      { data: { BBR_Bygning: { nodes: [garage, house] } } },
      {
        data: {
          BBR_Enhed: {
            nodes: [],
          },
        },
      },
      {
        data: {
          BBR_Enhed: {
            nodes: [
              {
                id_lokalId: "unit-house",
                bygning: "building-house",
                adresseIdentificerer: "address-id",
                enh020EnhedensAnvendelse: "131",
                enh026EnhedensSamledeAreal: 129,
                enh027ArealTilBeboelse: 129,
                enh031AntalVaerelser: 6,
                enh032Toiletforhold: "T",
                enh033Badeforhold: "V",
                enh034Koekkenforhold: "E",
                enh065AntalVandskylledeToiletter: 2,
                enh066AntalBadevaerelser: 2,
                status: "6",
                registreringTil: null,
                virkningTil: null,
              },
            ],
          },
        },
      },
      {
        data: {
          BBR_TekniskAnlaeg: {
            nodes: [
              {
                id_lokalId: "tank-1",
                tek007Anlaegsnummer: 1,
                tek020Klassifikation: "1110",
                tek024Etableringsaar: 1962,
                tek026StoerrelsesklasseOlietank: "1",
                tek027Placering: "1",
                tek028SloejfningOlietank: "3",
                tek032Stoerrelse: null,
                tek034IndholdOlietank: "10",
                tek035SloejfningsfristOlietank: null,
                tek042Revisionsdato: "2014-08-10T22:00:00.000000Z",
                tek101Gyldighedsdato: null,
                tek107PlaceringPaaSoeterritorie: "0",
                status: "6",
                registreringTil: null,
                virkningTil: null,
              },
            ],
          },
        },
      },
      {
        data: {
          BBR_Grund: {
            nodes: [
              {
                id_lokalId: "ground-1",
                gru009Vandforsyning: "1",
                gru010Afloebsforhold: "10",
                status: "6",
                registreringTil: null,
                virkningTil: null,
              },
            ],
          },
        },
      },
    ]);

    const result = await BbrService.getDueDiligenceData(
      { husnummerId: "husnummer-id", adresseId: "address-id" },
      CONFIG,
    );

    expect(result.canonicalBuildingId).toBe("building-house");
    expect(result.buildings).toHaveLength(2);
    expect(result.buildings.find((b) => b.id === "building-house")?.usage.label).toBe(
      "Række-, kæde- og klyngehus",
    );
    expect(result.buildings.find((b) => b.id === "building-house")?.totalBuildingAreaM2).toBe(121);
    expect(result.buildings.find((b) => b.id === "building-house")?.residentialAreaM2).toBe(129);
    expect(result.buildings.find((b) => b.id === "building-garage")?.outerWall.label).toBe("Træ");
    expect(result.units[0]?.rooms).toBe(6);
    expect(result.units[0]?.kitchen.label).toBe("Eget køkken med afløb");
    expect(result.technicalInstallations[0]?.classification.label).toBe("Tank");
    expect(result.technicalInstallations[0]?.decommissioning.label).toBe(
      "Tanken er tømt, afblændet og opfyldt",
    );
    expect(result.ground?.waterSupply.label).toBe("Alment vandforsyningsanlæg");
  });
});
