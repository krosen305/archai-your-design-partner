import { createFileRoute } from "@tanstack/react-router";
import { PhaseComingSoon } from "@/components/phase-coming-soon";

export const Route = createFileRoute("/projekt/oekonomi")({
  component: () => (
    <PhaseComingSoon
      step={3}
      title="Finansiering & Forsikring"
      subtitle="Vi genererer automatisk bank-klar lånedokumentation og indhenter tilbud på entrepriseforsikring."
      bullets={[
        "Omkostningsestimering baseret på dit Hus-DNA",
        "Bank-ready lånedokumentation",
        "Udbud på entrepriseforsikring",
      ]}
      backTo="/projekt/match"
    />
  ),
});
