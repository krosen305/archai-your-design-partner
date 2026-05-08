/**
 * Live-test: Hasselvej 48, 2830 Virum
 * Kør: bun --env-file=dist/server/.dev.vars scripts/test-hasselvej-48.ts
 *
 * Tester ALLE services direkte mod live endpoints.
 * Outputter opdateret oversigt til docs/datapunkter-hasselvej-48.md
 */

// Kendte IDs for Hasselvej 48, 2830 Virum (verificeret via DAWA/DAR, 2026-05-08)
const ADRESSEID        = "0a3f50a6-34da-32b8-e044-0003ba298018"; // DAR adresse id_lokalId
const ADGANGSADRESSEID = "0a3f507d-4cf9-32b8-e044-0003ba298018"; // DAR husnummer id_lokalId
const EJERLAVSKODE     = 12352;     // Virum By, Virum
const MATRIKELNUMMER   = "5fo";
const LAT              = 55.7937;
const LNG              = 12.4803;

const API_KEY = process.env.DATAFORDELER_API_KEY ?? "";
if (!API_KEY) {
  console.error("DATAFORDELER_API_KEY mangler");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const virkningstid = new Date().toISOString();

async function gql(endpoint: string, query: string, variables: Record<string, unknown>) {
  const u = new URL(endpoint);
  u.searchParams.set("apiKey", API_KEY);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

async function wfsGet(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

const ok   = (s: string) => `  ✅ ${s}`;
const warn = (s: string) => `  ⚠️  ${s}`;
const err  = (s: string) => `  ❌ ${s}`;

// ---------------------------------------------------------------------------
// Resultater (akkumuleret til markdown-output)
// ---------------------------------------------------------------------------

type ServiceResult = { navn: string; status: "live" | "mock" | "fejl"; noter: string[] };
const resultater: ServiceResult[] = [];

// ---------------------------------------------------------------------------
// 1. BBR
// ---------------------------------------------------------------------------

console.log("\n═══ 1. BBR — bygningsdata ═══");
const bbrResult: ServiceResult = { navn: "BBR v2 GraphQL", status: "fejl", noter: [] };
try {
  const data = await gql(
    "https://graphql.datafordeler.dk/BBR/v2",
    `query Q($id: String!, $vt: DafDateTime!) {
      BBR_Bygning(where: { husnummer: { eq: $id } } virkningstid: $vt) {
        nodes {
          byg021BygningensAnvendelse byg026Opfoerelsesaar
          byg032YdervaeggensMateriale byg033Tagdaekningsmateriale
          byg038SamletBygningsareal byg041BebyggetAreal byg054AntalEtager
          byg056Varmeinstallation byg057Opvarmningsmiddel byg070Fredning
        }
      }
    }`,
    { id: ADGANGSADRESSEID, vt: virkningstid },
  );
  const nodes = data?.BBR_Bygning?.nodes ?? [];
  console.log(ok(`${nodes.length} bygninger fundet`));
  const primær = nodes.find((b: any) => !["910","920","930","940"].includes(b.byg021BygningensAnvendelse));
  if (primær) {
    bbrResult.noter.push(`Byggeår: ${primær.byg026Opfoerelsesaar}`);
    bbrResult.noter.push(`Bebygget areal: ${primær.byg041BebyggetAreal} m²`);
    bbrResult.noter.push(`Samlet areal: ${primær.byg038SamletBygningsareal} m²`);
    bbrResult.noter.push(`Etager: ${primær.byg054AntalEtager}`);
    bbrResult.noter.push(`Anvendelse: ${primær.byg021BygningensAnvendelse}`);
    bbrResult.noter.push(`Ydervæg (byg032): ${primær.byg032YdervaeggensMateriale}`);
    bbrResult.noter.push(`Tag (byg033): ${primær.byg033Tagdaekningsmateriale}`);
    bbrResult.noter.push(`Varme (byg056): ${primær.byg056Varmeinstallation}`);
    bbrResult.noter.push(`Opvarmning (byg057): ${primær.byg057Opvarmningsmiddel}`);
    bbrResult.noter.push(`Fredet (byg070): ${primær.byg070Fredning ?? "null"}`);
    for (const n of bbrResult.noter) console.log(ok(n));
    bbrResult.status = "live";
  }
} catch (e) {
  console.log(err((e as Error).message));
  bbrResult.noter.push((e as Error).message);
}
resultater.push(bbrResult);

// ---------------------------------------------------------------------------
// 2. MAT — grundareal + beskyttelseslinjer (korrekte IDs)
// ---------------------------------------------------------------------------

console.log("\n═══ 2. MAT — grundareal + beskyttelseslinjer (ejerlavskode 12352, matr 5fo) ═══");
const matResult: ServiceResult = { navn: "MAT v2 GraphQL", status: "fejl", noter: [] };
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
  console.log(ok(`Ejerlav: ${ejerlav.ejerlavsnavn} (${ejerlav.id_lokalId})`));

  const jsData = await gql(
    "https://graphql.datafordeler.dk/MAT/v2",
    `query Q($ejerlavId: String!, $matr: String!, $vt: DafDateTime!) {
      MAT_Jordstykke(
        where: { ejerlavLokalId: { eq: $ejerlavId } matrikelnummer: { eq: $matr } }
        virkningstid: $vt first: 1
      ) {
        nodes {
          registreretAreal matrikelnummer
          strandbeskyttelse_omfang fredskov_omfang klitfredning_omfang
        }
      }
    }`,
    { ejerlavId: ejerlav.id_lokalId, matr: MATRIKELNUMMER, vt: virkningstid },
  );
  const js = jsData?.MAT_Jordstykke?.nodes?.[0];
  if (!js) throw new Error(`MAT_Jordstykke ikke fundet for matr ${MATRIKELNUMMER}`);

  matResult.noter.push(`Grundareal: ${js.registreretAreal} m²`);
  matResult.noter.push(`Strandbeskyttelse_omfang: ${js.strandbeskyttelse_omfang ?? "null"}`);
  matResult.noter.push(`Fredskov_omfang: ${js.fredskov_omfang ?? "null"}`);
  matResult.noter.push(`Klitfredning_omfang: ${js.klitfredning_omfang ?? "null"}`);
  for (const n of matResult.noter) console.log(ok(n));
  matResult.status = "live";
} catch (e) {
  console.log(err((e as Error).message));
  matResult.noter.push((e as Error).message);
}
resultater.push(matResult);

// ---------------------------------------------------------------------------
// 3. EBR — BFE-nummer
// ---------------------------------------------------------------------------

console.log("\n═══ 3. EBR — BFE-nummer ═══");
const ebrResult: ServiceResult = { navn: "EBR v1 GraphQL", status: "fejl", noter: [] };
let bfeNr: string | null = null;
const ebrQuery = `query Q($id: String!, $vt: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(where: { adresseLokalId: { eq: $id } } virkningstid: $vt first: 1) {
    nodes { bestemtFastEjendomBFENr id_lokalId }
  }
}`;
try {
  for (const [label, id] of [["adgangsadresseid", ADGANGSADRESSEID], ["adresseid", ADRESSEID]] as const) {
    const data = await gql("https://graphql.datafordeler.dk/EBR/v1", ebrQuery, { id, vt: virkningstid });
    const nodes = data?.EBR_Ejendomsbeliggenhed?.nodes ?? [];
    if (nodes.length) {
      bfeNr = nodes[0].bestemtFastEjendomBFENr;
      console.log(ok(`BFE-nummer: ${bfeNr} (via ${label})`));
      ebrResult.noter.push(`BFE-nummer: ${bfeNr} (via ${label})`);
      ebrResult.status = "live";
      break;
    } else {
      console.log(warn(`Ingen match for ${label}: ${id}`));
      ebrResult.noter.push(`Ingen match for ${label}`);
    }
  }
  if (!bfeNr) ebrResult.noter.push("Ingen BFE-nummer fundet for rækkehusadresse");
} catch (e) {
  console.log(err((e as Error).message));
  ebrResult.noter.push((e as Error).message);
}
if (!bfeNr) ebrResult.status = "mock"; // Implementeret men ingen match
resultater.push(ebrResult);

// ---------------------------------------------------------------------------
// 4. VUR — ejendomsvurdering
// ---------------------------------------------------------------------------

console.log("\n═══ 4. VUR — ejendomsvurdering ═══");
const vurResult: ServiceResult = { navn: "VUR v1 GraphQL", status: "fejl", noter: [] };
if (!bfeNr) {
  console.log(warn("Spring over — intet BFE-nummer"));
  vurResult.noter.push("Skippet: intet BFE-nummer fra EBR");
  vurResult.status = "mock";
} else {
  try {
    const bfe = parseInt(bfeNr, 10);
    const krydsData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($bfe: Long!) { VUR_BFEKrydsreference(where: { BFEnummer: { eq: $bfe } } first: 1) {
        nodes { fkEjendomsvurderingID BFEnummer }
      }}`,
      { bfe },
    );
    const recordId = krydsData?.VUR_BFEKrydsreference?.nodes?.[0]?.fkEjendomsvurderingID;
    if (!recordId) throw new Error("Ingen VUR_BFEKrydsreference");

    const propData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($id: Long!) { VUR_Ejendomsvurdering(where: { id: { eq: $id } }) { nodes { fkVurderingsejendomID } }}`,
      { id: recordId },
    );
    const propId = propData?.VUR_Ejendomsvurdering?.nodes?.[0]?.fkVurderingsejendomID;
    if (!propId) throw new Error("Ingen fkVurderingsejendomID");

    const histData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query Q($id: Long!) { VUR_Ejendomsvurdering(where: { fkVurderingsejendomID: { eq: $id } } first: 100) {
        nodes { ejendomvaerdiBeloeb grundvaerdiBeloeb vurderetAreal aar }
      }}`,
      { id: propId },
    );
    const vurNodes: any[] = histData?.VUR_Ejendomsvurdering?.nodes ?? [];
    const nyeste = vurNodes.sort((a: any, b: any) => (b.aar||0)-(a.aar||0))[0];
    const fmt = (n: number | null) => n !== null
      ? new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(n)
      : "null";

    vurResult.noter.push(`Vurderingsår: ${nyeste.aar}`);
    vurResult.noter.push(`Ejendomsværdi: ${fmt(nyeste.ejendomvaerdiBeloeb)}`);
    vurResult.noter.push(`Grundværdi: ${fmt(nyeste.grundvaerdiBeloeb)}`);
    vurResult.noter.push(`Vurderet areal: ${nyeste.vurderetAreal} m²`);
    for (const n of vurResult.noter) console.log(ok(n));
    vurResult.status = "live";
  } catch (e) {
    console.log(err((e as Error).message));
    vurResult.noter.push((e as Error).message);
  }
}
resultater.push(vurResult);

// ---------------------------------------------------------------------------
// 5. DAI WFS — NaturbeskyttelseService (endpoint-verifikation)
// ---------------------------------------------------------------------------

console.log("\n═══ 5. DAI WFS — naturbeskyttelseslinjer (endpoint-verifikation) ═══");
const natResult: ServiceResult = { navn: "DAI WFS (NaturbeskyttelseService)", status: "fejl", noter: [] };
const DAI_WFS = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";
const typenames = [
  "dmp:STRANDBESKYTTELSESLINJE",
  "dmp:SKOVBYGGELINJE",
  "dmp:SOEBESKYTTELSESLINJE",
  "dmp:AABESKYTTELSESLINJE",
  "dmp:KLITFREDNING",
];
let daiWorking = false;
for (const typename of typenames) {
  const filter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${LNG} ${LAT}))`);
  const url = `${DAI_WFS}?service=WFS&version=2.0.0&request=GetFeature&typename=${typename}&count=1&outputformat=application%2Fjson&CQL_FILTER=${filter}`;
  const r = await wfsGet(url);
  if (r.ok) {
    let count = 0;
    try { count = (JSON.parse(r.body) as any).totalFeatures ?? (JSON.parse(r.body) as any).features?.length ?? 0; } catch {}
    console.log(ok(`${typename}: HTTP ${r.status}, ${count} features`));
    natResult.noter.push(`${typename}: ✅ HTTP ${r.status} — ${count === 0 ? "ingen match (OK)" : count + " features"}`);
    daiWorking = true;
  } else {
    console.log(err(`${typename}: HTTP ${r.status} — ${r.body.slice(0, 120)}`));
    natResult.noter.push(`${typename}: ❌ HTTP ${r.status}`);
  }
}
natResult.status = daiWorking ? "live" : "fejl";
resultater.push(natResult);

// ---------------------------------------------------------------------------
// 6. DAI WFS — SaveService / fredede bygninger
// ---------------------------------------------------------------------------

console.log("\n═══ 6. DAI WFS — fredede bygninger (SAVE endpoint-verifikation) ═══");
const saveResult: ServiceResult = { navn: "DAI WFS (SaveService / FREDEDE_BYGNINGER)", status: "fejl", noter: [] };
const saveFilter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${LNG} ${LAT}))`);
const saveUrl = `${DAI_WFS}?service=WFS&version=2.0.0&request=GetFeature&typename=dmp:FREDEDE_BYGNINGER&count=1&outputformat=application%2Fjson&CQL_FILTER=${saveFilter}`;
const saveR = await wfsGet(saveUrl);
if (saveR.ok) {
  let count = 0;
  try { count = (JSON.parse(saveR.body) as any).totalFeatures ?? (JSON.parse(saveR.body) as any).features?.length ?? 0; } catch {}
  console.log(ok(`FREDEDE_BYGNINGER: HTTP ${saveR.status}, ${count} features`));
  saveResult.noter.push(`dmp:FREDEDE_BYGNINGER: ✅ HTTP ${saveR.status} — ${count === 0 ? "ikke fredet" : count + " features (FREDET!)"}`);
  saveResult.status = "live";
} else {
  console.log(err(`FREDEDE_BYGNINGER: HTTP ${saveR.status} — ${saveR.body.slice(0, 120)}`));
  saveResult.noter.push(`dmp:FREDEDE_BYGNINGER: ❌ HTTP ${saveR.status}`);
}
resultater.push(saveResult);

// ---------------------------------------------------------------------------
// 7. Fjernvarme WFS — Plandata (endpoint-verifikation)
// ---------------------------------------------------------------------------

console.log("\n═══ 7. Fjernvarme — Plandata WFS (endpoint-verifikation) ═══");
const fjernvarmeResult: ServiceResult = { navn: "Plandata WFS (FjernvarmeService)", status: "fejl", noter: [] };
const fjernFilter = encodeURIComponent(`INTERSECTS(geometri,SRID=4326;POINT(${LNG} ${LAT}))`);
const fjernUrl = `https://geoserver.plandata.dk/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typename=pdk:theme_pdk_varmeforsyning_vedtaget&count=1&outputformat=application%2Fjson&CQL_FILTER=${fjernFilter}`;
const fjernR = await wfsGet(fjernUrl);
if (fjernR.ok) {
  let count = 0;
  try { count = (JSON.parse(fjernR.body) as any).totalFeatures ?? (JSON.parse(fjernR.body) as any).features?.length ?? 0; } catch {}
  console.log(ok(`varmeforsyning_vedtaget: HTTP ${fjernR.status}, ${count} features`));
  fjernvarmeResult.noter.push(`pdk:theme_pdk_varmeforsyning_vedtaget: ✅ HTTP ${fjernR.status} — ${count > 0 ? "fjernvarme DÆKKET" : "IKKE dækket af fjernvarme"}`);
  fjernvarmeResult.status = "live";
} else {
  console.log(err(`HTTP ${fjernR.status} — ${fjernR.body.slice(0, 200)}`));
  fjernvarmeResult.noter.push(`HTTP ${fjernR.status}: ${fjernR.body.slice(0, 120)}`);
  // Prøv alternativt geometry-feltnavn
  const altUrl = fjernUrl.replace("INTERSECTS(geometri,", "INTERSECTS(the_geom,");
  const altR = await wfsGet(altUrl);
  if (altR.ok) {
    console.log(ok(`[the_geom] HTTP ${altR.status}`));
    fjernvarmeResult.noter.push(`Med the_geom: ✅ HTTP ${altR.status}`);
    fjernvarmeResult.status = "live";
  }
}
resultater.push(fjernvarmeResult);

