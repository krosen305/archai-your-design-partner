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

const IS_MOCK = false;

// ---------------------------------------------------------------------------
// Input / Output typer
// ---------------------------------------------------------------------------

import type { HusDna } from '@/lib/project-store';

export type HusDnaInput = {
  fritekst: string;
  billedUrls: string[];
};

// HusDna er den kanoniske type — HusDnaResult er et alias for bagudkompatibilitet.
export type HusDnaResult = HusDna;

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
  kilde: 'mock',
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'Du er en dansk arkitekt der analyserer byggeønsker og returnerer struktureret JSON. ' +
  'Svar KUN med raw JSON — ingen markdown, ingen forklaring, ingen kodeblokke.';

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

    const apiKey = (process as any)?.env?.ANTHROPIC_API_KEY ?? '';
    if (!apiKey) {
      console.warn('[HusDna] ANTHROPIC_API_KEY mangler — returnerer mock');
      return { ...MOCK_RESULT };
    }

    try {
      return await callAnthropic(apiKey, input);
    } catch (e) {
      console.warn('[HusDna] Anthropic-kald fejlede — returnerer mock:', (e as Error).message);
      return { ...MOCK_RESULT };
    }
  }
}

// ---------------------------------------------------------------------------
// Intern: HTTP-kald til Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(apiKey: string, input: HusDnaInput): Promise<HusDnaResult> {
  const content: unknown[] = [];

  // Hent billeder som base64 (max 5, spring over utilgængelige)
  for (const url of input.billedUrls.slice(0, 5)) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      const ct = imgRes.headers.get('content-type') ?? 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type: ct, data: b64 } });
    } catch {
      // Spring over — et enkelt billede der fejler stopper ikke generering
    }
  }

  const userText = input.fritekst
    ? `Brugerens beskrivelse: ${input.fritekst}\n\n${USER_PROMPT}`
    : USER_PROMPT;
  content.push({ type: 'text', text: userText });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as any;
  const raw: string = json?.content?.[0]?.text ?? '{}';

  // Strip evt. markdown code fence (```json ... ```)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  const parsed = JSON.parse(cleaned);
  return {
    stil: parsed.stil ?? 'Ukendt stil',
    bruttoareal: parsed.bruttoareal ?? '—',
    etager: parsed.etager ?? '—',
    tagform: parsed.tagform ?? '—',
    energiklasse: parsed.energiklasse ?? 'A2020',
    saerligeKrav: Array.isArray(parsed.saerligeKrav) ? parsed.saerligeKrav : [],
    confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 70,
    kilde: 'anthropic',
  };
}
