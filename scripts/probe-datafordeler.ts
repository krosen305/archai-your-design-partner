// Probe Datafordeler-endpoints direkte for at adskille:
// - "Vores input er forkert" (HTTP 400 / GraphQL-fejl / tomme nodes)
// - "Endpoint er flaky" (timeout / 502 / 503)
//
// Tester 3 sekventielle kald per service med samme input som rigtige analyser.

const KEY = process.env.DATAFORDELER_API_KEY;
if (!KEY) {
  console.error("Mangler DATAFORDELER_API_KEY");
  process.exit(1);
}

const now = new Date().toISOString();
const ADRESSE_ID = process.argv[2] ?? "0a3f50a6-34da-32b8-e044-0003ba298018";

const DAR = new URL("https://graphql.datafordeler.dk/DAR/v2");
DAR.searchParams.set("apiKey", KEY);
const BBR = new URL("https://graphql.datafordeler.dk/BBR/v2");
BBR.searchParams.set("apiKey", KEY);
const VUR = new URL("https://graphql.datafordeler.dk/VUR/v2");
VUR.searchParams.set("apiKey", KEY);

const DAR_ADRESSE = `
query GetDarAdresse($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  DAR_Adresse(where: { id_lokalId: { eq: $id } } virkningstid: $vt registreringstid: $rt first: 1) {
    nodes { id_lokalId adressebetegnelse husnummer status }
  }
}`;

const DAR_HUSNUMMER = `
query GetDarHusnummer($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  DAR_Husnummer(where: { id_lokalId: { eq: $id } } virkningstid: $vt registreringstid: $rt first: 1) {
    nodes { id_lokalId adgangsadressebetegnelse postnummer adgangspunkt jordstykke status }
  }
}`;

async function probe(name: string, url: URL, query: string, variables: Record<string, unknown>) {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const dur = Date.now() - start;
    const text = await res.text();
    let summary = `HTTP ${res.status} dur=${dur}ms`;
    try {
      const json = JSON.parse(text) as { errors?: { message: string }[]; data?: unknown };
      if (json.errors?.length) {
        summary += ` errors=${JSON.stringify(json.errors[0])}`;
      } else if (json.data) {
        const first = Object.values(json.data)[0] as { nodes?: unknown[] };
        summary += ` nodes=${first?.nodes?.length ?? 0}`;
      }
    } catch {
      summary += ` body=${text.slice(0, 200)}`;
    }
    console.log(`  ${name}: ${summary}`);
    return text;
  } catch (e) {
    const dur = Date.now() - start;
    console.log(`  ${name}: FAIL dur=${dur}ms ${(e as Error).message}`);
    return null;
  }
}

console.log(`Probing DAR with adresseid=${ADRESSE_ID}`);
console.log(`Time: ${now}\n`);

console.log("=== DAR_Adresse (3 sequential) ===");
let husnummerFK: string | null = null;
for (let i = 1; i <= 3; i++) {
  const txt = await probe(`call ${i}`, DAR, DAR_ADRESSE, { id: ADRESSE_ID, vt: now, rt: now });
  if (i === 1 && txt) {
    const json = JSON.parse(txt) as {
      data?: { DAR_Adresse?: { nodes?: { husnummer?: string }[] } };
    };
    husnummerFK = json.data?.DAR_Adresse?.nodes?.[0]?.husnummer ?? null;
  }
}

if (husnummerFK) {
  console.log(`\n=== DAR_Husnummer with FK=${husnummerFK} (3 sequential) ===`);
  for (let i = 1; i <= 3; i++) {
    await probe(`call ${i}`, DAR, DAR_HUSNUMMER, { id: husnummerFK, vt: now, rt: now });
  }
} else {
  console.log("Kunne ikke udlede husnummerFK fra DAR_Adresse — skipper husnummer-probe");
}
