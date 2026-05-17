import { BbrService } from "../src/integrations/bbr/client";
import { DarService } from "../src/integrations/dar/client";
import { MatService } from "../src/integrations/mat/client";

type CliInput = {
  addressQuery: string | null;
  adresseId: string | null;
};

function parseCliArgs(argv: string[]): CliInput {
  let addressQuery: string | null = null;
  let adresseId: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;

    if (key === "--address") {
      addressQuery = value;
      i += 1;
      continue;
    }
    if (key === "--adresseid") {
      adresseId = value;
      i += 1;
    }
  }

  return { addressQuery, adresseId };
}

function redactUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.searchParams.has("apiKey")) {
      url.searchParams.set("apiKey", "***REDACTED***");
    }
    return url.toString();
  } catch {
    return input;
  }
}

function shortenQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function installFetchInspector() {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlRaw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const interesting =
      urlRaw.includes("datafordeler.dk") || urlRaw.includes("dataforsyningen.dk/adresser");

    if (!interesting) {
      return originalFetch(input, init);
    }

    const method = (init?.method ?? "GET").toUpperCase();
    console.log("\n=== HTTP REQUEST ===");
    console.log("URL:", redactUrl(urlRaw));
    console.log("Method:", method);

    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as { query?: string; variables?: unknown };
        if (body.query) {
          console.log("GraphQL Query:", shortenQuery(body.query));
        }
        if (body.variables) {
          console.log("Variables:", JSON.stringify(body.variables, null, 2));
        }
      } catch {
        console.log("Body:", init.body);
      }
    }

    const response = await originalFetch(input, init);
    const cloned = response.clone();
    const text = await cloned.text();

    console.log("--- HTTP RESPONSE ---");
    console.log("Status:", response.status);
    try {
      const json = JSON.parse(text);
      console.log("JSON:", JSON.stringify(json, null, 2));
    } catch {
      console.log("Text:", text.slice(0, 2000));
    }
    console.log("=== END ===\n");

    return response;
  };
}

async function resolveAdresseId(addressQuery: string): Promise<string> {
  const dawaUrl = new URL("https://api.dataforsyningen.dk/adresser");
  dawaUrl.searchParams.set("q", addressQuery);
  dawaUrl.searchParams.set("per_side", "1");

  const res = await fetch(dawaUrl.toString());
  if (!res.ok) {
    throw new Error(`DAWA adresseopslag fejlede: HTTP ${res.status}`);
  }

  const rows = (await res.json()) as Array<{ id?: string; adressebetegnelse?: string }>;
  const first = rows[0];
  if (!first?.id) {
    throw new Error(`Ingen adresse fundet for query: "${addressQuery}"`);
  }

  console.log("Valgt adresse fra DAWA:", first.adressebetegnelse ?? "(ukendt)");
  console.log("Adresse-ID:", first.id);
  return first.id;
}

async function main() {
  const input = parseCliArgs(process.argv.slice(2));
  if (!input.addressQuery && !input.adresseId) {
    console.error("Brug enten --address \"<vej nr, postnr by>\" eller --adresseid \"<uuid>\".");
    process.exit(1);
  }

  installFetchInspector();

  const adresseId = input.adresseId ?? (await resolveAdresseId(input.addressQuery as string));

  console.log("\n=== SERVICE INPUTS ===");
  console.log("DarService.getAddressDetails:", JSON.stringify({ darAdresseLokalId: adresseId }, null, 2));

  const dar = await DarService.getAddressDetails(adresseId);
  console.log("\n=== SERVICE OUTPUT: DAR ===");
  console.log(JSON.stringify(dar, null, 2));

  console.log("\n=== SERVICE INPUTS ===");
  console.log(
    "BbrService.getKompliantData:",
    JSON.stringify({ adgangsadresseid: dar.adgangsadresseid, grundareal: dar.grundareal }, null, 2),
  );
  const bbr = await BbrService.getKompliantData(dar.adgangsadresseid, dar.grundareal);
  console.log("\n=== SERVICE OUTPUT: BBR ===");
  console.log(JSON.stringify(bbr, null, 2));

  if (dar.ejerlavskode && dar.matrikelnummer) {
    console.log("\n=== SERVICE INPUTS ===");
    console.log(
      "MatService.getGrundareal:",
      JSON.stringify({ ejerlavskode: dar.ejerlavskode, matrikelnummer: dar.matrikelnummer }, null, 2),
    );
    const mat = await MatService.getGrundareal(dar.ejerlavskode, dar.matrikelnummer);
    console.log("\n=== SERVICE OUTPUT: MAT ===");
    console.log(JSON.stringify(mat, null, 2));
  } else {
    console.log(
      "\nMAT-sammenligning hoppet over, fordi DAR ikke gav både ejerlavskode og matrikelnummer på denne adresse.",
    );
  }
}

void main().catch((error) => {
  console.error("\nScriptet fejlede:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