// ---------------------------------------------------------------------------
// 8. DHM WCS — GetCapabilities (endpoint-verifikation)
// ---------------------------------------------------------------------------

console.log("\n═══ 8. DHM WCS — GetCapabilities ═══");
const dhmResult: ServiceResult = { navn: "DHM WCS (DhmService)", status: "fejl", noter: [] };
const dhmCapsUrl = `https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS?service=WCS&request=GetCapabilities&apiKey=${API_KEY}`;
const dhmR = await wfsGet(dhmCapsUrl);
if (dhmR.ok) {
  const hasTerraen = dhmR.body.toLowerCase().includes("dhm_terraen") || dhmR.body.toLowerCase().includes("dhm_terr");
  console.log(ok(`DHM WCS HTTP ${dhmR.status} — dhm_terraen i capabilities: ${hasTerraen}`));
  dhmResult.noter.push(`GetCapabilities: ✅ HTTP ${dhmR.status}`);
  if (hasTerraen) dhmResult.noter.push("dhm_terraen/dhm_terr coverage bekræftet i capabilities");
  else dhmResult.noter.push(`Kendte coverage-navne ikke fundet — body (500 chars): ${dhmR.body.slice(0, 500)}`);
  dhmResult.status = "live";
} else {
  console.log(err(`HTTP ${dhmR.status}`));
  dhmResult.noter.push(`GetCapabilities: ❌ HTTP ${dhmR.status}`);
}
resultater.push(dhmResult);

