// Centraliserede feature-flags. Opdater her, ikke i de enkelte services.
//
// Når en integration har et live API klar, sæt flag til false.
// Hvis et live-kald fejler, kan service'en stadig falde tilbage til mock-data
// (det håndteres internt i hver service).

export const FEATURE_FLAGS = {
  /** Tinglysning servitut-API er ikke implementeret endnu (ARCH-26). */
  tinglysningMock: true,
  /** Lokalplan PDF-udtræk via Anthropic. False = live (ARCH-53). */
  pdfExtractorMock: false,
  /** Hus-DNA via Claude vision. False = live (ARCH-52). */
  husDnaMock: false,
  /** Byggeanalyse via Anthropic (Byggeoenske → struktureret compliance). False = live (ARCH-83). */
  byggeanalyseMock: false,
} as const;
