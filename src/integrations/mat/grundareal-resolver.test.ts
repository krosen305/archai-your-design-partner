import { describe, it, expect, mock, beforeEach } from "bun:test";
import { GrundarealResolver } from "./grundareal-resolver";

const MOCK_CONFIG = {
  apiKey: "test",
  ebrEndpoint: "https://ebr.test",
  matEndpoint: "https://mat.test",
};

function mockFetchSequence(jsonResponses: any[]) {
  let i = 0;
  globalThis.fetch = mock(async () => {
    const json = jsonResponses[i++] ?? { data: {} };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(json),
    } as unknown as Response;
  }) as any;
}

beforeEach(() => {
  globalThis.fetch = fetch;
});

describe("GrundarealResolver (ARCH-223)", () => {
  it("route 1 (ebr_husnummer_sfe): finder grundareal via EBR husnummer → SFE → jordstykke", async () => {
    mockFetchSequence([
      // EBR husnummer → BFE
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "2073922" }] } } },
      // MAT SFE → id_lokalId
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-123" }] } } },
      // MAT Jordstykke
      { data: { MAT_Jordstykke: { nodes: [{ id_lokalId: "js-1", matrikelnummer: "48a", ejerlavLokalId: "ejl-1", registreretAreal: 441, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null }] } } },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "0a3f507d-4cf9-32b8-e044-0003ba298018", adresseid: "0a3f50a6-34da-32b8-e044-0003ba298018" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBe(441);
    expect(result.source).toBe("ebr_husnummer_sfe");
    expect(result.bfeNr).toBe("2073922");
    expect(result.fejl).toBeNull();
  });

  it("summerer grundareal fra flere jordstykker under samme SFE", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "9999" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-multi" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              { id_lokalId: "js-1", matrikelnummer: "1a", ejerlavLokalId: "e1", registreretAreal: 300, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null },
              { id_lokalId: "js-2", matrikelnummer: "1b", ejerlavLokalId: "e1", registreretAreal: 141, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null },
            ],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "addr-1", adresseid: "adr-1" },
      MOCK_CONFIG,
    );
    expect(result.grundareal).toBe(441);
    expect(result.jordstykker).toHaveLength(2);
  });

  it("route 2 (ebr_adresse_ejerlejlighed): finder grundareal via EBR adresse → Ejerlejlighed → SFE → jordstykke", async () => {
    mockFetchSequence([
      // Route 1 EBR husnummer: ingen BFE
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
      // Route 2 EBR adresse: BFE for ejerlejlighed
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "289814" }] } } },
      // MAT Ejerlejlighed → samletFastEjendomLokalId
      { data: { MAT_Ejerlejlighed: { nodes: [{ samletFastEjendomLokalId: "sfe-parent" }] } } },
      // MAT Jordstykke via SFE
      { data: { MAT_Jordstykke: { nodes: [{ id_lokalId: "js-ej", matrikelnummer: "10st", ejerlavLokalId: "e2", registreretAreal: 3580, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null }] } } },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "addr-ost", adresseid: "adr-ost" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBe(3580);
    expect(result.source).toBe("ebr_adresse_ejerlejlighed");
    expect(result.samletFastEjendomLokalId).toBe("sfe-parent");
  });

  it("returnerer fejl når ingen ruter finder data", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "ingen", adresseid: "ingen" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBeNull();
    expect(result.fejl).toBeTruthy();
  });

  it("strandbeskyttelse = true når omfang er non-null og ikke 'Ingen'", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "1111" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-s" }] } } },
      { data: { MAT_Jordstykke: { nodes: [{ id_lokalId: "js-s", matrikelnummer: "1a", ejerlavLokalId: "e1", registreretAreal: 500, strandbeskyttelse_omfang: "Hele arealet", fredskov_omfang: null, klitfredning_omfang: null }] } } },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "a1", adresseid: "a2" },
      MOCK_CONFIG,
    );

    expect(result.jordstykker[0].strandbeskyttelse).toBe(true);
  });

  it("deduplicerer jordstykker med samme id_lokalId", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "2222" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-dup" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              { id_lokalId: "js-dup", matrikelnummer: "1a", ejerlavLokalId: "e1", registreretAreal: 200, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null },
              { id_lokalId: "js-dup", matrikelnummer: "1a", ejerlavLokalId: "e1", registreretAreal: 200, strandbeskyttelse_omfang: null, fredskov_omfang: null, klitfredning_omfang: null },
            ],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "b1", adresseid: "b2" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBe(200);
    expect(result.jordstykker).toHaveLength(1);
  });
});