// ---------------------------------------------------------------------------
// 9. GEUS WFS — GetCapabilities
// ---------------------------------------------------------------------------

console.log("\n═══ 9. GEUS WFS — GetCapabilities ═══");
const geusResult: ServiceResult = { navn: "GEUS WFS (GeusService)", status: "fejl", noter: [] };
const geusCapsUrl = "https://data.geus.dk/geusmap/ows/4258.jsp?service=WFS&request=GetCapabilities";
const geusR = await wfsGet(geusCapsUrl);
if (geusR.ok) {
  const hasRadon  = geusR.body.toLowerCase().includes("radon");
  const hasJupiter = geusR.body.toLowerCase().includes("jupiter");
  console.log(ok(`GEUS WFS HTTP ${geusR.status} — radon: ${hasRadon}, jupiter: ${hasJupiter}`));
  geusResult.noter.push(`GetCapabilities: ✅ HTTP ${geusR.status}`);
  geusResult.noter.push(`radon layer: ${hasRadon ? "✅ fundet" : "❌ ikke fundet"}`);
  geusResult.noter.push(`jupiter layer: ${hasJupiter ? "✅ fundet" : "❌ ikke fundet"}`);
  geusResult.status = "live";
} else {
  console.log(err(`HTTP ${geusR.status}: ${geusR.body.slice(0, 120)}`));
  geusResult.noter.push(`GetCapabilities: ❌ HTTP ${geusR.status}`);
}
resultater.push(geusResult);

