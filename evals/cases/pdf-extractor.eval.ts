/**
 * PdfExtractorService evals — tester AI-udtrækning af lokalplan-regler.
 * Alle cases kræver EVAL_LIVE=true (live Anthropic API-kald).
 */

import type { EvalSuite } from '../types.ts'
import type { LokalplanExtract } from '@/integrations/ai/pdf-extractor'
import { PdfExtractorService } from '@/integrations/ai/pdf-extractor'

type PdfInput = { pdfUrl: string }

async function runPdfExtractor(input: PdfInput): Promise<LokalplanExtract> {
  return PdfExtractorService.extractLokalplan(input.pdfUrl)
}

export const pdfExtractorSuite: EvalSuite<PdfInput, LokalplanExtract> = {
  name: 'PDF extractor',
  run: runPdfExtractor,
  cases: [
    {
      id: 'pdf-struktur',
      description: 'Alle påkrævede felter udtrækkes fra lokalplan-PDF',
      scoring: 'structural',
      threshold: 0.8,
      requiresLive: true,
      input: {
        // Erstat med URL til en reel test-lokalplan fra Plandata
        pdfUrl: 'https://dokument.plandata.dk/20_5269647_1427811803747.pdf',
      },
      expected: {
        maxEtager: 'defined',
        maxBebyggelsespct: 'defined',
        tagform: 'defined',
        materialer: 'array',
        byggelinjer: 'defined',
        specialBestemmelser: 'array',
        kilde: 'string',
      } as never,
    },
  ],
}
