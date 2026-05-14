/**
 * Live-test: Hasselvej 48, 2830 Virum
 *
 * Run:
 *   bun --env-file=.env.local scripts/test-hasselvej-48.ts
 *
 * Tester live endpoints for de centrale integrationer og skriver en frisk
 * datapunkt-rapport til docs/datapunkter-hasselvej-48.md.
 */

import { writeFile } from "node:fs/promises";
import { FbbService } from "../src/integrations/fbb/client";
import { getEnvRequired } from "../src/lib/env";

const ADDRESS = "Hasselvej 48, 2830 Virum";
const REPORT_PATH = "docs/datapunkter-hasselvej-48.md";

// Verificeret via DAWA/DAR for Hasselvej 48, 2830 Virum.
const ADRESSEID = "0a3f50a6-34da-32b8-e044-0003ba298018";
const ADGANGSADRESSEID = "0a3f507d-4cf9-32b8-e044-0003ba298018";
const EJERLAVSKODE = 12352;
const MATRIKELNUMMER = "5fo";
const LAT = 55.7937;
const LNG = 12.4803;

const API_KEY = getEnvRequired("DATAFORDELER_API_KEY");
const virkningstid = new Date().toISOString();

type Status = "live" | "mock" | "fejl";

type ServiceResult = {
  navn: string;
  status: Status;
  noter: string[];
  data?: Record<string, unknown>;
};

type BbrNode = {
  id_lokalId?: string | null;
  byg021BygningensAnvendelse?: string | null;
  byg026Opfoerelsesaar?: number | string | null;
  byg032YdervaeggensMateriale?: number | string | null;
  byg033Tagdaekningsmateriale?: number | string | null;
  byg038SamletBygningsareal?: number | null;
  byg041BebyggetAreal?: number | null;
  byg054AntalEtager?: number | null;
  byg056Varmeinstallation?: number | string | null;
  byg057Opvarmningsmiddel?: number | string | null;
  byg070Fredning?: string | null;
  byg071BevaringsvaerdighedReference?: string | null;
};

type VurNode = {
  ejendomvaerdiBeloeb?: number | null;
  grundvaerdiBeloeb?: number | null;
  vurderetAreal?: number | null;
  aar?: number | null;
};

const resultater: ServiceResult[] = [];

const statusLabel: Record<Status, string> = {
  live: "LIVE",
  mock: "MOCK",
  fejl: "FEJL",
};

const ok = (s: string) => `  OK  ${s}`;
const warn = (s: string) => `  OBS ${s}`;
const err = (s: string) => `  ERR ${s}`;

function fmtKr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "null";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value);
}

async function gql(endpoint: string, query: string, variables: Record<string, unknown>) {
  const url = new URL(endpoint);
  url.searchParams.set("apiKey", API_KEY);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);

  const parsed = JSON.parse(text);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

