// src/lib/adresse.functions.ts
// Server functions for address search.
// SERVER-SIDE ONLY — GSearch credentials must not reach the browser.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ q: z.string().min(2).max(200).trim() }).parse(data))
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });
