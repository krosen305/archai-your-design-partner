import { createFileRoute } from "@tanstack/react-router";
import { PhaseComingSoon } from "@/components/phase-coming-soon";
import { useProject } from "@/lib/project-store";

function UdbudPage() {
  const { address } = useProject();
  const backTo = address?.adresseid
    ? `/projekt/${address.adresseid}/cockpit`
    : "/projekt/start";
  return (
    <PhaseComingSoon
      step={4}
      title="Udbud & Kontrakt"
      subtitle="Vi udbyder dit projekt til verificerede entreprenører og leverer juridisk granskede kontrakter."
      bullets={[
        "Strukturerede udbudsmaterialer",
        "Tilbudsindhentning fra 3+ entreprenører",
        "Standard- og specialkontrakter",
      ]}
      backTo={backTo}
    />
  );
}

export const Route = createFileRoute("/projekt/udbud")({
  component: UdbudPage,
});
