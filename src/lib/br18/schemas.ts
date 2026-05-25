import { z } from "zod";

export const projectScopeSchema = z.enum([
  "enfamiliehus",
  "tilbygning",
  "nedrivning_nybyg",
  "renovering",
]);

export const requirementKindSchema = z.enum([
  "machine_checkable",
  "documentation",
  "specialist_review",
  "authority_discretion",
]);

export const requirementSeveritySchema = z.enum([
  "hard_stop",
  "dispensation",
  "warning",
  "documentation",
]);

export const applicabilityStatusSchema = z.enum([
  "relevant",
  "not_relevant",
  "unknown_missing_data",
  "requires_specialist_review",
  "requires_authority_decision",
]);

export const evidenceStatusSchema = z.enum([
  "missing",
  "draft",
  "uploaded",
  "validated",
  "rejected",
]);

export const evidenceSourceSchema = z.enum([
  "datafordeler",
  "plandata",
  "user_upload",
  "advisor",
  "ai_extract",
  "manual",
]);

export const evidenceTypeSchema = z.enum([
  "register_data",
  "drawing",
  "calculation",
  "declaration",
  "product_documentation",
  "photo",
  "manual_upload",
  "advisor_note",
  "authority_response",
]);

export const authorityReadinessStatusSchema = z.enum([
  "preliminary",
  "ready_for_advisor_review",
  "ready_for_authority_review",
  "missing_critical_documentation",
]);

export const applicabilityConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "gt", "lt", "gte", "lte", "in", "present"]),
  value: z.unknown(),
});

export const br18RequirementSchema = z.object({
  id: z.string(),
  br18Version: z.string(),
  chapter: z.string(),
  paragraph: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  sourceUrl: z.string().url(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  projectScopes: z.array(projectScopeSchema),
  requirementKind: requirementKindSchema,
  severity: requirementSeveritySchema,
  applicability: z.array(applicabilityConditionSchema),
  requiredEvidence: z.array(
    z.object({
      evidenceType: evidenceTypeSchema,
      description: z.string(),
    }),
  ),
  responsibleRole: z.enum([
    "owner",
    "architect",
    "engineer",
    "certified_static_engineer",
    "certified_fire_consultant",
    "energy_consultant",
    "municipality",
  ]),
});

export const br18RequirementCatalogSchema = z.array(br18RequirementSchema);

export const br18ApplicabilityResultSchema = z.object({
  requirementId: z.string(),
  status: applicabilityStatusSchema,
  reasons: z.array(z.string()),
  missingInputs: z.array(z.string()),
  sourceFacts: z.array(
    z.object({
      source: evidenceSourceSchema,
      field: z.string(),
      value: z.unknown(),
    }),
  ),
});

export const evidenceItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  requirementId: z.string(),
  evidenceType: evidenceTypeSchema,
  status: evidenceStatusSchema,
  source: evidenceSourceSchema,
  fileId: z.string().nullable(),
  structuredPayload: z.record(z.unknown()).nullable(),
  validationNotes: z.array(z.string()),
  reviewedByRole: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});

export const authorityPackageManifestSchema = z.object({
  projectId: z.string(),
  br18Version: z.string(),
  generatedAt: z.string(),
  readinessStatus: authorityReadinessStatusSchema,
  requirements: z.array(br18ApplicabilityResultSchema),
  evidenceItems: z.array(evidenceItemSchema),
  missingItems: z.array(z.string()),
  unknownItems: z.array(z.string()),
});

export const br18ProjectFactsSchema = z.object({
  projectScope: projectScopeSchema,
  bebyggetArealM2: z.number().nullable(),
  grundarealM2: z.number().nullable(),
  antalEtager: z.number().nullable(),
  bygningshojdeM: z.number().nullable(),
  skelafstandM: z.number().nullable(),
  anvendelseskategori: z.string().nullable(),
  br18Version: z.string(),
  municipality: z.string(),
});
