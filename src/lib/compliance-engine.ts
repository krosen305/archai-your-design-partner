import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";

// ---------------------------------------------------------------------------
// Output type — ARCH-33
// ---------------------------------------------------------------------------

export type ComplianceMetrics = {
  // Areas (m²)
  grundareal: number | null;
  currentBygningsareal: number | null; // bebygget_areal fra BBR
  maxBygningsareal: number | null; // grundareal × (maxBebyggelsesprocent / 100)
  remainingBygningsareal: number | null; // maxBygningsareal - currentBygningsareal

  // Percentages
  currentBebyggelsesprocent: number | null;
  maxBebyggelsesprocent: number | null;

  // Floors
  currentEtager: number | null;
  maxEtager: number | null;

  // Height — ingen aktuel værdi i BBR, kun max fra kommuneplanramme
  maxBygningshoejde: number | null;

  // Overall compliance (false hvis nogen grænse overskrides)
  erCompliant: boolean;
};

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateComplianceMetrics(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
): ComplianceMetrics {
  const grundareal = bbr?.grundareal ?? null;
  const currentBygningsareal = bbr?.bebygget_areal ?? null;
  const currentBebyggelsesprocent = bbr?.bebyggelsesprocent ?? null;
  const maxBebyggelsesprocent = ramme?.bebygpct ?? null;
  const currentEtager = bbr?.antal_etager ?? null;
  const maxEtager = ramme?.maxetager ?? null;
  const maxBygningshoejde = ramme?.maxbygnhjd ?? null;

  const maxBygningsareal =
    grundareal !== null && maxBebyggelsesprocent !== null
      ? Math.round((grundareal * maxBebyggelsesprocent) / 100)
      : null;

  const remainingBygningsareal =
    maxBygningsareal !== null && currentBygningsareal !== null
      ? maxBygningsareal - currentBygningsareal
      : null;

  const areaOk =
    currentBebyggelsesprocent === null ||
    maxBebyggelsesprocent === null ||
    currentBebyggelsesprocent <= maxBebyggelsesprocent;

  const etagerOk =
    currentEtager === null || maxEtager === null || currentEtager <= maxEtager;

  return {
    grundareal,
    currentBygningsareal,
    maxBygningsareal,
    remainingBygningsareal,
    currentBebyggelsesprocent,
    maxBebyggelsesprocent,
    currentEtager,
    maxEtager,
    maxBygningshoejde,
    erCompliant: areaOk && etagerOk,
  };
}
