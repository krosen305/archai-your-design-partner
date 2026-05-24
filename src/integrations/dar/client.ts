// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// DAR (Danmarks Adresseregister) GraphQL v1 via Datafordeler.
//
// Schema verificeret mod https://graphql.datafordeler.dk/DAR/v1/schema (ARCH-21, 2026-04-30).
//
// Relevant type-kæde for en adresse:
//   DAR_Adresse        – adressebetegnelse, husnummer (FK → DAR_Husnummer.id_lokalId)
//   DAR_Husnummer      – adgangsadressebetegnelse, adgangspunkt (FK → DAR_Adressepunkt),
//                        postnummer (FK → DAR_Postnummer), navngivenVej (FK → DAR_NavngivenVej),
//                        kommuneinddeling (FK → kommuneregister udenfor DAR), jordstykke (FK)
//   DAR_Postnummer     – postnr (4-cifret kode), navn (bynavn)
//   DAR_Adressepunkt   – position (SpatialPointEpsg25832Type) → wkt i EPSG:25832
//
// Datafordeler GraphQL-begrænsninger (bekræftet):
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   - virkningstid PÅKRÆVET (DAF-GQL-0009)
//   - Ingen aliases (DAF-GQL-0008)
//   - filterRequirement: id_lokalId eller datafordelerRowId PÅKRÆVET i where
//
// Begrænsninger i DAR v1 schema:
//   - ejerlavskode/matrikelnummer: IKKE i DAR – kun jordstykke (FK-string til Matrikelregistret)
//   - kommunenavn: IKKE i DAR direkte – kommuneinddeling er FK udenfor DAR
//   - Koordinater: EPSG:25832 WKT på DAR_Adressepunkt.position.wkt – kræver UTM→WGS84 konvertering

import { getEnvRequired } from "@/lib/env";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import { logServerEvent } from "@/lib/server-logger";
import { utm32ToWgs84 } from "@/lib/geometry-utils";
import { runtimeConfig } from "@/lib/runtime-config";
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type DarClientConfig = {
  apiKey?: string;
  endpoint?: string;
  // Skip DAR_Adressepunkt + DAR_Postnummer when caller only needs adgangsadresseid/matrikel/grundareal
  skipKoordinaterOgPostnummer?: boolean;
};