async function httpGet(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json, application/xml, */*" },
      signal: AbortSignal.timeout(12_000),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

function featureCount(body: string): number {
  try {
    const json = JSON.parse(body) as { totalFeatures?: number; features?: unknown[] };
    return json.totalFeatures ?? json.features?.length ?? 0;
  } catch {
    return 0;
  }
}

async function fetchBbrPublicIds(adgangsadresseid: string): Promise<number[]> {
  const url = new URL("https://api.dataforsyningen.dk/bbr/bygning");
  url.searchParams.set("adgangsadresseid", adgangsadresseid);

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`BBR Public Service HTTP ${res.status}: ${text.slice(0, 300)}`);

  const bygninger = JSON.parse(text) as Array<Record<string, unknown>>;
  return bygninger
    .map((b) => Number(b.id_lokalId ?? b.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function fetchFbbIdsByAddress(): Promise<number[]> {
  const quote = "'";
  const filter = `adresse = ${quote}Hasselvej 48${quote} AND kommune LIKE ${quote}Lyngby%${quote}`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename: "fbb:view_bygningslag",
    count: "20",
    outputFormat: "application/json",
    CQL_FILTER: filter,
  });

  const response = await httpGet(`https://www.kulturarv.dk/geoserver/wfs?${params}`);
  if (!response.ok) {
    throw new Error(
      `FBB adresse-id fallback HTTP ${response.status}: ${response.body.slice(0, 300)}`,
    );
  }

  const geojson = JSON.parse(response.body) as {
    features?: Array<{ properties?: Record<string, unknown> }>;
  };

  return (geojson.features ?? [])
    .map((feature) => Number(feature.properties?.bygningsid))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function testBbr(): Promise<ServiceResult> {
  console.log("\n=== 1. BBR - Datafordeler + Public IDs ===");
  const result: ServiceResult = {
    navn: "BBR v2 GraphQL + BBR Public Service",
    status: "fejl",
    noter: [],
  };

  try {
    const data = await gql(
      "https://graphql.datafordeler.dk/BBR/v2",
      `query Q($id: String!, $vt: DafDateTime!) {
          BBR_Bygning(where: { husnummer: { eq: $id } } virkningstid: $vt) {
            nodes {
              id_lokalId
              byg021BygningensAnvendelse
              byg026Opfoerelsesaar
              byg032YdervaeggensMateriale
              byg033Tagdaekningsmateriale
              byg038SamletBygningsareal
              byg041BebyggetAreal
              byg054AntalEtager
              byg056Varmeinstallation
              byg057Opvarmningsmiddel
              byg070Fredning
              byg071BevaringsvaerdighedReference
            }
          }
        }`,
      { id: ADGANGSADRESSEID, vt: virkningstid },
    );

    let publicIds: number[] = [];
    try {
      publicIds = await fetchBbrPublicIds(ADGANGSADRESSEID);
    } catch (e) {
      result.noter.push(`BBR Public Service ID-opslag fejlede: ${(e as Error).message}`);
    }

    const bygninger = (data?.BBR_Bygning?.nodes ?? []) as BbrNode[];
    const primary =
      bygninger.find(
        (b) => !["910", "920", "930", "940"].includes(b.byg021BygningensAnvendelse ?? ""),
      ) ?? bygninger[0];

    result.noter.push(`${bygninger.length} Datafordeler-bygninger fundet`);
    result.noter.push(`${publicIds.length} BBR Public Service integer IDs fundet`);
    result.noter.push(`BBR Public IDs: ${publicIds.join(", ") || "ingen"}`);

    if (primary) {
      result.noter.push(`Primær bygning UUID: ${primary.id_lokalId ?? "null"}`);
      result.noter.push(`Byggeår: ${primary.byg026Opfoerelsesaar ?? "null"}`);
      result.noter.push(`Bebygget areal: ${primary.byg041BebyggetAreal ?? "null"} m2`);
      result.noter.push(`Samlet areal: ${primary.byg038SamletBygningsareal ?? "null"} m2`);
      result.noter.push(`Etager: ${primary.byg054AntalEtager ?? "null"}`);
      result.noter.push(`Anvendelse: ${primary.byg021BygningensAnvendelse ?? "null"}`);
      result.noter.push(`Ydervæg (byg032): ${primary.byg032YdervaeggensMateriale ?? "null"}`);
      result.noter.push(`Tag (byg033): ${primary.byg033Tagdaekningsmateriale ?? "null"}`);
      result.noter.push(`Varme (byg056): ${primary.byg056Varmeinstallation ?? "null"}`);
      result.noter.push(`Opvarmning (byg057): ${primary.byg057Opvarmningsmiddel ?? "null"}`);
      result.noter.push(`Fredet (byg070): ${primary.byg070Fredning ?? "null"}`);
      result.noter.push(
        `FBB reference (byg071): ${primary.byg071BevaringsvaerdighedReference ?? "null"}`,
      );
    }

    result.status = "live";
    result.data = { bygninger, primary, publicIds };
    for (const note of result.noter) console.log(ok(note));
  } catch (e) {
    result.noter.push((e as Error).message);
    console.log(err((e as Error).message));
  }

  return result;
}

async function testFbb(bbrPublicIds: number[]): Promise<ServiceResult> {
  console.log("\n=== 2. FBB - SAVE via FbbService ===");
  const result: ServiceResult = {
    navn: "FBB GeoServer WFS (FbbService)",
    status: "fejl",
    noter: [],
  };

  let ids = bbrPublicIds;
  if (!bbrPublicIds.length) {
    try {
      ids = await fetchFbbIdsByAddress();
      result.noter.push(
        `BBR Public Service gav ingen IDs; bruger FBB adressefallback: ${ids.join(", ") || "ingen"}`,
      );
    } catch (e) {
      result.noter.push(`FBB adressefallback fejlede: ${(e as Error).message}`);
    }
  }

  if (!ids.length) {
    result.status = "fejl";
    result.noter.push("Skippet: ingen integer bygningsids til FBB-testen");
    console.log(warn(result.noter.join(" | ")));
    return result;
  }

  try {
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typename: "fbb:view_bygningslag",
      outputFormat: "application/json",
      CQL_FILTER: `bygningsid IN (${ids.join(",")})`,
    });
    const raw = await httpGet(`https://www.kulturarv.dk/geoserver/wfs?${params}`);
    const serviceResult = await FbbService.getSaveData(ids);

    if (!raw.ok) {
      throw new Error(`FBB WFS HTTP ${raw.status}: ${raw.body.slice(0, 300)}`);
    }

    const rawFeatureCount = featureCount(raw.body);
    result.noter.push(`FBB WFS HTTP ${raw.status}`);
    result.noter.push(`Input BBR/FBB bygningsids: ${ids.join(", ")}`);
    result.noter.push(`Rå WFS features: ${rawFeatureCount}`);
    result.noter.push(`FbbService bygninger: ${serviceResult.fbb_bygninger.length}`);

    if (serviceResult.fbb_bygninger.length) {
      for (const bygning of serviceResult.fbb_bygninger) {
        result.noter.push(
          `Bygning ${bygning.bygningsid}: SAVE ${bygning.bevaringsvaerdi}, fredningsstatus ${
            bygning.fredningsstatus ?? "null"
          }`,
        );
      }
    } else {
      result.noter.push("Ingen FBB-registreringer for de testede BBR IDs");
    }

    const bedste = serviceResult.fbb_bedste_bygning;
    result.noter.push(
      bedste
        ? `Bedste/laveste SAVE: ${bedste.bevaringsvaerdi} på bygning ${bedste.bygningsid}`
        : "Bedste/laveste SAVE: null",
    );

    result.status = "live";
    result.data = { rawFeatureCount, fbb: serviceResult, ids };
    for (const note of result.noter) console.log(ok(note));
  } catch (e) {
    result.noter.push((e as Error).message);
    console.log(err((e as Error).message));
  }

  return result;
}

async function testMat(): Promise<ServiceResult> {
  console.log("\n=== 3. MAT - grundareal + beskyttelse ===");
  const result: ServiceResult = { navn: "MAT v2 GraphQL", status: "fejl", noter: [] };

  try {
    const ejerlavData = await gql(
      "https://graphql.datafordeler.dk/MAT/v2",
      `query Q($kode: Long!, $vt: DafDateTime!) {
        MAT_Ejerlav(where: { ejerlavskode: { eq: $kode } } virkningstid: $vt first: 1) {
          nodes { id_lokalId ejerlavsnavn }
        }
      }`,
      { kode: EJERLAVSKODE, vt: virkningstid },
    );
    const ejerlav = ejerlavData?.MAT_Ejerlav?.nodes?.[0];
    if (!ejerlav) throw new Error(`MAT_Ejerlav ikke fundet for kode ${EJERLAVSKODE}`);

    const jordstykkeData = await gql(
      "https://graphql.datafordeler.dk/MAT/v2",
      `query Q($ejerlavId: String!, $matr: String!, $vt: DafDateTime!) {
        MAT_Jordstykke(
          where: { ejerlavLokalId: { eq: $ejerlavId } matrikelnummer: { eq: $matr } }
          virkningstid: $vt
          first: 1
        ) {
          nodes {
            registreretAreal
            matrikelnummer
            strandbeskyttelse_omfang
            fredskov_omfang
            klitfredning_omfang
          }
        }
      }`,
      { ejerlavId: ejerlav.id_lokalId, matr: MATRIKELNUMMER, vt: virkningstid },
    );
    const jordstykke = jordstykkeData?.MAT_Jordstykke?.nodes?.[0];
    if (!jordstykke) throw new Error(`MAT_Jordstykke ikke fundet for ${MATRIKELNUMMER}`);

    result.noter.push(`Ejerlav: ${ejerlav.ejerlavsnavn} (${ejerlav.id_lokalId})`);
    result.noter.push(`Grundareal: ${jordstykke.registreretAreal} m2`);
    result.noter.push(`Strandbeskyttelse_omfang: ${jordstykke.strandbeskyttelse_omfang ?? "null"}`);
    result.noter.push(`Fredskov_omfang: ${jordstykke.fredskov_omfang ?? "null"}`);
    result.noter.push(`Klitfredning_omfang: ${jordstykke.klitfredning_omfang ?? "null"}`);
    result.status = "live";
    result.data = { ejerlav, jordstykke };
    for (const note of result.noter) console.log(ok(note));
  } catch (e) {
    result.noter.push((e as Error).message);
    console.log(err((e as Error).message));
  }

  return result;
}

async function testEbrAndVur(): Promise<ServiceResult[]> {
  console.log("\n=== 4. EBR + VUR ===");
  const ebr: ServiceResult = { navn: "EBR v1 GraphQL", status: "fejl", noter: [] };
  const vur: ServiceResult = { navn: "VUR v1 GraphQL", status: "fejl", noter: [] };

  let bfeNr: string | null = null;

  try {
    const query = `query Q($id: String!, $vt: DafDateTime!) {
      EBR_Ejendomsbeliggenhed(where: { husnummerLokalId: { eq: $id } } virkningstid: $vt first: 1) {
        nodes { bestemtFastEjendomBFENr id_lokalId husnummerLokalId adresseLokalId }
      }
    }`;
    const data = await gql("https://graphql.datafordeler.dk/EBR/v1", query, {
      id: ADGANGSADRESSEID,
      vt: virkningstid,
    });
    const node = data?.EBR_Ejendomsbeliggenhed?.nodes?.[0];
    if (!node) throw new Error("Ingen EBR match via husnummerLokalId");

    bfeNr = node.bestemtFastEjendomBFENr?.toString() ?? null;
    if (!bfeNr) throw new Error("EBR matchede, men uden BFE-nummer");

    ebr.status = "live";
    ebr.noter.push(`BFE-nummer: ${bfeNr}`);
    ebr.noter.push(`Match via husnummerLokalId: ${ADGANGSADRESSEID}`);
    ebr.data = { bfeNr };
    for (const note of ebr.noter) console.log(ok(note));
  } catch (e) {
    ebr.noter.push((e as Error).message);
    console.log(err((e as Error).message));
  }

  if (!bfeNr) {
    vur.status = "mock";
    vur.noter.push("Skippet: intet BFE-nummer fra EBR");
    console.log(warn(vur.noter[0]));
    return [ebr, vur];
  }

  try {
    const bfe = Number(bfeNr);
    const krydsData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($bfe: Long!) {
        VUR_BFEKrydsreference(where: { BFEnummer: { eq: $bfe } } first: 1) {
          nodes { fkEjendomsvurderingID BFEnummer }
        }
      }`,
      { bfe },
    );
    const vurderingId = krydsData?.VUR_BFEKrydsreference?.nodes?.[0]?.fkEjendomsvurderingID;
    if (!vurderingId) throw new Error("Ingen VUR_BFEKrydsreference");

    const vurderingData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($id: Long!) {
        VUR_Ejendomsvurdering(where: { id: { eq: $id } }) {
          nodes { fkVurderingsejendomID }
        }
      }`,
      { id: vurderingId },
    );
    const vurderingsejendomId =
      vurderingData?.VUR_Ejendomsvurdering?.nodes?.[0]?.fkVurderingsejendomID;
    if (!vurderingsejendomId) throw new Error("Ingen fkVurderingsejendomID");

    const historikData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($id: Long!) {
        VUR_Ejendomsvurdering(where: { fkVurderingsejendomID: { eq: $id } } first: 100) {
          nodes { ejendomvaerdiBeloeb grundvaerdiBeloeb vurderetAreal aar }
        }
      }`,
      { id: vurderingsejendomId },
    );
    const vurderinger = (historikData?.VUR_Ejendomsvurdering?.nodes ?? []) as VurNode[];
    const nyeste = vurderinger.sort((a, b) => (b.aar ?? 0) - (a.aar ?? 0))[0];
    if (!nyeste) throw new Error("Ingen VUR historik");

    vur.status = "live";
    vur.noter.push(`Vurderingsår: ${nyeste.aar}`);
    vur.noter.push(`Ejendomsværdi: ${fmtKr(nyeste.ejendomvaerdiBeloeb)}`);
    vur.noter.push(`Grundværdi: ${fmtKr(nyeste.grundvaerdiBeloeb)}`);
    vur.noter.push(`Vurderet areal: ${nyeste.vurderetAreal ?? "null"} m2`);
    vur.data = { nyeste };
    for (const note of vur.noter) console.log(ok(note));
  } catch (e) {
    vur.noter.push((e as Error).message);
    console.log(err((e as Error).message));
  }

  return [ebr, vur];
}

async function testWfsGroup(): Promise<ServiceResult[]> {
  console.log("\n=== 5. WFS endpoint checks ===");
  const results: ServiceResult[] = [];
  const daiWfs = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";

  const natur: ServiceResult = {
    navn: "DAI WFS (NaturbeskyttelseService)",
    status: "fejl",
    noter: [],
  };
  const naturTypenames = [
    "dmp:STRANDBESKYTTELSESLINJE",
    "dmp:SKOVBYGGELINJE",
    "dmp:SOEBESKYTTELSESLINJE",
    "dmp:AABESKYTTELSESLINJE",
    "dmp:KLITFREDNING",
  ];
  for (const typename of naturTypenames) {
    const filter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${LNG} ${LAT}))`);
    const url = `${daiWfs}?service=WFS&version=2.0.0&request=GetFeature&typename=${typename}&count=1&outputformat=application%2Fjson&CQL_FILTER=${filter}`;
    const response = await httpGet(url);
    const count = response.ok ? featureCount(response.body) : 0;
    natur.noter.push(`${typename}: HTTP ${response.status}, ${count} features`);
    console.log(response.ok ? ok(natur.noter.at(-1) ?? "") : err(natur.noter.at(-1) ?? ""));
  }
  natur.status = natur.noter.some((note) => note.includes("HTTP 200")) ? "live" : "fejl";
  results.push(natur);

  const fredede: ServiceResult = {
    navn: "DAI WFS (FREDEDE_BYGNINGER)",
    status: "fejl",
    noter: [],
  };
  const frededeFilter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${LNG} ${LAT}))`);
  const frededeUrl = `${daiWfs}?service=WFS&version=2.0.0&request=GetFeature&typename=dmp:FREDEDE_BYGNINGER&count=1&outputformat=application%2Fjson&CQL_FILTER=${frededeFilter}`;
  const frededeResponse = await httpGet(frededeUrl);
  const frededeCount = frededeResponse.ok ? featureCount(frededeResponse.body) : 0;
  fredede.status = frededeResponse.ok ? "live" : "fejl";
  fredede.noter.push(
    `dmp:FREDEDE_BYGNINGER: HTTP ${frededeResponse.status}, ${frededeCount} features`,
  );
  console.log(frededeResponse.ok ? ok(fredede.noter[0]) : err(fredede.noter[0]));
  results.push(fredede);

  const fjernvarme: ServiceResult = {
    navn: "Plandata WFS (FjernvarmeService)",
    status: "fejl",
    noter: [],
  };
  const fjernFilter = encodeURIComponent(`INTERSECTS(geometri,SRID=4326;POINT(${LNG} ${LAT}))`);
  const fjernUrl = `https://geoserver.plandata.dk/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typename=pdk:theme_pdk_varmeplansomraade_vedtaget_v&count=1&outputformat=application%2Fjson&CQL_FILTER=${fjernFilter}`;
  const fjernResponse = await httpGet(fjernUrl);
  const fjernCount = fjernResponse.ok ? featureCount(fjernResponse.body) : 0;
  fjernvarme.status = fjernResponse.ok ? "live" : "fejl";
  fjernvarme.noter.push(
    `pdk:theme_pdk_varmeplansomraade_vedtaget_v: HTTP ${fjernResponse.status}, ${fjernCount} features`,
  );
  console.log(fjernResponse.ok ? ok(fjernvarme.noter[0]) : err(fjernvarme.noter[0]));
  results.push(fjernvarme);

  const dhm: ServiceResult = { navn: "DHM WCS (DhmService)", status: "fejl", noter: [] };
  const dhmUrl = `https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS?service=WCS&request=GetCapabilities&apiKey=${API_KEY}`;
  const dhmResponse = await httpGet(dhmUrl);
  dhm.status = dhmResponse.ok ? "live" : "fejl";
  dhm.noter.push(`GetCapabilities: HTTP ${dhmResponse.status}`);
  console.log(dhmResponse.ok ? ok(dhm.noter[0]) : err(dhm.noter[0]));
  results.push(dhm);

  const geus: ServiceResult = { navn: "GEUS WFS (GeusService)", status: "fejl", noter: [] };
  const geusResponse = await httpGet(
    "https://data.geus.dk/geusmap/ows/4258.jsp?service=WFS&request=GetCapabilities",
  );
  geus.status = geusResponse.ok ? "live" : "fejl";
  geus.noter.push(`GetCapabilities: HTTP ${geusResponse.status}`);
  geus.noter.push(`Radon layer nævnt: ${geusResponse.body.toLowerCase().includes("radon")}`);
  geus.noter.push(`Jupiter layers nævnt: ${geusResponse.body.toLowerCase().includes("jupiter")}`);
  console.log(geusResponse.ok ? ok(geus.noter.join(" | ")) : err(geus.noter[0]));
  results.push(geus);

  const dkjord: ServiceResult = { navn: "DK-Jord WFS (DkJordService)", status: "fejl", noter: [] };
  const dkjordResponse = await httpGet(
    "https://dkjord.mst.dk/wfs?service=WFS&request=GetCapabilities",
  );
  dkjord.status = dkjordResponse.ok ? "live" : "fejl";
  dkjord.noter.push(`GetCapabilities: HTTP ${dkjordResponse.status}`);
  console.log(dkjordResponse.ok ? ok(dkjord.noter[0]) : err(dkjord.noter[0]));
  results.push(dkjord);

  return results;
}

function readResult(name: string): ServiceResult | undefined {
  return resultater.find((result) => result.navn === name);
}

function tableRow(
  label: string,
  source: string,
  status: Status,
  usage: string,
  value: string,
): string {
  return `| ${label} | ${source} | ${statusLabel[status]} | ${usage} | ${value} |`;
}

function renderNotes(result: ServiceResult | undefined): string {
  if (!result) return "_Ikke kørt._";
  return result.noter.map((note) => `- ${note}`).join("\n");
}

function renderReport(): string {
  const bbr = readResult("BBR v2 GraphQL + BBR Public Service");
  const fbb = readResult("FBB GeoServer WFS (FbbService)");
  const mat = readResult("MAT v2 GraphQL");
  const ebr = readResult("EBR v1 GraphQL");
  const vur = readResult("VUR v1 GraphQL");
  const natur = readResult("DAI WFS (NaturbeskyttelseService)");
  const fredede = readResult("DAI WFS (FREDEDE_BYGNINGER)");
  const fjernvarme = readResult("Plandata WFS (FjernvarmeService)");
  const dhm = readResult("DHM WCS (DhmService)");
  const geus = readResult("GEUS WFS (GeusService)");
  const dkjord = readResult("DK-Jord WFS (DkJordService)");

  const bbrPrimary = bbr?.data?.primary as Record<string, unknown> | undefined;
  const publicIds = (bbr?.data?.publicIds as number[] | undefined) ?? [];
  const fbbIds = (fbb?.data?.ids as number[] | undefined) ?? publicIds;
  const publicIdStatus: Status = publicIds.length ? "live" : "fejl";
  const fbbData = fbb?.data?.fbb as
    | {
        fbb_bygninger: Array<{
          bygningsid: number;
          bygningsnummer: number;
          bevaringsvaerdi: number;
          fredningsstatus: string | null;
        }>;
        fbb_bedste_bygning: {
          bygningsid: number;
          bevaringsvaerdi: number;
          fredningsstatus: string | null;
        } | null;
      }
    | undefined;
  const jordstykke = mat?.data?.jordstykke as Record<string, unknown> | undefined;
  const vurNyeste = vur?.data?.nyeste as Record<string, unknown> | undefined;

  const generated = new Intl.DateTimeFormat("da-DK", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date());

  const liveCount = resultater.filter((result) => result.status === "live").length;
  const failCount = resultater.filter((result) => result.status === "fejl").length;
  const mockCount = resultater.filter((result) => result.status === "mock").length;

  const fbbRows = fbbData?.fbb_bygninger.length
    ? fbbData.fbb_bygninger
        .map((bygning) =>
          tableRow(
            `FBB bygning ${bygning.bygningsid}`,
            "Kulturarv GeoServer WFS",
            fbb?.status ?? "fejl",
            "SAVE/fredning",
            `SAVE ${bygning.bevaringsvaerdi}, fredningsstatus ${bygning.fredningsstatus ?? "null"}`,
          ),
        )
        .join("\n")
    : tableRow(
        "FBB registreringer",
        "Kulturarv GeoServer WFS",
        fbb?.status ?? "fejl",
        "SAVE/fredning",
        "Ingen FBB features for de testede BBR IDs",
      );

  return `# ArchAI - Datapunkt-rapport

**Adresse:** ${ADDRESS}  
**adresseid:** \`${ADRESSEID}\`  
**adgangsadresseid:** \`${ADGANGSADRESSEID}\`  
**Koordinater:** ${LAT}N, ${LNG}E  
**Genereret:** ${generated}  
**Kilde:** \`scripts/test-hasselvej-48.ts\`

**Statusnøgle:** LIVE = live endpoint OK · MOCK = implementeret fallback/skippet · FEJL = endpoint/test fejlede

---

## 1. Adresse

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
${tableRow("adresseid (DAR UUID)", "DAR/DAWA", "live", "Cache-nøgle, DAR-opslag", `\`${ADRESSEID}\``)}
${tableRow("adgangsadresseid", "DAR/DAWA", "live", "BBR/EBR-opslag", `\`${ADGANGSADRESSEID}\``)}
${tableRow("Adressetekst", "Adresse test fixture", "live", "UI-display", ADDRESS)}
${tableRow("Ejerlavskode", "MAT/DAR", mat?.status ?? "fejl", "MAT-opslag", `${EJERLAVSKODE}`)}
${tableRow("Matrikelnummer", "MAT/DAR", mat?.status ?? "fejl", "MAT-opslag", MATRIKELNUMMER)}
${tableRow("Koordinater", "Adresse test fixture", "live", "Geo-opslag", `${LAT}, ${LNG}`)}

---

## 2. BBR

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
${tableRow("Antal bygninger", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Bygningsvalg", `${((bbr?.data?.bygninger as unknown[]) ?? []).length}`)}
${tableRow("BBR Public IDs", "api.dataforsyningen.dk/bbr/bygning", publicIdStatus, "FBB-opslag", publicIds.join(", ") || "ingen")}
${tableRow("Primær bygning UUID", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Sporbarhed", `${bbrPrimary?.id_lokalId ?? "null"}`)}
${tableRow("Byggeår", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Renoveringsbehov", `${bbrPrimary?.byg026Opfoerelsesaar ?? "null"}`)}
${tableRow("Bebygget areal", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Bebyggelsesprocent", `${bbrPrimary?.byg041BebyggetAreal ?? "null"} m2`)}
${tableRow("Samlet bygningsareal", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Typologi", `${bbrPrimary?.byg038SamletBygningsareal ?? "null"} m2`)}
${tableRow("Antal etager", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Planvalidering", `${bbrPrimary?.byg054AntalEtager ?? "null"}`)}
${tableRow("Anvendelseskode", "BBR v2 GraphQL", bbr?.status ?? "fejl", "Boligklassificering", `${bbrPrimary?.byg021BygningensAnvendelse ?? "null"}`)}
${tableRow("Varmeinstallation", "BBR v2 byg056", bbr?.status ?? "fejl", "Energibaseline", `${bbrPrimary?.byg056Varmeinstallation ?? "null"}`)}
${tableRow("Opvarmningsmiddel", "BBR v2 byg057", bbr?.status ?? "fejl", "Energibaseline", `${bbrPrimary?.byg057Opvarmningsmiddel ?? "null"}`)}
${tableRow("Fredet", "BBR v2 byg070", bbr?.status ?? "fejl", "Fredningsflag", `${bbrPrimary?.byg070Fredning ?? "null"}`)}
${tableRow("FBB reference", "BBR v2 byg071", bbr?.status ?? "fejl", "FBB-sporbarhed", `${bbrPrimary?.byg071BevaringsvaerdighedReference ?? "null"}`)}

---

## 3. FBB - Fredede og Bevaringsværdige Bygninger

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
${tableRow("FBB endpoint", "https://www.kulturarv.dk/geoserver/wfs", fbb?.status ?? "fejl", "SAVE-opslag", fbb?.noter.find((note) => note.startsWith("FBB WFS HTTP")) ?? "ikke kørt")}
${tableRow("Input IDs", "Integer FBB/BBR bygningsids", fbb?.status ?? "fejl", "CQL bygningsid IN", fbbIds.join(", ") || "ingen")}
${fbbRows}
${tableRow("Bedste/laveste SAVE", "FbbService.getSaveData", fbb?.status ?? "fejl", "Regelkerne heritage.saveValue", fbbData?.fbb_bedste_bygning ? `${fbbData.fbb_bedste_bygning.bevaringsvaerdi} på bygning ${fbbData.fbb_bedste_bygning.bygningsid}` : "null")}

**FBB-noter**

${renderNotes(fbb)}

---

## 4. MAT

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
${tableRow("Registreret areal", "MAT v2 GraphQL", mat?.status ?? "fejl", "Bebyggelsesprocent", `${jordstykke?.registreretAreal ?? "null"} m2`)}
${tableRow("Strandbeskyttelse", "MAT v2 GraphQL", mat?.status ?? "fejl", "Compliance-flag", `${jordstykke?.strandbeskyttelse_omfang ?? "null"}`)}
${tableRow("Fredskov", "MAT v2 GraphQL", mat?.status ?? "fejl", "Compliance-flag", `${jordstykke?.fredskov_omfang ?? "null"}`)}
${tableRow("Klitfredning", "MAT v2 GraphQL", mat?.status ?? "fejl", "Compliance-flag", `${jordstykke?.klitfredning_omfang ?? "null"}`)}

---

## 5. EBR og VUR

| Datapunkt | Kildesystem | Status | Bruges til | Hasselvej 48 |
|---|---|---|---|---|
${tableRow("BFE-nummer", "EBR v1 GraphQL", ebr?.status ?? "fejl", "VUR-opslag", `${ebr?.data?.bfeNr ?? "null"}`)}
${tableRow("Vurderingsår", "VUR v1 GraphQL", vur?.status ?? "fejl", "Aktualitet", `${vurNyeste?.aar ?? "null"}`)}
${tableRow("Ejendomsværdi", "VUR v1 GraphQL", vur?.status ?? "fejl", "Finansiering", fmtKr(vurNyeste?.ejendomvaerdiBeloeb as number | undefined))}
${tableRow("Grundværdi", "VUR v1 GraphQL", vur?.status ?? "fejl", "Finansiering", fmtKr(vurNyeste?.grundvaerdiBeloeb as number | undefined))}
${tableRow("Vurderet areal", "VUR v1 GraphQL", vur?.status ?? "fejl", "Reference", `${vurNyeste?.vurderetAreal ?? "null"} m2`)}

---

## 6. WFS og øvrige endpoint-checks

| Integration | Status | Resultat |
|---|---|---|
| Naturbeskyttelse DAI WFS | ${statusLabel[natur?.status ?? "fejl"]} | ${renderNotes(natur).replace(/\n/g, "<br>")} |
| Fredede bygninger DAI WFS | ${statusLabel[fredede?.status ?? "fejl"]} | ${renderNotes(fredede).replace(/\n/g, "<br>")} |
| Fjernvarme Plandata WFS | ${statusLabel[fjernvarme?.status ?? "fejl"]} | ${renderNotes(fjernvarme).replace(/\n/g, "<br>")} |
| DHM WCS | ${statusLabel[dhm?.status ?? "fejl"]} | ${renderNotes(dhm).replace(/\n/g, "<br>")} |
| GEUS WFS | ${statusLabel[geus?.status ?? "fejl"]} | ${renderNotes(geus).replace(/\n/g, "<br>")} |
| DK-Jord WFS | ${statusLabel[dkjord?.status ?? "fejl"]} | ${renderNotes(dkjord).replace(/\n/g, "<br>")} |

---

## Sammenfatning

| Status | Antal |
|---|---:|
| LIVE | ${liveCount} |
| MOCK | ${mockCount} |
| FEJL | ${failCount} |

### Alle testnoter

${resultater
  .map(
    (result) => `#### ${result.navn} - ${statusLabel[result.status]}

${renderNotes(result)}`,
  )
  .join("\n\n")}
`;
}

async function main() {
  const bbr = await testBbr();
  resultater.push(bbr);

  const bbrPublicIds = (bbr.data?.publicIds as number[] | undefined) ?? [];
  resultater.push(await testFbb(bbrPublicIds));
  resultater.push(await testMat());
  resultater.push(...(await testEbrAndVur()));
  resultater.push(...(await testWfsGroup()));

  await writeFile(REPORT_PATH, renderReport(), "utf8");

  console.log("\n=== Sammenfatning ===");
  for (const result of resultater) {
    console.log(`${statusLabel[result.status]} ${result.navn}`);
  }
  console.log(`\nRapport skrevet til ${REPORT_PATH}`);

  if (resultater.some((result) => result.status === "fejl")) {
    process.exitCode = 1;
  }
}

await main();
