export type ProjectScope = "enfamiliehus" | "tilbygning" | "nedrivning_nybyg" | "renovering";

export type RequirementKind =
  | "machine_checkable"
  | "documentation"
  | "specialist_review"
  | "authority_discretion";

export type RequirementSeverity = "hard_stop" | "dispensation" | "warning" | "documentation";

export type ResponsibleRole =
  | "owner"
  | "architect"
  | "engineer"
  | "certified_static_engineer"
  | "certified_fire_consultant"
  | "energy_consultant"
  | "municipality";

export type ApplicabilityStatus =
  | "relevant"
  | "not_relevant"
  | "unknown_missing_data"
  | "requires_specialist_review"
  | "requires_authority_decision";

export type EvidenceStatus = "missing" | "draft" | "uploaded" | "validated" | "rejected";

export type EvidenceSource =
  | "datafordeler"
  | "plandata"
  | "user_upload"
  | "advisor"
  | "ai_extract"
  | "manual";

export type EvidenceType =
  | "register_data"
  | "drawing"
  | "calculation"
  | "declaration"
  | "product_documentation"
  | "photo"
  | "manual_upload"
  | "advisor_note"
  | "authority_response";

export type AuthorityReadinessStatus =
  | "preliminary"
  | "ready_for_advisor_review"
  | "ready_for_authority_review"
  | "missing_critical_documentation";

export type ApplicabilityCondition = {
  field: string;
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "in" | "present";
  value?: unknown;
};

export type EvidenceRequirement = {
  evidenceType: EvidenceType;
  description: string;
};

export type SourceFactReference = {
  source: EvidenceSource;
  field: string;
  value: unknown;
};

export type Br18Requirement = {
  id: string;
  br18Version: string;
  chapter: string;
  paragraph: string | null;
  title: string;
  description: string;
  sourceUrl: string;
  validFrom: string;
  validTo: string | null;
  projectScopes: ProjectScope[];
  requirementKind: RequirementKind;
  severity: RequirementSeverity;
  applicability: ApplicabilityCondition[];
  requiredEvidence: EvidenceRequirement[];
  responsibleRole: ResponsibleRole;
};

export type Br18ApplicabilityResult = {
  requirementId: string;
  status: ApplicabilityStatus;
  reasons: string[];
  missingInputs: string[];
  sourceFacts: SourceFactReference[];
};

export type EvidenceItem = {
  id: string;
  projectId: string;
  requirementId: string;
  evidenceType: EvidenceType;
  status: EvidenceStatus;
  source: EvidenceSource;
  fileId: string | null;
  structuredPayload: Record<string, unknown> | null;
  validationNotes: string[];
  reviewedByRole: string | null;
  reviewedAt: string | null;
};

export type AuthorityPackageManifest = {
  projectId: string;
  br18Version: string;
  generatedAt: string;
  readinessStatus: AuthorityReadinessStatus;
  requirements: Br18ApplicabilityResult[];
  evidenceItems: EvidenceItem[];
  missingItems: string[];
  unknownItems: string[];
};

export type Br18ProjectFacts = {
  projectScope: ProjectScope;
  bebyggetArealM2: number | null;
  grundarealM2: number | null;
  antalEtager: number | null;
  bygningshojdeM: number | null;
  skelafstandM: number | null;
  anvendelseskategori: string | null;
  br18Version: string;
  municipality: string;
};
