#!/usr/bin/env bun
/**
 * ARCH-247: Tjekditnet CSV-import til broadband_coverage tabel.
 *
 * Henter teknisk mulige hastigheder fra Digitaliseringsstyrelsens open data,
 * parser CSV'en og upserts i broadband_coverage tabel.
 *
 * Kør: bun scripts/import-tjekditnet.ts
 *
 * Kræver SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY i environment.
 * Opdatér URL'en herunder hvis Digitaliseringsstyrelsen skifter filplacering.
 *
 * CSV-format (semikolon-separeret, 16 kolonner):
 *   1: Adgangsadresse-ID
 *   2: Vejnavn
 *   3: Husnummer
 *   4: Postnummer
 *   5: Kommune
 *   6: ETRS89_x
 *   7: ETRS89_y
 *   8: Fast-trådløst download (Mbit/s)
 *   9: Fast-trådløst upload  (Mbit/s)
 *  10: Fiber download        (Mbit/s)
 *  11: Fiber upload          (Mbit/s)
 *  12: Kabel-tv download     (Mbit/s)
 *  13: Kabel-tv upload       (Mbit/s)
 *  14: xDSL download         (Mbit/s)
 *  15: xDSL upload           (Mbit/s)
 *  16: Mobilt bredbånd download (Mbit/s)
 */

import { createClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";

const CSV_URL = "https://tjekditnet.dk/sites/default/files/raadata/tek.zip";
const BATCH_SIZE = 5000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Manglende SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseMbit(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const val = parseFloat(raw.replace(",", "."));
  return isNaN(val) ? null : val;
}

function parseCsvRow(line: string) {
  const cols = line.split(";");
  if (cols.length < 16) return null;

  const id = cols[0]?.trim();
  if (!id || id === "adgangsadresse-ID" || id.toLowerCase().includes("adgangs")) return null;

  return {
    adgangsadresse_id: id,
    fast_traadloes_download_mbit: parseMbit(cols[7]),
    fast_traadloes_upload_mbit: parseMbit(cols[8]),
    fiber_download_mbit: parseMbit(cols[9]),
    fiber_upload_mbit: parseMbit(cols[10]),
    kabel_tv_download_mbit: parseMbit(cols[11]),
    kabel_tv_upload_mbit: parseMbit(cols[12]),
    xdsl_download_mbit: parseMbit(cols[13]),
    xdsl_upload_mbit: parseMbit(cols[14]),
    mobil_download_mbit: parseMbit(cols[15]),
    source_url: CSV_URL,
    imported_at: new Date().toISOString(),
  };
}

async function upsertBatch(batch: ReturnType<typeof parseCsvRow>[]) {
  const rows = batch.filter(Boolean) as NonNullable<ReturnType<typeof parseCsvRow>>[];
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("broadband_coverage")
    .upsert(rows, { onConflict: "adgangsadresse_id" });

  if (error) {
    console.error("Upsert fejl:", error.message);
    throw new Error(error.message);
  }
}

async function main() {
  console.log(`Henter ${CSV_URL}...`);
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  console.log(`Hentet ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Udpakker...`);

  const unzipped = unzipSync(new Uint8Array(buffer));
  const csvFilename = Object.keys(unzipped).find((f) => f.endsWith(".csv"));
  if (!csvFilename) throw new Error("Ingen CSV-fil fundet i ZIP");

  const csvText = new TextDecoder("utf-8").decode(unzipped[csvFilename]);
  const lines = csvText.split("\n");
  console.log(`${lines.length} linjer i ${csvFilename}. Parser...`);

  let batch: ReturnType<typeof parseCsvRow>[] = [];
  let total = 0;
  let skipped = 0;

  for (const line of lines) {
    const row = parseCsvRow(line);
    if (!row) {
      skipped++;
      continue;
    }
    batch.push(row);
    total++;

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batch);
      process.stdout.write(`\r  Importeret: ${total.toLocaleString("da-DK")} rækker...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await upsertBatch(batch);
    total += batch.length;
  }

  console.log(
    `\nFærdig! ${total.toLocaleString("da-DK")} adresser importeret, ${skipped} linjer sprunget over.`,
  );
}

main().catch((e) => {
  console.error("Import fejlede:", e);
  process.exit(1);
});
