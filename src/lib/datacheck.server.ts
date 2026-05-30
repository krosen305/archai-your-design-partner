import {
  getOrCreateProject,
  loadProject,
  updateProject,
} from "@/integrations/supabase/repositories/projects.repository";
import { buildProjectUpdate } from "@/lib/project-update-builder";
import { parsePersistedDataStatusMap, type DataStatusMap } from "@/lib/datacheck";
import { toJsonValue } from "@/lib/json-value";

export type LoadDatacheckStateInput = {
  userId: string;
  projectId?: string | null;
  addressId?: string | null;
};

export type SaveDatacheckStateInput = {
  userId: string;
  projectId?: string | null;
  statusMap: DataStatusMap;
};

export async function loadDatacheckState(input: LoadDatacheckStateInput): Promise<DataStatusMap> {
  const project = await loadProject(input.userId, input.projectId ?? null, input.addressId ?? null);
  return parsePersistedDataStatusMap(project?.project_data_status);
}

export async function saveDatacheckState(input: SaveDatacheckStateInput): Promise<void> {
  const projectId = input.projectId?.trim()
    ? input.projectId
    : await getOrCreateProject(input.userId);
  const update = buildProjectUpdate({ projectDataStatus: toJsonValue(input.statusMap) }, {});

  await updateProject(projectId, input.userId, update);
}
