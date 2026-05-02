import { createFileRoute } from "@tanstack/react-router";
import { PhaseComingSoon } from "@/components/phase-coming-soon";

export const Route = createFileRoute("/projekt/udbud")({
  component: () => (
    <PhaseComingSoon
      step={5}
      title="Udbud & Kontrakt"
      subtitle="Vi udbyder dit projekt til verificerede entreprenører og leverer juridisk granskede kontrakter."
      bullets={[
        "Strukturerede udbudsmaterialer",
        "Tilbudsindhentning fra 3+ entreprenører",
        "Standard- og specialkontrakter",
      ]}
      backTo="/projekt/teknik"
    />
  ),
});
