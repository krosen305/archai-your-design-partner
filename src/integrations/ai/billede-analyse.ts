// SERVER-SIDE ONLY — Anthropic API-nøgle må aldrig nå browseren.
// BilledeAnalyseService — analysér inspirationsbilleder for arkitektoniske kendetegn.
// Model: claude-haiku-4-5-20251001 med prompt-caching på system-prompt.
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller kald fejler.

import { z } from "zod";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getEnvOptional } from "@/lib/env";
import {
  type BilledeAnalyseResultat,
  BILLEDE_ANALYSE_SYSTEM_PROMPT,
} from "@/lib/billede-analyse-vocabulary";

const IS_MOCK = FEATURE_FLAGS.billedanalyseMock;

// ---------------------------------------------------------------------------
// Mock data — deterministisk fallback til development uden API-nøgle
// ---------------------------------------------------------------------------

const MOCK_RESULT: BilledeAnalyseResultat = {
  kategorier: {
    facade:        ["pudset", "hvid"],
    tagform:       ["fladt tag"],
    vinduer:       ["store formater", "vinduesbånd"],
    materialer:    ["beton", "glas"],
    saerligeTraek: ["integreret carport"],
    farver:        ["hvid", "antracit"],
    stil:          ["minimalistisk"],
  },
  konflikter:  [],
  ekstraTags:  ["sydvendt atrium"],
  confidence:  87,
  kilde:       "mock",
};

// ---------------------------------------------------------------------------
// Zod-schema til parsing af API-svar
// ---------------------------------------------------------------------------

const KategorierSchema = z.object({
  facade:        z.array(z.string()).default([]),
  tagform:       z.array(z.string()).default([]),
  vinduer:       z.array(z.string()).default([]),
  materialer:    z.array(z.string()).default([]),
  saerligeTraek: z.array(z.string()).default([]),
  farver:        z.array(z.string()).default([]),
  stil:          z.array(z.string()).default([]),
});

const KonfliktSchema = z.object({
  kategori: z.enum([
    "facade", "tagform", "vinduer", "materialer", "saerligeTraek", "farver", "stil",
  ]),
  muligheder:  z.array(z.array(z.string())),
  billedAntal: z.array(z.number()),
});

const ApiResponseSchema = z.object({
  kategorier:  KategorierSchema,
  konflikter:  z.array(KonfliktSchema).default([]),
  ekstraTags:  z.array(z.string()).default([]),
  confidence:  z.number().min(0).max(100).default(70),
});

// ---------------------------------------------------------------------------
// BilledeAnalyseService
// ---------------------------------------------------------------------------

export class BilledeAnalyseService {
  static async analyser(billedUrls: string[]): Promise<BilledeAnalyseResultat> {
    if (IS_MOCK) return { ...MOCK_RESULT };

    const apiKey = getEnvOptional("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) {
      console.warn("[BilledeAnalyse] ANTHROPIC_API_KEY mangler — returnerer mock");
      return { ...MOCK_RESULT };
    }

    try {
      return await callHaiku(apiKey, billedUrls);
    } catch (e) {
      console.warn("[BilledeAnalyse] Haiku-kald fejlede — returnerer mock:", (e as Error).message);
      return { ...MOCK_RESULT };
    }
  }
}

// ---------------------------------------------------------------------------
// Intern: HTTP-kald til Anthropic Haiku
// ---------------------------------------------------------------------------

async function callHaiku(apiKey: string, billedUrls: string[]): Promise<BilledeAnalyseResultat> {
  const imageBlocks = billedUrls.slice(0, 4).map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const BACKOFF_MS = [10_000, 20_000, 40_000] as const;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: [
          {
            type: "text",
            text: BILLEDE_ANALYSE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              { type: "text", text: "Analyser disse billeder og returner JSON som specificeret." },
            ],
          },
        ],
      }),
    });

    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { content: { text: string }[] };
    const raw = json?.content?.[0]?.text ?? "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = ApiResponseSchema.parse(JSON.parse(cleaned));
    return { ...parsed, kilde: "haiku" as const };
  }

  throw new Error("[BilledeAnalyse] max retries exceeded");
}
