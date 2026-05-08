/**
 * Live-test: Hasselvej 48, 2830 Virum
 * Kør: bun --env-file=.env.local scripts/test-hasselvej-48.ts
 *
 * Tester EBR, VUR og BBR (nye felter) direkte mod Datafordeler.
 */

// Kendte IDs for Hasselvej 48, 2830 Virum
const ADRESSEID = "0a3f50a6-34da-32b8-e044-0003ba298018";       // DAR adresse id_lokalId
const ADGANGSADRESSEID = "0a3f5081-d7e2-32b8-e044-0003ba298018"; // DAR husnummer id_lokalId (fra DAWA)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_KEY = process.env.DATAFORDELER_API_KEY ?? "";
if (!API_KEY) {
  console.error("DATAFORDELER_API_KEY mangler — kør med: bun --env-file=.env.local scripts/test-hasselvej-48.ts");
  process.exit(1);
}

function url(endpoint: string) {
  const u = new URL(endpoint);
  u.searchParams.set("apiKey", API_KEY);
  return u;
}

async function gql(endpoint: string, query: string, variables: Record<string, unknown>) {
  const u = url(endpoint);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

const virkningstid = new Date().toISOString();

// ---------------------------------------------------------------------------
// 1. BBR — nye felter (varme, materialer, fredning)
// ---------------------------------------------------------------------------

console.log("\n═══ 1. BBR — bygningsdata ═══");
try {
  const bbrData = await gql(
    "https://graphql.datafordeler.dk/BBR/v2",
    `query GetBygning($id: String!, $virkningstid: DafDateTime!) {
      BBR_Bygning(
        where: { husnummer: { eq: $id } }
        virkningstid: $virkningstid
      ) {
        nodes {
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
        }
      }
    }`,
    { id: ADGANGSADRESSEID, virkningstid },
  );
  const bygninger = bbrData?.BBR_Bygning?.nodes ?? [];
  console.log(`  Antal bygninger fundet: ${bygninger.length}`);
  if (bygninger.length > 0) {
    const b = bygninger[0];
    console.log("  byg021 Anvendelse:", b.byg021BygningensAnvendelse);
    console.log("  byg026 Byggeår:", b.byg026Opfoerelsesaar);
    console.log("  byg032 Ydervæg:", b.byg032YdervaeggensMateriale);
    console.log("  byg033 Tag:", b.byg033Tagdaekningsmateriale);
    console.log("  byg038 Samlet areal:", b.byg038SamletBygningsareal);
    console.log("  byg041 Bebygget areal:", b.byg041BebyggetAreal);
    console.log("  byg054 Etager:", b.byg054AntalEtager);
    console.log("  byg056 Varmeinstallation:", b.byg056Varmeinstallation);
    console.log("  byg057 Opvarmningsmiddel:", b.byg057Opvarmningsmiddel);
    console.log("  byg070 Fredning:", b.byg070Fredning);
  }
} catch (e) {
  console.error("  ❌ BBR fejl:", (e as Error).message);
}

// ---------------------------------------------------------------------------
// 2. MAT — beskyttelseslinjer (strandbeskyttelse, fredskov, klitfredning)
// ---------------------------------------------------------------------------

console.log("\n═══ 2. MAT — beskyttelseslinjer via ejerlavskode 173551 / matr 8a ═══");
try {
  // Trin 1: Ejerlav
  const ejerlavData = await gql(
    "https://graphql.datafordeler.dk/MAT/v2",
    `query GetEjerlav($kode: Long!, $virkningstid: DafDateTime!) {
      MAT_Ejerlav(
        where: { ejerlavskode: { eq: $kode } }
        virkningstid: $virkningstid
        first: 1
      ) {
        nodes { id_lokalId ejerlavsnavn }
      }
    }`,
    { kode: 173551, virkningstid },
  );
  const ejerlaver = ejerlavData?.MAT_Ejerlav?.nodes ?? [];
  if (!ejerlaver.length) {
    console.log("  ⚠ MAT_Ejerlav ikke fundet for ejerlavskode 173551");
  } else {
    const ejerlav = ejerlaver[0];
    console.log("  Ejerlav id_lokalId:", ejerlav.id_lokalId);
    console.log("  Ejerlavsnavn:", ejerlav.ejerlavsnavn);

    // Trin 2: Jordstykke
    const jsData = await gql(
      "https://graphql.datafordeler.dk/MAT/v2",
      `query GetJordstykke($ejerlavLokalId: String!, $matrikelnummer: String!, $virkningstid: DafDateTime!) {
        MAT_Jordstykke(
          where: {
            ejerlavLokalId: { eq: $ejerlavLokalId }
            matrikelnummer: { eq: $matrikelnummer }
          }
          virkningstid: $virkningstid
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
      { ejerlavLokalId: ejerlav.id_lokalId, matrikelnummer: "8a", virkningstid },
    );
    const jordstykker = jsData?.MAT_Jordstykke?.nodes ?? [];
    if (!jordstykker.length) {
      console.log("  ⚠ MAT_Jordstykke ikke fundet for matr. 8a");
    } else {
      const js = jordstykker[0];
      console.log("  Registreret areal:", js.registreretAreal, "m²");
      console.log("  Strandbeskyttelse_omfang:", js.strandbeskyttelse_omfang);
      console.log("  Fredskov_omfang:", js.fredskov_omfang);
      console.log("  Klitfredning_omfang:", js.klitfredning_omfang);
    }
  }
} catch (e) {
  console.error("  ❌ MAT fejl:", (e as Error).message);
}

// ---------------------------------------------------------------------------
// 3. EBR — BFE-nummer fra adresseLokalId
// ---------------------------------------------------------------------------

console.log("\n═══ 3. EBR — BFE-nummer ═══");
let bfeNr: string | null = null;
try {
  const ebrData = await gql(
    "https://graphql.datafordeler.dk/EBR/v1",
    `query GetEjendomsbeliggenhed($adresseLokalId: String!, $virkningstid: DafDateTime!) {
      EBR_Ejendomsbeliggenhed(
        where: { adresseLokalId: { eq: $adresseLokalId } }
        virkningstid: $virkningstid
        first: 1
      ) {
        nodes {
          bestemtFastEjendomBFENr
          id_lokalId
        }
      }
    }`,
    { adresseLokalId: ADGANGSADRESSEID, virkningstid },
  );
  const nodes = ebrData?.EBR_Ejendomsbeliggenhed?.nodes ?? [];
  if (!nodes.length) {
    console.log("  ⚠ EBR_Ejendomsbeliggenhed ikke fundet for adresseLokalId:", ADGANGSADRESSEID);
    // Prøv med adresseid som fallback
    console.log("  Prøver med adresseid som fallback...");
    const ebrData2 = await gql(
      "https://graphql.datafordeler.dk/EBR/v1",
      `query GetEjendomsbeliggenhed2($adresseLokalId: String!, $virkningstid: DafDateTime!) {
        EBR_Ejendomsbeliggenhed(
          where: { adresseLokalId: { eq: $adresseLokalId } }
          virkningstid: $virkningstid
          first: 1
        ) {
          nodes {
            bestemtFastEjendomBFENr
            id_lokalId
          }
        }
      }`,
      { adresseLokalId: ADRESSEID, virkningstid },
    );
    const nodes2 = ebrData2?.EBR_Ejendomsbeliggenhed?.nodes ?? [];
    if (!nodes2.length) {
      console.log("  ⚠ EBR_Ejendomsbeliggenhed ikke fundet med adresseid heller");
    } else {
      bfeNr = nodes2[0].bestemtFastEjendomBFENr;
      console.log("  ✅ BFE-nummer (via adresseid):", bfeNr);
      console.log("  id_lokalId:", nodes2[0].id_lokalId);
    }
  } else {
    bfeNr = nodes[0].bestemtFastEjendomBFENr;
    console.log("  ✅ BFE-nummer:", bfeNr);
    console.log("  id_lokalId:", nodes[0].id_lokalId);
  }
} catch (e) {
  console.error("  ❌ EBR fejl:", (e as Error).message);
}

// ---------------------------------------------------------------------------
// 4. VUR — ejendomsvurdering via BFE
// ---------------------------------------------------------------------------

console.log("\n═══ 4. VUR — ejendomsvurdering ═══");
if (!bfeNr) {
  console.log("  ⏭ Spring over — intet BFE-nummer fra EBR");
} else {
  try {
    const bfe = parseInt(bfeNr, 10);
    console.log("  BFE-nummer:", bfe);

    // Trin 1: BFEKrydsreference
    const krydsData = await gql(
      "https://graphql.datafordeler.dk/VUR/v1",
      `query GetBFEKrydsreference($bfe: Long!) {
        VUR_BFEKrydsreference(
          where: { BFEnummer: { eq: $bfe } }
          first: 1
        ) {
          nodes {
            fkEjendomsvurderingID
            BFEnummer
          }
        }
      }`,
      { bfe },
    );
    const krydsNodes = krydsData?.VUR_BFEKrydsreference?.nodes ?? [];
    if (!krydsNodes.length) {
      console.log("  ⚠ VUR_BFEKrydsreference ikke fundet for BFEnummer:", bfe);
    } else {
      const vurderingsejendomId = krydsNodes[0].fkEjendomsvurderingID;
      console.log("  fkEjendomsvurderingID:", vurderingsejendomId);

      // Trin 2: Ejendomsvurdering
      const vurData = await gql(
        "https://graphql.datafordeler.dk/VUR/v1",
        `query GetEjendomsvurdering($vurderingsejendomId: Long!) {
          VUR_Ejendomsvurdering(
            where: { fkVurderingsejendomID: { eq: $vurderingsejendomId } }
            first: 1
          ) {
            nodes {
              ejendomvaerdiBeloeb
              grundvaerdiBeloeb
              vurderetAreal
              aar
            }
          }
        }`,
        { vurderingsejendomId },
      );
      const vurNodes = vurData?.VUR_Ejendomsvurdering?.nodes ?? [];
      if (!vurNodes.length) {
        console.log("  ⚠ VUR_Ejendomsvurdering ikke fundet for vurderingsejendomId:", vurderingsejendomId);
      } else {
        const v = vurNodes[0];
        const fmt = (n: number | null) =>
          n !== null
            ? new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(n)
            : "null";
        console.log("  ✅ Vurderingsår:", v.aar);
        console.log("  ✅ Ejendomsværdi:", fmt(v.ejendomvaerdiBeloeb));
        console.log("  ✅ Grundværdi:", fmt(v.grundvaerdiBeloeb));
        console.log("  ✅ Vurderet areal:", v.vurderetAreal, "m²");
      }
    }
  } catch (e) {
    console.error("  ❌ VUR fejl:", (e as Error).message);
  }
}

console.log("\nTest afsluttet.");
