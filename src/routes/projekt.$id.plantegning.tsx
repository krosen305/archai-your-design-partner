import { createFileRoute } from "@tanstack/react-router";
import { FloorPlanEditor } from "@/components/floor-plan/FloorPlanEditor";
import { useProject } from "@/lib/project-store";

export const Route = createFileRoute("/projekt/$id/plantegning")({
  component: PlantegningPage,
  validateSearch: (search: Record<string, unknown>) => ({
    projectId:
      typeof search.projectId === "string" && search.projectId.trim()
        ? search.projectId
        : undefined,
  }),
});

function PlantegningPage() {
  const { id } = Route.useParams();
  const { projectId: searchProjectId } = Route.useSearch();
  const { address, currentProjectId } = useProject();
  const projectId = currentProjectId ?? searchProjectId ?? null;
  const backTo = searchProjectId
    ? `/projekt/${id}/cockpit?projectId=${encodeURIComponent(searchProjectId)}`
    : `/projekt/${id}/cockpit`;

  return (
    <FloorPlanEditor projectId={projectId} addressLabel={address?.adresse ?? id} backTo={backTo} />
  );
}