// ---------------------------------------------------------------------------
// 10. DK-Jord WFS — endpoint-tilgængelighed
// ---------------------------------------------------------------------------

console.log("\n═══ 10. DK-Jord WFS — endpoint-tilgængelighed ═══");
const dkjordResult: ServiceResult = { navn: "DK-Jord WFS (DkJordService)", status: "fejl", noter: [] };
const dkjordUrl = "https://dkjord.mst.dk/wfs?service=WFS&request=GetCapabilities";
const dkjordR = await wfsGet(dkjordUrl);
if (dkjordR.ok) {
  const hasV1V2 = dkjordR.body.toLowerCase().includes("v1") || dkjordR.body.toLowerCase().includes("kortl");
  console.log(ok(`DK-Jord HTTP ${dkjordR.status} — V1/V2-kortlægning: ${hasV1V2}`));
  dkjordResult.noter.push(`GetCapabilities: ✅ HTTP ${dkjordR.status}`);
  dkjordResult.status = "live";
} else {
  console.log(err(`HTTP ${dkjordR.status}: ${dkjordR.body.slice(0, 120)}`));
  dkjordResult.noter.push(`GetCapabilities: ❌ HTTP ${dkjordR.status} — ${dkjordR.body.slice(0, 100)}`);
}
resultater.push(dkjordResult);

// ---------------------------------------------------------------------------
// Sammenfatning
// ---------------------------------------------------------------------------

console.log("\n\n══════════════════════════════════════════════");
console.log("SAMMENFATNING");
console.log("══════════════════════════════════════════════");
for (const r of resultater) {
  const ikon = r.status === "live" ? "✅" : r.status === "mock" ? "⏳" : "❌";
  console.log(`\n${ikon} ${r.navn}`);
  for (const n of r.noter) console.log(`   ${n}`);
}

console.log("\n\nTest afsluttet:", new Date().toISOString());
