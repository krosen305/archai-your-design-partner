// SERVER-SIDE ONLY — never import from browser code.
//
// Tjekditnet integration — teknisk mulig bredbånds- og mobilcoverage pr. adresse.
//
// Datakilde: Digitaliseringsstyrelsen (tjekditnet.dk)
// Adgangsmodel: Bulk CSV-download → Supabase broadband_coverage tabel
//   Import script: scripts/import-tjekditnet.ts
//   CSV URL: https://tjekditnet.dk/sites/default/files/raadata/tek.zip
//
// Selskabsnavne gemmes IKKE. Versionen "uden selskabsnavne" (gratis, åben data)
// er kun tilgængeligt som bulk-download, ikke som per-adresse REST API.
// Per-adresse REST API kræver uid-registrering og viser selskabsnavne.
//
// Opslag: query fra broadband_coverage tabel via adgangsadresse-ID.

import { makeOkResult, makeErrorResult, type SourceResult } from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SOURCE_URL = "https://tjekditnet.dk/sites/default/files/raadata/tek.zip";
const KILDE = "tjekditnet";

export type TjekditnetCoverageData = {
  // Teknisk mulige hastigheder i Mbit/s (null = teknologien ikke tilgængelig)
  fast_traadloes_download_mbit: number | null;
  fast_traadloes_upload_mbit: number | null;
  fiber_download_mbit: number | null;
  fiber_upload_mbit: number | null;
  kabel_tv_download_mbit: number | null;
  kabel_tv_upload_mbit: number | null;
  xdsl_download_mbit: number | null;
  xdsl_upload_mbit: number | null;
  mobil_download_mbit: number | null;
  // Afledte bool — true = teknologien er teknisk mulig (hastighed > 0)
  fiber_tilgaengelig: boolean | null;
  kabel_tilgaengelig: boolean | null;
  xdsl_tilgaengelig: boolean | null;
  fast_traadloes_tilgaengelig: boolean | null;
  mobil_tilgaengelig: boolean | null;
  // Bedste faste bredbånd på tværs af teknologier
  max_fast_download_mbit: number | null;
  match_type: "uuid" | "no_hit" | "db_error";
  kilde: "tjekditnet";
};

function deriveFromRow(row: {
  fiber_download_mbit: number | null;
  kabel_tv_download_mbit: number | null;
  xdsl_download_mbit: number | null;
  fast_traadloes_download_mbit: number | null;
  fast_traadloes_upload_mbit: number | null;
  fiber_upload_mbit: number | null;
  kabel_tv_upload_mbit: number | null;
  xdsl_upload_mbit: number | null;
  mobil_download_mbit: number | null;
}): TjekditnetCoverageData {
  const fiberMbit = row.fiber_download_mbit;
  const kabelMbit = row.kabel_tv_download_mbit;
  const xdslMbit = row.xdsl_download_mbit;
  const fwaMbit = row.fast_traadloes_download_mbit;

  const maxFast = Math.max(fiberMbit ?? 0, kabelMbit ?? 0, xdslMbit ?? 0, fwaMbit ?? 0) || null;

  return {
    fast_traadloes_download_mbit: row.fast_traadloes_download_mbit,
    fast_traadloes_upload_mbit: row.fast_traadloes_upload_mbit,
    fiber_download_mbit: fiberMbit,
    fiber_upload_mbit: row.fiber_upload_mbit,
    kabel_tv_download_mbit: kabelMbit,
    kabel_tv_upload_mbit: row.kabel_tv_upload_mbit,
    xdsl_download_mbit: xdslMbit,
    xdsl_upload_mbit: row.xdsl_upload_mbit,
    mobil_download_mbit: row.mobil_download_mbit,
    fiber_tilgaengelig: fiberMbit !== null ? fiberMbit > 0 : false,
    kabel_tilgaengelig: kabelMbit !== null ? kabelMbit > 0 : false,
    xdsl_tilgaengelig: xdslMbit !== null ? xdslMbit > 0 : false,
    fast_traadloes_tilgaengelig: fwaMbit !== null ? fwaMbit > 0 : false,
    mobil_tilgaengelig:
      row.mobil_download_mbit !== null ? (row.mobil_download_mbit ?? 0) > 0 : false,
    max_fast_download_mbit: maxFast,
    match_type: "uuid",
    kilde: "tjekditnet",
  };
}

export class TjekditnetService {
  static async getCoverage(
    adgangsadresseid: string,
  ): Promise<SourceResult<TjekditnetCoverageData>> {
    try {
      const { data, error } = await supabaseAdmin
        .from("broadband_coverage")
        .select("*")
        .eq("adgangsadresse_id", adgangsadresseid)
        .maybeSingle();

      if (error) {
        throw new Error(`broadband_coverage query fejl: ${error.message}`);
      }

      if (!data) {
        return makeOkResult<TjekditnetCoverageData>(
          {
            fast_traadloes_download_mbit: null,
            fast_traadloes_upload_mbit: null,
            fiber_download_mbit: null,
            fiber_upload_mbit: null,
            kabel_tv_download_mbit: null,
            kabel_tv_upload_mbit: null,
            xdsl_download_mbit: null,
            xdsl_upload_mbit: null,
            mobil_download_mbit: null,
            fiber_tilgaengelig: null,
            kabel_tilgaengelig: null,
            xdsl_tilgaengelig: null,
            fast_traadloes_tilgaengelig: null,
            mobil_tilgaengelig: null,
            max_fast_download_mbit: null,
            match_type: "no_hit",
            kilde: "tjekditnet",
          },
          { kilde: KILDE, sourceUrl: SOURCE_URL, rawFeatureCount: 0, confidence: "missing" },
        );
      }

      return makeOkResult<TjekditnetCoverageData>(deriveFromRow(data), {
        kilde: KILDE,
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 1,
        confidence: "confirmed",
      });
    } catch (e) {
      logServerEvent({
        module: "tjekditnet/client",
        operation: "getCoverage",
        severity: "degraded",
        message: "Tjekditnet DB-opslag fejl",
        error: e,
      });
      return makeErrorResult<TjekditnetCoverageData>(e, { kilde: KILDE, sourceUrl: SOURCE_URL });
    }
  }
}
