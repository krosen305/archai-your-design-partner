/**
 * PdfExtractorService evals (ARCH-95).
 * Tester AI-udtrækning af lokalplan-regler fra PDF.
 * Alle cases kræver EVAL_LIVE=true (live Anthropic API-kald).
 *
 * Test-PDFer:
 *   NYERE_PDF — Lokalplan fra 2015+ med sadeltag og bebyggelsesprocent
 *   AELDRE_PDF — Ældre lokalplan (~1990) fra Gladsaxe — forventes mangelfuld udtrækning
 */

import type { EvalSuite } from "../types.ts";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import { PdfExtractorService } from "@/integrations/ai/pdf-extractor";

type PdfInput = { pdfUrl: string };

// Nyere lokalplan med klare bestemmelser (Plandata-dokument fra 2015-era)
const NYERE_PDF = "https://dokument.plandata.dk/20_5269647_1427811803747.pdf";

// Ældre lokalplan (~1990, Gladsaxe) — forventes at have sparsomme/null felter
const AELDRE_PDF = "https://dokument.plandata.dk/20_2693062_1100000000000.pdf";

async function runPdfExtractor(input: PdfInput): Promise<LokalplanExtract> {
  return PdfExtractorService.extractLokalplan(input.pdfUrl);
}

export const pdfExtractorSuite: EvalSuite<PdfInput, LokalplanExtract> = {
  name: "PDF extractor",
  run: runPdfExtractor,
  cases: [
    {
      id: "pdf-struktur-nyere",
      description: "Nyere lokalplan-PDF udtrækker alle påkrævede felter korrekt",
      scoring: "structural",
      threshold: 0.85,
      requiresLive: true,
      input: { pdfUrl: NYERE_PDF },
      expected: {
        maxEtager: "defined",
        maxBebyggelsespct: "defined",
        tagform: "defined",
        materialer: "array",
        byggelinjer: "defined",
        specialBestemmelser: "array",
        kilde: "string",
      } as never,
    },

    {
      id: "pdf-struktur-aeldre",
      description: "Ældre/mangelfuld lokalplan returnerer korrekt struktur uden at kaste",
      scoring: "structural",
      threshold: 0.7,
      requiresLive: true,
      input: { pdfUrl: AELDRE_PDF },
      expected: {
        // Null-felter er tilladt — vi tester kun at strukturen er komplet
        materialer: "array",
        specialBestemmelser: "array",
        kilde: "string",
      } as never,
    },

    {
      id: "pdf-semantisk-kvalitet",
      description: "Udtrækning af nyere lokalplan er meningsfuld og konsistent",
      scoring: "semantic",
      threshold: 0.75,
      requiresLive: true,
      input: { pdfUrl: NYERE_PDF },
      rubric: [
        'kilde-feltet er enten "anthropic" eller "mock" — ikke null eller undefined',
        "materialer er et array (evt. tomt) og indeholder kun strings",
        "specialBestemmelser er et array (evt. tomt) og indeholder kun strings",
        "Resultatet ser ud som et udtræk fra en dansk lokalplan — felter giver mening i kontekst",
        "Hvis maxEtager er udfyldt, er det et heltal mellem 1 og 4",
        "Hvis maxBebyggelsespct er udfyldt, er det et tal mellem 10 og 75",
      ],
    },
  ],
};
