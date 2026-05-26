import { useCallback, useState } from "react";
import { getBr18Compliance } from "@/lib/br18.functions";
import type { Br18ComplianceResponse } from "@/lib/br18.functions";
import type { Br18ProjectFacts } from "@/lib/br18/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Br18ComplianceResponse }
  | { status: "error"; message: string };

export function useProjectBr18Compliance(projectId: string) {
  const [state, setState] = useState<State>({ status: "idle" });

  const runCompliance = useCallback(
    async (facts: Br18ProjectFacts, token: string) => {
      setState({ status: "loading" });
      try {
        const data = await getBr18Compliance({ data: { projectId, facts, token } });
        setState({ status: "success", data });
      } catch (e) {
        setState({ status: "error", message: String(e) });
      }
    },
    [projectId],
  );

  return { state, runCompliance };
}
