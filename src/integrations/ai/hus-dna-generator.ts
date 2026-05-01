// SERVER-SIDE ONLY – Anthropic API-nøgle må aldrig nå browseren.
// HusDnaGeneratorService — analysér inspirationsbilleder og fritekst
// og returnér et struktureret Hus-DNA objekt via Claude vision API.
//
// ⚠️  SKELETON med IS_MOCK guard — kræver ANTHROPIC_API_KEY i env.
//     Se ARCH-47 for fuld implementation spec.
//
// Når live Anthropic-kald er klar:
//   - Sæt IS_MOCK = false
//   - Sæt ANTHROPIC_API_KEY i .dev.vars og Wrangler secrets
//   - Opdater prompt efter test på rigtige inspirationsbilleder

// ---------------------------------------------------------------------------
// Mock flag — sæt til false når Anthropic-kald er implementeret
// ---------------------------------------------------------------------------

const IS_MOCK = true;

// ---------------------------------------------------------------------------
// Input / Output typer
// ---------------------------------------------------------------------------

export type HusDnaInput = {
  fritekst: string;
  billedUrls: string[];  // offentligt tilgængelige billed-URLs
};

export type HusDnaResult = {
  stil: string;
  bruttoareal: string;
  etager: string;
  tagform: string;
  energiklasse: string;
  saerligeKrav: string[];
  confidence: number;   // 0-100
  kilde: 'mock' | 'anthropic';
};

// ---------------------------------------------------------------------------
// Mock data — deterministisk testdata til development
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
// Anthropic prompt
// ---------------------------------------------------------------------------

const GENERATION_PROMPT = `
Du er en dansk arkitekt. Analyser de vedlagte inspirationsbilleder og/eller beskrivelsen og udtræk disse oplysninger som JSON:

{
  "stil": <kort arkitektonisk stilbetegnelse, fx "Nordisk Minimalisme">,
  "bruttoareal": <estimeret ønsket bruttoareal med enhed, fx "180 m²">,
  "etager": <antal etager som string, fx "2">,
  "tagform": <primær tagform, fx "Sadeltag" eller "Fladt">,
  "energiklasse": <ønsket energiklasse, fx "A2020" — antag A2020 hvis ikke nævnt>,
  "saerligeKrav": <array af særlige ønsker/krav, max 5 punkter>,
  "confidence": <din sikkerhed 0-100 baseret på mængden af input>
}

Svar KUN med JSON — ingen forklaring eller ekstra tekst.
`.trim();

// ---------------------------------------------------------------------------
// HusDnaGeneratorService
// ---------------------------------------------------------------------------

export class HusDnaGeneratorService {
  /**
   * Genererer et Hus-DNA ud fra inspirationsbilleder og fritekstbeskrivelse.
   *
   * IS_MOCK = true: returnerer deterministiske mock-data uden API-kald.
   * IS_MOCK = false: sender billeder + tekst til Claude vision API.
   */
  static async generate(input: HusDnaInput): Promise<HusDnaResult> {
    if (IS_MOCK) {
      return MOCK_RESULT;
    }

    // Live Anthropic-kald (ARCH-47)
    const apiKey = (process as any)?.env?.ANTHROPIC_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('HusDnaGeneratorService: ANTHROPIC_API_KEY mangler');
    }

    const content: unknown[] = [];

    // Tilføj billeder som image-blokke
    for (const url of input.billedUrls.slice(0, 5)) {
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const buf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        const ct = imgRes.headers.get('content-type') ?? 'image/jpeg';
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: ct, data: b64 },
        });
      } catch {
        // Spring over billeder der ikke kan hentes
      }
    }

    // Tilføj fritekst og prompt
    const userText = input.fritekst
      ? `Brugerens beskrivelse: ${input.fritekst}\n\n${GENERATION_PROMPT}`
      : GENERATION_PROMPT;
    content.push({ type: 'text', text: userText });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!anthropicRes.ok) {
      const body = await anthropicRes.text();
      throw new Error(`HusDnaGeneratorService: Anthropic API fejl (${anthropicRes.status}): ${body.slice(0, 200)}`);
    }

    const json = await anthropicRes.json() as any;
    const text: string = json?.content?.[0]?.text ?? '{}';

    try {
      const parsed = JSON.parse(text);
      return {
        stil: parsed.stil ?? 'Ukendt stil',
        bruttoareal: parsed.bruttoareal ?? '—',
        etager: parsed.etager ?? '—',
        tagform: parsed.tagform ?? '—',
        energiklasse: parsed.energiklasse ?? 'A2020',
        saerligeKrav: Array.isArray(parsed.saerligeKrav) ? parsed.saerligeKrav : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 70,
        kilde: 'anthropic',
      };
    } catch {
      throw new Error(`HusDnaGeneratorService: kunne ikke parse Anthropic-svar som JSON: ${text.slice(0, 200)}`);
    }
  }
}
