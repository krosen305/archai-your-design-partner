import { useEffect, useRef } from "react";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";

export function useBudgetSync(totalTypisk: number): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      useProject.getState().setBudgetEstimate(totalTypisk);
      void syncPatch({ budget_estimate: totalTypisk });
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [totalTypisk]);
}
