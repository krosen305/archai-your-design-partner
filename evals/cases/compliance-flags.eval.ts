/**
 * Compliance flags evals — tester den deterministiske regellogik.
 * Score: STRUCTURAL — tjekker at flags-arrayet indeholder korrekte elementer.
 */

import type { EvalSuite } from '../types.ts'
import type { BbrKompliantData } from '@/integrations/bbr/client'
import type { Kommuneplanramme } from '@/integrations/plandata/client'
import type { ComplianceFlag } from '@/lib/project-store'
import { deriveComplianceFlags } from '@/lib/project-store'
import { BBR_FIXTURES } from '../fixtures/bbr/bbr.fixture.ts'
import { RAMME_FIXTURES } from '../fixtures/lokalplan/lokalplan.fixture.ts'

type ComplianceInput = {
  bbr: BbrKompliantData
  ramme: Kommuneplanramme | null
}

async function runComplianceCheck(input: ComplianceInput): Promise<ComplianceFlag[]> {
  return deriveComplianceFlags(input.bbr, input.ramme)
}

export const complianceSuite: EvalSuite<ComplianceInput, ComplianceFlag[]> = {
  name: 'Compliance flags',
  run: runComplianceCheck,
  cases: [
    {
      id: 'compliance-standard-ok',
      description: 'Parcelhus 15% bebyggelse — under 30% max → bebyggelsesprocent ok',
      scoring: 'structural',
      threshold: 1.0,
      input: {
        bbr: BBR_FIXTURES.standardParcelhus,
        ramme: RAMME_FIXTURES.standardBolig,
      },
      expected: {
        // Forventer array med mindst bebyggelsesprocent og etager flags
        length: 'defined',
      } as never,
    },

    {
      id: 'compliance-overskredet-bebyggelse',
      description: 'Parcelhus 32% bebyggelse — over 30% max → blocker',
      scoring: 'exact',
      threshold: 1.0,
      input: {
        bbr: BBR_FIXTURES.overskredetBebyggelsesprocent,
        ramme: RAMME_FIXTURES.standardBolig,
      },
      expected: [
        {
          id: 'bebyggelsesprocent',
          label: 'Bebyggelsesprocent',
          status: 'blocker',
          detalje: null,
          aktuelVærdi: '32%',
          tilladt: '30%',
          kilde: 'beregnet',
        },
        {
          id: 'etager',
          label: 'Antal etager',
          status: 'ok',
          detalje: null,
          aktuelVærdi: '2',
          tilladt: '2',
          kilde: 'bbr',
        },
      ] satisfies ComplianceFlag[],
    },

    {
      id: 'compliance-ingen-ramme',
      description: 'Ingen kommuneplanramme — advarsel på alle flag',
      scoring: 'structural',
      threshold: 1.0,
      input: {
        bbr: BBR_FIXTURES.standardParcelhus,
        ramme: null,
      },
      expected: { length: 'defined' } as never,
    },

    {
      id: 'compliance-null-bbr',
      description: 'Edge case: null BBR-data → tom flags-array',
      scoring: 'exact',
      threshold: 1.0,
      input: {
        bbr: BBR_FIXTURES.manglerGrundareal,
        ramme: RAMME_FIXTURES.standardBolig,
      },
      // manglerGrundareal har antal_etager=2 men bebyggelsesprocent=null
      // → kun etager-flag forventes
      expected: [
        {
          id: 'etager',
          label: 'Antal etager',
          status: 'ok',
          detalje: null,
          aktuelVærdi: '2',
          tilladt: '2',
          kilde: 'bbr',
        },
      ] satisfies ComplianceFlag[],
    },
  ],
}
