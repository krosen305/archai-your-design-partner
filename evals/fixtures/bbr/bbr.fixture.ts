/**
 * BBR fixtures — BbrKompliantData-objekter til compliance-evals.
 * Felter matcher den faktiske type fra BbrService.getKompliantData().
 */

import type { BbrKompliantData } from '@/integrations/bbr/client'

export const BBR_FIXTURES = {
  /** Standard parcelhus — 15% bebyggelse, 2 etager */
  standardParcelhus: {
    byggeaar: '1985',
    bebygget_areal: 120,
    samlet_areal: 180,
    antal_etager: 2,
    anvendelseskode: '120',
    anvendelse_tekst: 'Fritliggende enfamilieshus',
    grundareal: 800,
    bebyggelsesprocent: 15,
    beregning_mulig: true,
    fejl: null,
  } satisfies BbrKompliantData,

  /** Parcelhus der overskrider 30% bebyggelsesprocent */
  overskredetBebyggelsesprocent: {
    byggeaar: '2005',
    bebygget_areal: 256,
    samlet_areal: 380,
    antal_etager: 2,
    anvendelseskode: '120',
    anvendelse_tekst: 'Fritliggende enfamilieshus',
    grundareal: 800,
    bebyggelsesprocent: 32,
    beregning_mulig: true,
    fejl: null,
  } satisfies BbrKompliantData,

  /** Edge case: ingen bygninger (råjord) */
  ingenBygninger: {
    byggeaar: null,
    bebygget_areal: null,
    samlet_areal: null,
    antal_etager: null,
    anvendelseskode: null,
    anvendelse_tekst: null,
    grundareal: 600,
    bebyggelsesprocent: 0,
    beregning_mulig: true,
    fejl: null,
  } satisfies BbrKompliantData,

  /** Manglende grundareal — beregning ikke mulig */
  manglerGrundareal: {
    byggeaar: '1975',
    bebygget_areal: 110,
    samlet_areal: 160,
    antal_etager: 2,
    anvendelseskode: '120',
    anvendelse_tekst: 'Fritliggende enfamilieshus',
    grundareal: null,
    bebyggelsesprocent: null,
    beregning_mulig: false,
    fejl: 'Grundareal ikke tilgængeligt',
  } satisfies BbrKompliantData,
} as const
