import type { RuleEngineLokalplan } from "@/domain/contracts/rule-engine.types";

export function classifyLokalplaner(lokalplaner: RuleEngineLokalplan[]): {
  vedtagne: RuleEngineLokalplan[];
  forslag: RuleEngineLokalplan[];
} {
  const forslag = lokalplaner.filter(
    (p) => p.status?.toLowerCase().includes("forslag") ?? false,
  );
  const vedtagne = lokalplaner.filter(
    (p) => !(p.status?.toLowerCase().includes("forslag") ?? false),
  );
  return { vedtagne, forslag };
}
