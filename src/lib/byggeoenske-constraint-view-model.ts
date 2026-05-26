import type {
  Byggeoenske,
  ComplianceFlag,
  BoligoenskeValidering,
  AdressePreCheckResultat,
} from "@/types/project-state";
import { findFlagForStep } from "@/lib/compliance-flags-utils";

export type StepConstraintViewModel = {
  contextChip: string | null;
  dispensation: {
    needed: boolean;
    acked: boolean;
    kontekst: string;
    graense: string;
    beregnetPct: number | null;
  } | null;
  fjernvarme: "tilgaengelig" | "mismatch" | "unknown" | null;
  lokalplanHint: string | null;
};

const NONE: StepConstraintViewModel = {
  contextChip: null,
  dispensation: null,
  fjernvarme: null,
  lokalplanHint: null,
};

export function buildStepConstraintViewModel(
  stepKey: keyof Byggeoenske,
  value: unknown,
  validering: BoligoenskeValidering | null,
  preCheck: AdressePreCheckResultat | null,
  complianceFlags: ComplianceFlag[],
): StepConstraintViewModel {
  const k = preCheck?.kontekst;

  if (stepKey === "antalEtager") {
    const status = validering?.etagerStatus;
    const ack = validering?.etagerDispensationAcknowledged ?? false;
    return {
      contextChip:
        k?.maxEtager != null ? `Kommuneplanen tillader: maks ${k.maxEtager} etager` : null,
      dispensation:
        status === "dispensation"
          ? {
              needed: !ack,
              acked: ack,
              kontekst: `${String(value)} etager er ikke tilladt her`,
              graense: `${k?.maxEtager ?? "—"} etager`,
              beregnetPct: null,
            }
          : null,
      fjernvarme: null,
      lokalplanHint: null,
    };
  }

  if (stepKey === "oensketAreal") {
    const status = validering?.arealStatus;
    const ack = validering?.arealDispensationAcknowledged ?? false;
    const beregnetPct = validering?.beregnetBebyggelsespct ?? null;
    return {
      contextChip:
        k?.restBygningsareal != null ? `Dit byggepotentiale: ${k.restBygningsareal} m²` : null,
      dispensation:
        status === "dispensation"
          ? {
              needed: !ack,
              acked: ack,
              kontekst: `${String(value)} m² overstiger dit byggepotentiale`,
              graense: `${k?.maxBebyggelsesprocent ?? "—"}% bebyggelse`,
              beregnetPct,
            }
          : null,
      fjernvarme: null,
      lokalplanHint: null,
    };
  }

  if (stepKey === "varmekilde") {
    const hasTilslutning = complianceFlags.some((f) => f.id === "fjernvarme-tilslutningspligt");
    const hasMismatch = complianceFlags.some((f) => f.id === "fjernvarme-mismatch-ingen-daekning");
    return {
      ...NONE,
      fjernvarme: hasTilslutning ? "tilgaengelig" : hasMismatch ? "mismatch" : "unknown",
    };
  }

  if (stepKey === "tagform" || stepKey === "facademateriale") {
    const hint = findFlagForStep(complianceFlags, stepKey);
    return { ...NONE, lokalplanHint: hint ? (hint.detalje ?? hint.label) : null };
  }

  return { ...NONE };
}