function getConfig(explicit?: DarClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint = explicit?.endpoint ?? runtimeConfig.integrations.datafordeler.darEndpoint;

  if (!apiKey) {
    throw new Error(
      "DAR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// Output type – kompatibel med DawaAddressDetails for drop-in i DAWA Phase 2
//
// ejerlavskode + matrikelnummer hentes via DAR_Husnummer.jordstykke → MAT_Jordstykke → MAT_Ejerlav.
// kommunenavn forbliver tom string (kræver kommuneregister udenfor DAR).
// ---------------------------------------------------------------------------

export type DarAddressDetails = {
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string; // tom string – kommuneinddeling FK er ikke en kode
  kommunenavn: string; // tom string – kræver register udenfor DAR
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null; // registreretAreal fra MAT_Jordstykke (hentes i samme kald som matrikelnummer)
  samletFastEjendomLokalId: string | null; // MAT_Jordstykke → MAT_SamletFastEjendom (bruges til BFE-opslag uden EBR)
};

// ---------------------------------------------------------------------------
// GraphQL queries (feltnavne verificeret mod live DAR v1 schema)
// ---------------------------------------------------------------------------

// Kald 1: DAR_Adresse – henter adressebetegnelse og husnummer-FK
const ADRESSE_QUERY = `
query GetDarAdresse($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  DAR_Adresse(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      id_lokalId
      adressebetegnelse
      husnummer
      etagebetegnelse
      doerbetegnelse
      status
    }
  }
}`;

// Kald 2: DAR_Husnummer – henter FK-referencer til adressepunkt, postnummer mv.
const HUSNUMMER_QUERY = `
query GetDarHusnummer($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  DAR_Husnummer(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      id_lokalId
      adgangsadressebetegnelse
      husnummertekst
      adgangspunkt
      postnummer
      kommuneinddeling
      navngivenVej
      jordstykke
      status
    }
  }
}`;

// Kald 3a: DAR_Postnummer – henter postnr (4-cifret kode) og bynavn
const POSTNUMMER_QUERY = `
query GetDarPostnummer($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  DAR_Postnummer(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      postnr
      navn
    }
  }
}`;

// Kald 3b: DAR_Adressepunkt – henter koordinat som WKT i EPSG:25832
const ADRESSEPUNKT_QUERY = `
query GetDarAdressepunkt($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  DAR_Adressepunkt(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      position { wkt }
    }
  }
}`;

// Kald 3c: MAT_Jordstykke – henter matrikelnummer + ejerlavLokalId via jordstykke-FK fra DAR_Husnummer.
// OBS: Kald går til MAT endpoint (v2), ikke DAR.
const MAT_JORDSTYKKE_QUERY = `
query GetMatJordstykke($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Jordstykke(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      matrikelnummer
      ejerlavLokalId
      registreretAreal
      samletFastEjendomLokalId
    }
  }
}`;

// Kald 4: MAT_Ejerlav – henter numerisk ejerlavskode via ejerlavLokalId fra MAT_Jordstykke.
const MAT_EJERLAV_QUERY = `
query GetMatEjerlav($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Ejerlav(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      ejerlavskode
      ejerlavsnavn
    }
  }
}`;

// ---------------------------------------------------------------------------
// Koordinatkonvertering: EPSG:25832 (UTM 32N) → WGS84
//
// DAR_Adressepunkt.position.wkt returnerer f.eks. "POINT(725000.12 6174000.34)"
// i EPSG:25832. Ingen ekstern afhængighed – standard Transverse Mercator invers.
// ---------------------------------------------------------------------------

function parseWktPoint(wkt: string | null | undefined): { x: number; y: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*([\d.+-]+)\s+([\d.+-]+)\s*\)/i);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

// ---------------------------------------------------------------------------
// Hjælpefunktion: GraphQL-kald mod Datafordeler
// ---------------------------------------------------------------------------

type DarAdresseNode = {
  id_lokalId: string | null;
  adressebetegnelse: string | null;
  husnummer: string | null;
  etagebetegnelse: string | null;
  doerbetegnelse: string | null;
  status: string | null;
};
type DarHusnummerNode = {
  id_lokalId: string | null;
  adgangsadressebetegnelse: string | null;
  husnummertekst: string | null;
  adgangspunkt: string | null;
  postnummer: string | null;
  kommuneinddeling: string | null;
  navngivenVej: string | null;
  jordstykke: string | null;
  status: string | null;
};
type DarPostnummerNode = { postnr: string | null; navn: string | null };
type DarAdressepunktNode = { position: { wkt: string | null } | null };
type MatJordstykkeByIdNode = {
  matrikelnummer: string | null;
  ejerlavLokalId: string | null;
  registreretAreal: number | null;
  samletFastEjendomLokalId: string | null;
};
type MatEjerlavByIdNode = { ejerlavskode: number | null; ejerlavsnavn: string | null };

// ---------------------------------------------------------------------------
// MAT URL builder — MAT endpoint er forskellig fra DAR, men bruger samme API-nøgle
// ---------------------------------------------------------------------------

function getMatUrl(apiKey: string): URL {
  const url = new URL(runtimeConfig.integrations.datafordeler.matEndpoint);
  url.searchParams.set("apiKey", apiKey);
  return url;
}

// ---------------------------------------------------------------------------
// DarService
// ---------------------------------------------------------------------------

export class DarService {
  /**
   * Henter adressedetaljer fra DAR GraphQL.
   * Henter adressedetaljer til brug efter addressevalg (erstatter DawaService, DAWA Phase 2+3).
   *
   * Kæde: DAR_Adresse → DAR_Husnummer → [DAR_Postnummer + DAR_Adressepunkt + MAT_Jordstykke] → MAT_Ejerlav
   *
   * @param darAdresseLokalId  DAR's id_lokalId for adressen (= DAWA's adresseid)
   *
   * Kendte begrænsninger vs. DAWA:
   *   - kommunenavn returneres som '' (kræver kommuneregister udenfor DAR)
   */
  static async getAddressDetails(
    darAdresseLokalId: string,
    config?: DarClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<DarAddressDetails> {
    const id = darAdresseLokalId.trim();
    if (!id) throw new Error("DAR: darAdresseLokalId er påkrævet");

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);
    const bitemporalArgs = currentBitemporalArgs();

    // ── Kald 1: DAR_Adresse ─────────────────────────────────────────────────
    const adresseData = await datafordelerGraphqlFetch<{
      DAR_Adresse: { nodes: DarAdresseNode[] };
    }>(url, ADRESSE_QUERY, { id, ...bitemporalArgs }, "DAR_Adresse", {
      trace,
      phase: "address_enrichment",
    });
    const adresseNodes = adresseData.DAR_Adresse.nodes;
    if (!adresseNodes.length) {
      throw new Error(`DAR_Adresse ikke fundet for id_lokalId: ${id}`);
    }
    const adresse = adresseNodes[0];
    const husnummerFK: string = adresse.husnummer ?? "";

    // ── Kald 2: DAR_Husnummer ───────────────────────────────────────────────
    let husnummer: DarHusnummerNode | null = null;
    if (husnummerFK) {
      const husnummerData = await datafordelerGraphqlFetch<{
        DAR_Husnummer: { nodes: DarHusnummerNode[] };
      }>(url, HUSNUMMER_QUERY, { id: husnummerFK, ...bitemporalArgs }, "DAR_Husnummer", {
        trace,
        phase: "address_enrichment",
      });
      husnummer = husnummerData.DAR_Husnummer?.nodes?.[0] ?? null;
    }

    const adgangspunktFK: string = husnummer?.adgangspunkt ?? "";
    const postnummerFK: string = husnummer?.postnummer ?? "";
    const jordstykkeFK: string = husnummer?.jordstykke ?? "";
    const matUrl = getMatUrl(apiKey);

    // ── Kald 3a + 3b + 3c: postnummer, adressepunkt og MAT_Jordstykke (parallelt) ─
    // 3a + 3b springes over ved enrichment-only kald (koordinater og postnr kommer fra GSearch)
    const skip = config?.skipKoordinaterOgPostnummer ?? false;
    const [postnummerData, adressepunktData, jordstykkeData] = await Promise.all([
      postnummerFK && !skip
        ? datafordelerGraphqlFetch<{ DAR_Postnummer: { nodes: DarPostnummerNode[] } }>(
            url,
            POSTNUMMER_QUERY,
            { id: postnummerFK, ...bitemporalArgs },
            "DAR_Postnummer",
            { trace, phase: "address_enrichment" },
          )
        : Promise.resolve(null),
      adgangspunktFK && !skip
        ? datafordelerGraphqlFetch<{ DAR_Adressepunkt: { nodes: DarAdressepunktNode[] } }>(
            url,
            ADRESSEPUNKT_QUERY,
            { id: adgangspunktFK, ...bitemporalArgs },
            "DAR_Adressepunkt",
            { trace, phase: "address_enrichment" },
          )
        : Promise.resolve(null),
      jordstykkeFK
        ? datafordelerGraphqlFetch<{ MAT_Jordstykke: { nodes: MatJordstykkeByIdNode[] } }>(
            matUrl,
            MAT_JORDSTYKKE_QUERY,
            { id: jordstykkeFK, ...bitemporalArgs },
            "MAT_Jordstykke_by_id",
            { trace, phase: "address_enrichment" },
          ).catch((e: Error) => {
            logServerEvent({
              module: "dar/client",
              operation: "getAddressDetails",
              severity: "fatal",
              message: "MAT_Jordstykke fejlede for jordstykkeFK",
              metadata: { jordstykkeFK },
              error: e,
            });
            return null;
          })
        : (() => {
            logServerEvent({
              module: "dar/client",
              operation: "getAddressDetails",
              severity: "degraded",
              message: "DAR_Husnummer.jordstykke er tom — grundareal og matrikeldata utilgængeligt",
            });
            return Promise.resolve(null);
          })(),
    ]);

    const postnummerNode = postnummerData?.DAR_Postnummer?.nodes?.[0] ?? null;
    const adressepunktNode = adressepunktData?.DAR_Adressepunkt?.nodes?.[0] ?? null;
    const jordstykkeNode = jordstykkeData?.MAT_Jordstykke?.nodes?.[0] ?? null;
    if (jordstykkeFK && !jordstykkeNode) {
      logServerEvent({
        module: "dar/client",
        operation: "getAddressDetails",
        severity: "fatal",
        message: "MAT_Jordstykke returnerede ingen nodes — id_lokalId matchede ingenting",
        metadata: { jordstykkeFK },
      });
    }
    const matEjerlavLokalId: string = jordstykkeNode?.ejerlavLokalId ?? "";
    const matrikelnummer: string | null = jordstykkeNode?.matrikelnummer ?? null;
    const grundareal: number | null = jordstykkeNode?.registreretAreal ?? null;
    const samletFastEjendomLokalId: string | null = jordstykkeNode?.samletFastEjendomLokalId ?? null;

    // ── Kald 4: MAT_Ejerlav (afhænger af ejerlavLokalId fra kald 3c) ────────
    let ejerlavskode: number | null = null;
    if (matEjerlavLokalId) {
      try {
        const ejerlavData = await datafordelerGraphqlFetch<{
          MAT_Ejerlav: { nodes: MatEjerlavByIdNode[] };
        }>(
          matUrl,
          MAT_EJERLAV_QUERY,
          { id: matEjerlavLokalId, ...bitemporalArgs },
          "MAT_Ejerlav_by_id",
          { trace, phase: "address_enrichment" },
        );
        ejerlavskode = ejerlavData.MAT_Ejerlav.nodes[0]?.ejerlavskode ?? null;
      } catch (e) {
        logServerEvent({
          module: "dar/client",
          operation: "getAddressDetails",
          severity: "degraded",
          message: "MAT_Ejerlav opslag fejlede — ejerlavskode forbliver null",
          error: e,
        });
      }
    }

    // ── Koordinatkonvertering: EPSG:25832 WKT → WGS84 ───────────────────────
    let koordinater = { lat: 0, lng: 0 };
    const wktPoint = parseWktPoint(adressepunktNode?.position?.wkt);
    if (wktPoint) {
      koordinater = utm32ToWgs84(wktPoint.x, wktPoint.y);
    }

    // Udled kommunekode + kommunenavn fra ejerlavskode (KKK × 1000 + løbenummer).
    // Ejerlavskode er primær kilde; falder tilbage til "" når ejerlavskode mangler.
    const { kommunekodeFraEjerlavskode, kommunenavnFraKode } = await import("@/lib/kommuner");
    const kommunekode: string = ejerlavskode ? kommunekodeFraEjerlavskode(ejerlavskode) : "";
    const kommunenavn: string = kommunekode ? kommunenavnFraKode(kommunekode) : "";

    return {
      adresse: adresse.adressebetegnelse ?? "",
      postnr: postnummerNode?.postnr ?? "",
      postnrnavn: postnummerNode?.navn ?? "",
      kommunekode,
      kommunenavn,
      matrikel: matrikelnummer,
      adgangsadresseid: husnummerFK,
      koordinater,
      bbrId: null,
      ejerlavskode,
      matrikelnummer,
      grundareal,
      samletFastEjendomLokalId,
    };
  }
}
