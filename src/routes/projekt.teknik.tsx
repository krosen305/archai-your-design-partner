import { createFileRoute } from "@tanstack/react-router";
import { PhaseComingSoon } from "@/components/phase-coming-soon";
import { useProject } from "@/lib/project-store";

function TeknikPage() {
  const { address } = useProject();
  const backTo = address?.adresseid
    ? `/projekt/${address.adresseid}/cockpit`
    : "/projekt/start";
  return (
    <PhaseComingSoon
      step={3}
      title="Teknik & BR18"
      subtitle="Vi genererer statiske beregninger, energirammer og BR18-dokumentation klar til myndighederne."
      bullets={[
        "Statik og bærende konstruktion",
        "Energiramme & BR18-compliance",
        "Tegningsmateriale til byggetilladelse",
      ]}
      backTo={backTo}
    />
  );
}

export const Route = createFileRoute("/projekt/teknik")({
  component: TeknikPage,
});
