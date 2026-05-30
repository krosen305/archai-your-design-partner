import { useEffect, useRef } from "react";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { saveProjectPatch } from "@/lib/project-sync";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";

export function useBudgetSync(totalTypisk: number): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const state = useProject.getState();
      state.setBudgetEstimate(totalTypisk);
      void runProjectSaveWorkflow(
        {
          patch: { budget_estimate: totalTypisk },
          projectId: state.currentProjectId,
        },
        {
          getSession,
          saveProjectPatch,
        },
      );
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [totalTypisk]);
}
