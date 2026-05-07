/**
 * Lokalplan fixtures — Kommuneplanramme-objekter til compliance-evals og
 * HusDna-input til generator-evals.
 */

import type { Kommuneplanramme } from '@/integrations/plandata/client'
import type { HusDnaInput } from '@/integrations/ai/hus-dna-generator'

export const RAMME_FIXTURES = {
  /** Standard boliglokalplan — max 30% bebyggelse, max 2 etager */
  standardBolig: {
    planid: 'test-plan-001',
    plannavn: 'Lokalplan 42 — Boligområde',
    plannr: '42',
    kommunenavn: 'Testkommune',
    komnr: 999,
    bebygpct: 30,
    maxetager: 2,
    maxbygnhjd: 8.5,
    anvgen: 1,
    anvendelseGenerel: 'Boligområde',
    fremtidigzonestatus: 'byzone',
    sforhold: null,
    planstatus: 'V',
    datoIkraft: '2018-01-01',
    plandokumentLink: null,
  } satisfies Kommuneplanramme,

  /** Strammer plan — max 25% bebyggelse, max 1.5 etager */
  taetLav: {
    planid: 'test-plan-002',
    plannavn: 'Lokalplan 87 — Tæt-lav bebyggelse',
    plannr: '87',
    kommunenavn: 'Testkommune',
    komnr: 999,
    bebygpct: 25,
    maxetager: 1,
    maxbygnhjd: 6.0,
    anvgen: 1,
    anvendelseGenerel: 'Boligområde, tæt-lav',
    fremtidigzonestatus: 'byzone',
    sforhold: null,
    planstatus: 'V',
    datoIkraft: '2021-06-01',
    plandokumentLink: null,
  } satisfies Kommuneplanramme,

  /** Ingen kommuneplanramme fundet */
  ingenRamme: null satisfies Kommuneplanramme | null,
} as const

export const HUS_DNA_FIXTURES = {
  modernMinimalistisk: {
    fritekst: `
      Jeg drømmer om et moderne, minimalistisk hus med store vinduespartier og meget dagslys.
      Åben planløsning i stueetagen med direkte forbindelse til haven.
      Materialer: beton, glas og træ. Ca. 180-220 m². Budget: 5-6 mio. kr.
    `.trim(),
    billedUrls: [],
  } satisfies HusDnaInput,

  traditioneltParcelhus: {
    fritekst: `
      Et klassisk dansk parcelhus med sadeltag. Ikke for moderne.
      4 soveværelser, stor stue og separat spisekøkken. Garage til 2 biler. Ca. 160-180 m².
    `.trim(),
    billedUrls: [],
  } satisfies HusDnaInput,
} as const
