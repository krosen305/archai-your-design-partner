/**
 * HusDnaGeneratorService evals — tester AI-generering af Hus-DNA.
 * Alle cases kræver EVAL_LIVE=true (live Anthropic API-kald).
 */

import type { EvalSuite } from '../types.ts'
import type { HusDna } from '@/lib/project-store'
import type { HusDnaInput } from '@/integrations/ai/hus-dna-generator'
import { HusDnaGeneratorService } from '@/integrations/ai/hus-dna-generator'
import { HUS_DNA_FIXTURES } from '../fixtures/lokalplan/lokalplan.fixture.ts'

async function runHusDnaGenerator(input: HusDnaInput): Promise<HusDna> {
  return HusDnaGeneratorService.generate(input.fritekst, input.billedUrls)
}

export const husDnaSuite: EvalSuite<HusDnaInput, HusDna> = {
  name: 'Hus-DNA generator',
  run: runHusDnaGenerator,
  cases: [
    {
      id: 'hus-dna-struktur',
      description: 'Output har alle påkrævede felter',
      scoring: 'structural',
      threshold: 1.0,
      requiresLive: true,
      input: HUS_DNA_FIXTURES.modernMinimalistisk,
      expected: {
        stil: 'string',
        bruttoareal: 'string',
        etager: 'string',
        tagform: 'string',
        energiklasse: 'string',
        saerligeKrav: 'array',
        confidence: 'number',
        kilde: 'string',
      } as never,
    },

    {
      id: 'hus-dna-semantik',
      description: 'Modernistisk fritekst giver relevant moderne stil-output',
      scoring: 'semantic',
      threshold: 0.8,
      requiresLive: true,
      input: HUS_DNA_FIXTURES.modernMinimalistisk,
      rubric: [
        'Stil-feltet afspejler moderne/minimalistisk arkitektur',
        'Bruttoareal er i intervallet 150-250 m²',
        'Output er på dansk',
        'saerligeKrav indeholder mindst ét punkt',
      ],
    },
  ],
}

// Re-eksporteret som orchestratorSuite til runner.ts
export const orchestratorSuite = husDnaSuite
