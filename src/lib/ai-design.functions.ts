// AI-design hero — server-fn der genererer 3 visuelle forslag baseret på
// drømme-tekst + inspirationsbilleder. Bruger Lovable AI Gateway når
// LOVABLE_API_KEY er sat — falder ellers tilbage til neutral placeholder.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { runtimeConfig } from "@/lib/runtime-config";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";

const inputSchema = z
  .object({
    prompt: z.string().min(1).max(2000),
    inspirationsUrls: z
      .array(z.string().url().or(z.string().startsWith("data:")))
      .max(8)
      .optional(),
    stil: z.string().max(64).optional(),
    facademateriale: z.string().max(64).optional(),
    // ARCH-267: Server-side gate — client supplies a trusted ID, never a boolean flag.
    projectId: z.string().uuid().optional(),
    addressId: z.string().optional(),
  })
  .refine((d) => d.projectId || d.addressId, {
    message: "Enten projectId eller addressId er påkrævet for compliance-gate.",
  });

export type DesignProposalsResult = { images: string[]; kilde: "lovable-ai" | "placeholder" };

// ---------------------------------------------------------------------------
// ARCH-267: Server-side hard-stop gate
// ---------------------------------------------------------------------------

export type HardStopCheckResult = { blocked: boolean; reason: string | null };

/**
 * Loads compliance state from Supabase and evaluates the hard-stop gate.
 * Exported for unit testing — do not call from client code.
 *
 * Resolution order:
 *   1. projectId provided → load projects row, verify ownership, check hard_stop column
 *      If hard_stop is null → fall through to site_constraints lookup
 *   2. addressId provided (or as fallback) → load site_constraints, run evaluateHardStop
 */
export async function resolveHardStop(params: {
  projectId: string | undefined;
  addressId: string | undefined;
  userId: string;
}): Promise<HardStopCheckResult> {
  const { projectId, addressId, userId } = params;

  if (projectId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("user_id, hard_stop, hard_stop_reason, address_adresseid")
      .eq("id", projectId)
      .single();

    if (error || !project) {
      throw new Error("Projekt ikke fundet.");
    }

    if (project.user_id !== userId) {
      throw new Error("Adgang nægtet: projektet tilhører ikke den aktuelle bruger.");
    }

    if (project.hard_stop === true) {
      return { blocked: true, reason: project.hard_stop_reason ?? "Aktive compliance-stop." };
    }

    if (project.hard_stop === null) {
      const lookupId = project.address_adresseid ?? addressId;
      if (lookupId) {
        return resolveHardStopFromConstraints(lookupId);
      }
    }

    return { blocked: false, reason: null };
  }

  if (addressId) {
    return resolveHardStopFromConstraints(addressId);
  }

  throw new Error("Enten projectId eller addressId er påkrævet.");
}

async function resolveHardStopFromConstraints(addressId: string): Promise<HardStopCheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sc } = await supabaseAdmin
    .from("site_constraints")
    .select("save_value, is_fredet, strandbeskyttelse, fredskov, klitfredning")
    .eq("address_id", addressId)
    .single();

  if (!sc) {
    return { blocked: false, reason: null };
  }

  const { hardStop, hardStopReason } = evaluateHardStop({
    saveValue: sc.save_value,
    isFredet: sc.is_fredet,
    strandbeskyttelse: sc.strandbeskyttelse,
    fredskov: sc.fredskov,
    klitfredning: sc.klitfredning,
  });

  return { blocked: hardStop, reason: hardStopReason };
}

// ---------------------------------------------------------------------------
// Lovable AI Gateway helpers
// ---------------------------------------------------------------------------

function placeholderImages(seed: string): string[] {
  const safeSeed = encodeURIComponent(seed.slice(0, 40) || "archai");
  return [1, 2, 3].map((i) => `https://picsum.photos/seed/${safeSeed}-${i}/800/520`);
}

type LovableAiImageMessage = {
  images?: Array<{ image_url?: { url?: string } }>;
  content?: string | Array<{ type?: string; image_url?: { url?: string } }>;
};

function extractImageUrl(message: LovableAiImageMessage | undefined): string | null {
  if (!message) return null;
  const fromImages = message.images?.[0]?.image_url?.url;
  if (fromImages) return fromImages;
  if (Array.isArray(message.content)) {
    const part = message.content.find((p) => p?.type === "image_url" && p.image_url?.url);
    if (part?.image_url?.url) return part.image_url.url;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const generateDesignProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<DesignProposalsResult> => {
    // ARCH-267: Server-side compliance gate — load from DB, never trust client.
    const { blocked, reason } = await resolveHardStop({
      projectId: data.projectId,
      addressId: data.addressId,
      userId: context.userId,
    });

    if (blocked) {
      throw new Error(
        `AI-design er blokeret: ${reason ?? "ejendommen har aktive compliance-stop der skal afklares først."}`,
      );
    }

    const apiKey = runtimeConfig.ai.lovableApiKey;
    if (!apiKey) {
      return { images: placeholderImages(data.prompt), kilde: "placeholder" };
    }

    const systemPrompt =
      "You are an architectural visualizer. Generate a single photoreal exterior render of a Danish single-family home based on the user's dream description. Style: clean, daylight, contemporary Scandinavian context unless otherwise specified. Output one image only. No text overlays.";

    const userParts: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [
          data.prompt,
          data.stil ? `Arkitektonisk stil: ${data.stil}.` : null,
          data.facademateriale ? `Facademateriale: ${data.facademateriale}.` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    for (const url of data.inspirationsUrls?.slice(0, 4) ?? []) {
      userParts.push({ type: "image_url", image_url: { url } });
    }

    try {
      const requests = [0, 1, 2].map(async (i) => {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            modalities: ["image", "text"],
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  ...userParts,
                  {
                    type: "text",
                    text: `Variation ${i + 1} of 3 — vary perspective and lighting.`,
                  },
                ],
              },
            ],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          logger.warn(`[ai-design] gateway ${res.status}: ${body.slice(0, 200)}`);
          return null;
        }
        const json = (await res.json()) as { choices?: Array<{ message?: LovableAiImageMessage }> };
        return extractImageUrl(json.choices?.[0]?.message);
      });

      const results = await Promise.all(requests);
      const images = results.filter((u): u is string => typeof u === "string" && u.length > 0);
      if (images.length === 0) {
        return { images: placeholderImages(data.prompt), kilde: "placeholder" };
      }
      return { images, kilde: "lovable-ai" };
    } catch (e) {
      logger.warn("[ai-design] generation failed:", (e as Error).message);
      return { images: placeholderImages(data.prompt), kilde: "placeholder" };
    }
  });
