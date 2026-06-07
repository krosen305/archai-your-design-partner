import type { ReadinessReason } from "@/domain/drawing/decision-engine";

export function validateJordvarmePermit(input: {
  hasJordvarme: boolean;
}): ReadinessReason[] {
  if (!input.hasJordvarme) return [];

  return [
    {
      code: "JORDVARME_PARAGRAPH19_PERMIT",
      severity: "info",
      message: "Jordvarmeboring (> 10 m) kræver §19-tilladelse fra kommunen jf. Miljøbeskyttelsesloven",
      affectedLayer: "siteUse",
    },
    {
      code: "JORDVARME_JUPITER_REGISTRATION",
      severity: "info",
      message: "Jordvarmeanlæg skal registreres i GEUS Jupiter-boringsdatabase efter etablering",
      affectedLayer: "siteUse",
    },
  ];
}
