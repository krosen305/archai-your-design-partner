// Centraliserede feature-flags. Opdater her, ikke i de enkelte services.
//
// Når en integration har et live API klar, sæt flag til false.
// Hvis et live-kald fejler, kan service'en stadig falde tilbage til mock-data
// (det håndteres internt i hver service).

export const FEATURE_FLAGS = {
  /** TingbogenV2 kræver særskilt TINGBOG-abonnement på Datafordeler (ARCH-30). */
  tinglysningMock: true,
  /** Lokalplan PDF-udtræk via Anthropic. False = live (ARCH-53). */
  pdfExtractorMock: false,
  /** Hus-DNA via Claude vision. False = live (ARCH-52). */
  husDnaMock: false,
  /** Byggeanalyse via Anthropic (Byggeoenske → struktureret compliance). False = live (ARCH-83). */
  byggeanalyseMock: false,
  /** Fjernvarme — live via Plandata WFS pdk:theme_pdk_varmeplansomraade_vedtaget_v (ARCH-111). */
  fjernvarmeMock: false,
  /** Billedanalyse via Claude Haiku vision (ARCH-189). False = live. */
  billedanalyseMock: false,
} as const;
