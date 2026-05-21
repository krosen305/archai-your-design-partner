// SERVER-SIDE ONLY — Anthropic API-nøgle må aldrig nå browseren.
// BilledeAnalyseService — analysér inspirationsbilleder for arkitektoniske kendetegn.
// Model: claude-haiku-4-5-20251001 med prompt-caching på system-prompt.
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller kald fejler.

import { z } from "zod";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { runtimeConfig } from "@/lib/runtime-config";
import { logServerEvent } from "@/lib/server-logger";
import { callAnthropicGateway, extractStructuredOutput } from "./gateway";
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
    facade: ["pudset", "hvid"],
    tagform: ["fladt tag"],
    vinduer: ["store formater", "vinduesbånd"],
    materialer: ["beton", "glas"],
    saerligeTraek: ["integreret carport"],
    farver: ["hvid", "antracit"],
    stil: ["minimalistisk"],
  },
  konflikter: [],
  ekstraTags: ["sydvendt atrium"],
  confidence: 87,
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// Zod-schema til parsing af API-svar
// ---------------------------------------------------------------------------

const KategorierSchema = z.object({
  facade: z.array(z.string()).default([]),
  tagform: z.array(z.string()).default([]),
  vinduer: z.array(z.string()).default([]),
  materialer: z.array(z.string()).default([]),
  saerligeTraek: z.array(z.string()).default([]),
  farver: z.array(z.string()).default([]),
  stil: z.array(z.string()).default([]),
});

const KonfliktSchema = z.object({
  kategori: z.enum([
    "facade",
    "tagform",
    "vinduer",
    "materialer",
    "saerligeTraek",
    "farver",
    "stil",
  ]),
  muligheder: z.array(z.array(z.string())),
  billedAntal: z.array(z.number()),
});

const ApiResponseSchema = z.object({
  kategorier: KategorierSchema,
  konflikter: z.array(KonfliktSchema).default([]),
  ekstraTags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).default(70),
});

// ---------------------------------------------------------------------------
// BilledeAnalyseService
// ---------------------------------------------------------------------------

export class BilledeAnalyseService {
  static async analyser(billedUrls: string[]): Promise<BilledeAnalyseResultat> {
    if (IS_MOCK) return { ...MOCK_RESULT };

    const apiKey = runtimeConfig.ai.anthropicApiKey;
    if (!apiKey) {
      logServerEvent({
        module: "billede-analyse",
        operation: "analyser",
        severity: "degraded",
        message: "ANTHROPIC_API_KEY mangler — returnerer mock",
      });
      return { ...MOCK_RESULT };
    }

    try {
      return await callHaiku(billedUrls);
    } catch (e) {
      logServerEvent({
        module: "billede-analyse",
        operation: "analyser",
        severity: "degraded",
        message: "Haiku-kald fejlede — returnerer mock",
        error: e,
      });
      return { ...MOCK_RESULT };
    }
  }
}

// ---------------------------------------------------------------------------
// Intern: HTTP-kald til Anthropic Haiku
// ---------------------------------------------------------------------------

async function callHaiku(billedUrls: string[]): Promise<BilledeAnalyseResultat> {
  const imageBlocks = billedUrls.slice(0, 4).map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const userContent = [
    ...imageBlocks,
    { type: "text" as const, text: "Analyser disse billeder og returner JSON som specificeret." },
  ];

  const gatewayResponse = await callAnthropicGateway({
    model: "claude-haiku-4-5-20251001",
    system: BILLEDE_ANALYSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userContent as unknown as import("./gateway").AnthropicContentBlock[],
      },
    ],
    maxTokens: 400,
    operation: "billede-analyse",
  });

  const textBlock = gatewayResponse.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic returnerede ingen tekst i billede-analyse");
  }

  const parsed = extractStructuredOutput(ApiResponseSchema, textBlock.text);
  return {
    kategorier: {
      facade: parsed.kategorier.facade ?? [],
      tagform: parsed.kategorier.tagform ?? [],
      vinduer: parsed.kategorier.vinduer ?? [],
      materialer: parsed.kategorier.materialer ?? [],
      saerligeTraek: parsed.kategorier.saerligeTraek ?? [],
      farver: parsed.kategorier.farver ?? [],
      stil: parsed.kategorier.stil ?? [],
    },
    konflikter: parsed.konflikter ?? [],
    ekstraTags: parsed.ekstraTags ?? [],
    confidence: parsed.confidence ?? 70,
    kilde: "haiku" as const,
  };
}
