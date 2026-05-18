export type ReferenceFixture = {
  /** Stable identifier — used by tests and QA guides to reference this case */
  caseId: string;
  /** Human label, e.g. "Hasselvej 48, 2830 Virum" */
  label: string;
  /** Why this case exists and what it catches */
  why: string;
  /**
   * "live" — real Datafordeler address ID; can be used in RUN_LIVE_DATAFORDELER_SMOKE=true runs.
   * "fixture" — mock-only; adresseid is null. Tests supply mock fetch responses.
   */
  tier: "live" | "fixture";
  /** Real Datafordeler adresseid for live-tier cases; null for fixture-tier */
  adresseid: string | null;
  /** Real Datafordeler adgangsadresseid (husnummer-id) for live-tier cases; null for fixture-tier */
  adgangsadresseid: string | null;
  expected: {
    /** Matrikelregisteret registreretAreal in m² */
    grundareal: number | null;
    /** FBB SAVE bevaringsvaerdi 1-9; null if no FBB registration */
    save_value: number | null;
    /** true if FBB returned at least one building record for this address */
    fbb_hit: boolean;
    /** true if rule engine or natural-protection check triggers an absolute building stop */
    hard_stop: boolean;
    /** MAT strandbeskyttelse_omfang flag; null if not verified */
    naturbeskyttelse_strandbeskyttelse: boolean | null;
    /** EBR BFE-nummer; null if not verified or not applicable */
    bfe_nr: string | null;
    /** Minimum number of lokalplaner expected to cover this address */
    lokalplaner_min: number;
    /** true for negative test cases where the pipeline is expected to return a partial/error result */
    error_expected?: boolean;
  };
};

export const GOLDEN_REFERENCE_FIXTURES: ReferenceFixture[] = [
  // ─── 1. Normal villa, SAVE 3 ────────────────────────────────────────────────
  {
    caseId: "hasselvej-48",
    label: "Hasselvej 48, 2830 Virum",
    why:
      "Normal villa med SAVE 3 FBB-hit og grundareal direkte fra DAR_Jordstykke. " +
      "Regressionsankeret for DAR registreringstid (ARCH-221) og FBB ois_id CQL (ARCH-166).",
    tier: "live",
    adresseid: "0a3f50a6-34da-32b8-e044-0003ba298018",
    adgangsadresseid: "0a3f507d-4cf9-32b8-e044-0003ba298018",
    expected: {
      grundareal: 441,
      save_value: 3,
      fbb_hit: true,
      hard_stop: false,
      naturbeskyttelse_strandbeskyttelse: false,
      bfe_nr: null,
      lokalplaner_min: 0,
    },
  },

  // ─── 2. Ejerlejlighed, EBR dual-mode BFE ────────────────────────────────────
  {
    caseId: "vindegade-142-ejerlejlighed",
    label: "Vindegade 142 (ejerlejlighed, SFE-rute)",
    why:
      "Ejerlejlighed hvor GrundarealResolver finder grundareal=1703 via husnummer→EBR→SFE-rute. " +
      "Fixture for EBR dual-mode BFE-opslag (ARCH-223, ARCH-225).",
    tier: "fixture",
    adresseid: null,
    adgangsadresseid: null,
    expected: {
      grundareal: 1703,
      save_value: null,
      fbb_hit: false,
      hard_stop: false,
      naturbeskyttelse_strandbeskyttelse: null,
      bfe_nr: "100206145",
      lokalplaner_min: 0,
    },
  },

  // ─── 3. Ejerlejlighed, adresse-only EBR fallback ────────────────────────────
  {
    caseId: "osterlunden-10-adressefallback",
    label: "Østerlunden 10 (ejerlejlighed, adresse-only EBR fallback)",
    why:
      "Husnummer-BFE er tom → GrundarealResolver falder tilbage til adresse-ruten og finder " +
      "grundareal=3580 via BFE 289814 → MAT_Ejerlejlighed. Fixture for ARCH-223 adresse-fallback.",
    tier: "fixture",
    adresseid: null,
    adgangsadresseid: null,
    expected: {
      grundareal: 3580,
      save_value: null,
      fbb_hit: false,
      hard_stop: false,
      naturbeskyttelse_strandbeskyttelse: null,
      bfe_nr: "289814",
      lokalplaner_min: 0,
    },
  },

  // ─── 4. Ingen BFE-hit (negative case) ───────────────────────────────────────
  {
    caseId: "no-bfe-no-grundareal",
    label: "Adresse uden BFE (negativ case)",
    why:
      "Hverken husnummer- eller adresse-ruten finder BFE → grundareal=null, fejl i resolver. " +
      "Fanger regression hvor pipelinen crasher i stedet for at returnere null sikkert.",
    tier: "fixture",
    adresseid: null,
    adgangsadresseid: null,
    expected: {
      grundareal: null,
      save_value: null,
      fbb_hit: false,
      hard_stop: false,
      naturbeskyttelse_strandbeskyttelse: null,
      bfe_nr: null,
      lokalplaner_min: 0,
      error_expected: true,
    },
  },

  // ─── 5. Rækkehus med sekundære bygninger ────────────────────────────────────
  {
    caseId: "raekkehus-med-garage",
    label: "Rækkehus med garage (sekundære bygninger)",
    why:
      "bebygget_areal summerer kun primærbygning (BBR kode 120) — garage (kode 910) ekskluderes. " +
      "Fixture for ARCH-227 BBR-aggregering.",
    tier: "fixture",
    adresseid: null,
    adgangsadresseid: null,
    expected: {
      grundareal: null,
      save_value: null,
      fbb_hit: false,
      hard_stop: false,
      naturbeskyttelse_strandbeskyttelse: null,
      bfe_nr: null,
      lokalplaner_min: 0,
    },
  },

  // ─── 6. Strandbeskyttelse — hard stop ───────────────────────────────────────
  {
    caseId: "strandbeskyttelse-hardstop",
    label: "Strandbeskyttelse (syntetisk hard stop)",
    why:
      "mat_strandbeskyttelse=true trigger hard stop → Layer 4 (GEUS, DHM, DK-Jord, naboer) springes over. " +
      "Verificerer at hard-stop-gaten virker og at UI kan vise årsagen.",
    tier: "fixture",
    adresseid: null,
    adgangsadresseid: null,
    expected: {
      grundareal: 800,
      save_value: null,
      fbb_hit: false,
      hard_stop: true,
      naturbeskyttelse_strandbeskyttelse: true,
      bfe_nr: null,
      lokalplaner_min: 0,
    },
  },
];
