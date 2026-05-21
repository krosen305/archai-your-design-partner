// SERVER-SIDE ONLY – Anthropic API-nøgle må aldrig nå browseren.
// HusDnaGeneratorService — analysér inspirationsbilleder og fritekst
// og returnér et struktureret Hus-DNA objekt via Claude vision API.
//
// IS_MOCK = false: live Anthropic-kald aktivt (ARCH-52).
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller kald fejler.
// Kræver ANTHROPIC_API_KEY i .dev.vars (lokalt) og Wrangler secrets (prod).

// ---------------------------------------------------------------------------
// Mock flag
// ---------------------------------------------------------------------------

import { z } from "zod";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { runtimeConfig } from "@/lib/runtime-config";
import { logServerEvent } from "@/lib/server-logger";
import { callAnthropicGateway, extractStructuredOutput } from "./gateway";
const IS_MOCK = FEATURE_FLAGS.husDnaMock;

// ---------------------------------------------------------------------------
// Input / Output typer
// ---------------------------------------------------------------------------

import type { HusDna } from "@/types/project-state";
import type { AnthropicContentBlock } from "./gateway";

export type HusDnaInput = {
  fritekst: string;
  billedUrls: string[];
};

// HusDna er den kanoniske type — HusDnaResult er et alias for bagudkompatibilitet.
export type HusDnaResult = HusDna;

const HusDnaSchema = z.object({
  stil: z.string().default("Ukendt stil"),
  bruttoareal: z.string().default("—"),
  etager: z.string().default("—"),
  tagform: z.string().default("—"),
  energiklasse: z.string().default("A2020"),
  saerligeKrav: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).default(70),
});

// ---------------------------------------------------------------------------
// Mock data — deterministisk fallback til development uden API-nøgle
// ---------------------------------------------------------------------------

const MOCK_RESULT: HusDnaResult = {
  stil: "Nordisk Brutalisme",
  bruttoareal: "210 m²",
  etager: "2",
  tagform: "Fladt",
  energiklasse: "A2020",
  saerligeKrav: ["hjemmekontor", "sydvendt terrasse", "dobbelthøjt rum"],
  confidence: 87,
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "Du er en dansk arkitekt der analyserer byggeønsker og returnerer struktureret JSON. " +
  "Svar KUN med raw JSON — ingen markdown, ingen forklaring, ingen kodeblokke.";

const USER_PROMPT = `
Analyser de vedlagte inspirationsbilleder og/eller beskrivelsen og returnér dette JSON-objekt:

{
  "stil": "<kort arkitektonisk stilbetegnelse, fx 'Nordisk Minimalisme'>",
  "bruttoareal": "<estimeret ønsket bruttoareal med enhed, fx '180 m²' — brug '—' hvis ukendt>",
  "etager": "<antal etager som string, fx '2'>",
  "tagform": "<primær tagform, fx 'Sadeltag', 'Fladt' eller 'Valmet'>",
  "energiklasse": "<ønsket energiklasse, fx 'A2020' — antag A2020 hvis ikke nævnt>",
  "saerligeKrav": ["<særlige ønsker/krav — max 5 punkter, konkrete og korte>"],
  "confidence": <heltal 0-100: 90+ ved detaljeret input, 50-70 ved sparsomt input>
}
`.trim();

// ---------------------------------------------------------------------------
// HusDnaGeneratorService
// ---------------------------------------------------------------------------

export class HusDnaGeneratorService {
  /**
   * Genererer et Hus-DNA ud fra inspirationsbilleder og fritekstbeskrivelse.
   *
   * IS_MOCK = true:  deterministisk mock-data uden API-kald.
   * IS_MOCK = false: live Claude vision API. Falder tilbage til mock ved fejl.
   */
  static async generate(input: HusDnaInput): Promise<HusDnaResult> {
    if (IS_MOCK) {
      return { ...MOCK_RESULT };
    }

    const apiKey = runtimeConfig.ai.anthropicApiKey;
    if (!apiKey) {
      logServerEvent({
        module: "hus-dna-generator",
        operation: "generate",
        severity: "degraded",
        message: "ANTHROPIC_API_KEY mangler — returnerer mock",
      });
      return { ...MOCK_RESULT };
    }

    try {
      return await callAnthropic(input);
    } catch (e) {
      logServerEvent({
        module: "hus-dna-generator",
        operation: "generate",
        severity: "degraded",
        message: "Anthropic-kald fejlede — returnerer mock",
        error: e,
      });
      return { ...MOCK_RESULT };
    }
  }
}

// ---------------------------------------------------------------------------
// Intern: HTTP-kald til Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(input: HusDnaInput): Promise<HusDnaResult> {
  const content: AnthropicContentBlock[] = [];

  // Hent billeder som base64 (max 5, spring over utilgængelige)
  for (const url of input.billedUrls.slice(0, 5)) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: ct, data: b64 } });
    } catch {
      // Spring over — et enkelt billede der fejler stopper ikke generering
    }
  }

  const userText = input.fritekst
    ? `Brugerens beskrivelse: ${input.fritekst}\n\n${USER_PROMPT}`
    : USER_PROMPT;
  content.push({ type: "text", text: userText });

  const gatewayResponse = await callAnthropicGateway({
    model: "claude-sonnet-4-6",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    maxTokens: 512,
    operation: "hus-dna-generator",
  });

  const textBlock = gatewayResponse.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic returnerede ingen tekst i hus-dna-generator");
  }

  const parsed = extractStructuredOutput(HusDnaSchema, textBlock.text);
  return {
    stil: parsed.stil ?? "Ukendt stil",
    bruttoareal: parsed.bruttoareal ?? "—",
    etager: parsed.etager ?? "—",
    tagform: parsed.tagform ?? "—",
    energiklasse: parsed.energiklasse ?? "A2020",
    saerligeKrav: parsed.saerligeKrav ?? [],
    confidence: parsed.confidence ?? 70,
    kilde: "anthropic" as const,
  };
}
