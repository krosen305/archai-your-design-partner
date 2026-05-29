import { z } from "zod";

export const addressEnrichmentPatchSchema = z
  .object({
    adgangsadresseid: z.string().min(1).optional(),
    ejerlavskode: z.number().int().optional(),
    matrikelnummer: z.string().min(1).optional(),
    grundareal: z.number().positive().optional(),
  })
  .strict();

export type AddressEnrichmentPatch = z.infer<typeof addressEnrichmentPatchSchema>;
