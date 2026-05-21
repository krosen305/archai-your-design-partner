import { z } from "zod";

const ByggeonkskePayloadSchema = z
  .object({
    bruttoAreal: z.number().optional(),
    bruttoareal: z.number().optional(),
    etager: z.number().optional(),
  })
  .passthrough()
  .nullable();

export type ByggeonkskePayload = z.infer<typeof ByggeonkskePayloadSchema>;

export function parseByggeoenskePayload(raw: unknown): ByggeonkskePayload | null {
  const result = ByggeonkskePayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
