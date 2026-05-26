import type { Br18ComplianceResponse } from "@/lib/br18.functions";
import type { ApplicabilityStatus } from "@/lib/br18/types";

type SerializableApplicabilityResult = Br18ComplianceResponse["applicabilityResults"][number];

type Props = {
  results: SerializableApplicabilityResult[];
  isLoading: boolean;
};

const STATUS_LABEL: Record<ApplicabilityStatus, string> = {
  relevant: "Relevant",
  not_relevant: "Ikke relevant",
  unknown_missing_data: "Manglende data",
  requires_specialist_review: "Kræver faglig review",
  requires_authority_decision: "Kræver myndighedsafgørelse",
};

const STATUS_COLOR: Record<ApplicabilityStatus, string> = {
  relevant: "text-amber-700 bg-amber-50 border-amber-200",
  not_relevant: "text-gray-500 bg-gray-50 border-gray-200",
  unknown_missing_data: "text-red-700 bg-red-50 border-red-200",
  requires_specialist_review: "text-blue-700 bg-blue-50 border-blue-200",
  requires_authority_decision: "text-purple-700 bg-purple-50 border-purple-200",
};

export function Br18KravMatrix({ results, isLoading }: Props) {
  if (isLoading) {
    return <p className="text-sm text-gray-500">Henter BR18-kravmatrix…</p>;
  }
  if (results.length === 0) {
    return <p className="text-sm text-gray-500">Ingen BR18-krav evalueret endnu.</p>;
  }

  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div
          key={result.requirementId}
          className={`flex items-start justify-between rounded border px-3 py-2 ${STATUS_COLOR[result.status]}`}
        >
          <span className="text-sm font-medium">{result.requirementId}</span>
          <span className="ml-4 shrink-0 text-xs font-semibold">
            {STATUS_LABEL[result.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
