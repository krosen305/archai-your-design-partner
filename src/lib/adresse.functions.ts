// src/lib/adresse.functions.ts
// Server functions for address search and detail fetch.
// SERVER-SIDE ONLY — GSearch og DAR credentials må aldrig nå browseren.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().min(2).max(200).trim() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });

export const fetchAddressDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ adresseid: z.string().regex(UUID_RE, "Ugyldigt adresse-ID").max(64) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { DarService } = await import("@/integrations/dar/client");
    return DarService.getAddressDetails(data.adresseid);
  });
