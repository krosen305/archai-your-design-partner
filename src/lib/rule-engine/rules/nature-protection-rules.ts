import type { NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";
import type { ReadinessReason } from "@/domain/drawing/decision-engine";

const LAW_REFS: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "NBL §15 — dispensation fra Kystdirektoratet kræves",
  skovbyggelinje: "NBL §17 — dispensation fra Miljøstyrelsen kræves",
  åbeskyttelse: "NBL §16 — dispensation kræves",
  fortidsmindebeskyttelse: "NBL §18 — Slots- og Kulturstyrelsen",
  klitfredning: "NBL §8 — dispensation fra Kystdirektoratet kræves",
};

const DISPLAY_NAMES: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "Strandbeskyttelseslinje",
  skovbyggelinje: "Skovbyggelinje",
  åbeskyttelse: "Åbeskyttelseslinje",
  fortidsmindebeskyttelse: "Fortidsmindebeskyttelseslinje",
  klitfredning: "Klitfredning",
};

export function validateNaturbeskyttelse(
  naturbeskyttelse: NaturbeskyttelseLayer[],
): ReadinessReason[] {
  return naturbeskyttelse
    .filter((layer) => layer.intersectsProposedBuilding)
    .map((layer) => ({
      code: `NATURBESKYTTELSE_${layer.type.toUpperCase()}`,
      severity: "blocking" as const,
      message: `${DISPLAY_NAMES[layer.type]} krydser foreslået bygning — ${LAW_REFS[layer.type]}`,
      affectedLayer: "naturbeskyttelse",
    }));
}
