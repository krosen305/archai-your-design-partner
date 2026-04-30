import { createFileRoute } from "@tanstack/react-router";
import { PhaseComingSoon } from "@/components/phase-coming-soon";

export const Route = createFileRoute("/projekt/engineering")({
  component: () => (
    <PhaseComingSoon
      step={4}
      title="Engineering & BR18"
      subtitle="Vi genererer statiske beregninger, energirammer og BR18-dokumentation klar til myndighederne."
      bullets={[
        "Statik og bærende konstruktion",
        "Energiramme & BR18-compliance",
        "Tegningsmateriale til byggetilladelse",
      ]}
      backTo="/projekt/finans"
    />
  ),
});
