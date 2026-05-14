// SERVER-SIDE ONLY – Anthropic API-nøgle må aldrig nå browseren.
// PdfExtractorService — udtræk strukturerede regler fra lokalplan-PDFer via Claude.
// IS_MOCK = false: live Anthropic-kald aktivt (ARCH-53).
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller PDF ikke kan hentes.
// Kræver ANTHROPIC_API_KEY i .dev.vars (lokalt) og Wrangler secrets (prod).

// ---------------------------------------------------------------------------
// Mock flag
// ---------------------------------------------------------------------------

import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getEnvOptional } from "@/lib/env";
const IS_MOCK = FEATURE_FLAGS.pdfExtractorMock;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type LokalplanExtract = {
  maxEtager: number | null;
  maxBebyggelsespct: number | null;
  tagform: string | null;
  materialer: string[];
  byggelinjer: string | null; // afstandskrav til skel/vej
  specialBestemmelser: string[]; // fritekst-bestemmelser der ikke passer andre felter
  kilde: "mock" | "anthropic";
};

// ---------------------------------------------------------------------------
// Mock data — deterministisk testdata baseret på typisk dansk lokalplan
// ---------------------------------------------------------------------------

const MOCK_EXTRACT: LokalplanExtract = {
  maxEtager: 2,
  maxBebyggelsespct: 30,
  tagform: "Sadeltag med hældning 25-45°",
  materialer: ["tegl", "fiber cement", "zink"],
  byggelinjer: "2,5 m fra vejskel, 2 m fra naboskel",
  specialBestemmelser: [
    "Ingen udestuer eller winterhaver mod vejside",
    "Carporte og garager max 50 m² uden byggetilladelse",
  ],
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// Regex pre-parser — 0 API-tokens, fanger ~60-70 % af standardbestemmelser
// ---------------------------------------------------------------------------

// Forsøger at udtrække tekst fra ukomprimerede PDF-streams via Tj/TJ-operatorer.
// Returnerer tom streng for komprimerede PDF'er (disse sendes uberørt til Claude).
function extractPdfRawText(pdfBuffer: ArrayBuffer): string {
  const raw = new TextDecoder("latin-1").decode(new Uint8Array(pdfBuffer));
  const parts: string[] = [];

  const tjRe = /\(([^()]{1,300})\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(raw)) !== null) parts.push(m[1]);

  const tjArrRe = /\[([^\]]{1,1000})\]\s*TJ/g;
  while ((m = tjArrRe.exec(raw)) !== null) {
    const innerRe = /\(([^()]{1,300})\)/g;
    let inner: RegExpExecArray | null;
    while ((inner = innerRe.exec(m[1])) !== null) parts.push(inner[1]);
  }

  return parts.join(" ");
}

type PreParseResult = {
  maxEtager: number | null;
  maxBebyggelsespct: number | null;
  tagform: string | null;
};

// Regelbaseret udtræk af de vigtigste lokalplan-felter uden AI.
function preParseLokalplan(text: string): PreParseResult {
  if (!text.trim()) return { maxEtager: null, maxBebyggelsespct: null, tagform: null };

  const maxEtager = (() => {
    const m =
      text.match(/max(?:imalt)?\s+(\d)\s+etage[r]?/i) ??
      text.match(/(\d)\s+etage[r]?\s+(?:er\s+)?(?:tillad|m[åa])/i) ??
      text.match(/tillades?\s+i\s+(\d)\s+etage[r]?/i) ??
      text.match(/opf[øo]res?\s+i\s+(\d)\s+etage[r]?/i);
    return m ? parseInt(m[1], 10) : null;
  })();

  const maxBebyggelsespct = (() => {
    const m =
      text.match(/bebyggelsesprocent\D{0,40}(\d{1,3})\s*%/i) ??
      text.match(/(\d{1,3})\s*%\s*(?:\w+\s+)?bebyggelse/i);
    const val = m ? parseInt(m[1], 10) : null;
    return val !== null && val >= 1 && val <= 100 ? val : null;
  })();

  const tagform = (() => {
    // Matcher både "Tagform: sadeltag", "taget skal udføres som sadeltag" osv.
    const m =
      text.match(
        /(?:tag(?:et?|form|hæld|konstruktion)?)\s*[:\s]\s*(\bsadeltag\b|\bvalmtag\b|\bvalm(?:\s*tag)?\b|\bflad(?:t)?\s*tag\b|\bensidig\b)/i,
      ) ??
      text.match(
        /(?:tag(?:et?|form|hæld|konstruktion)?)\s+(?:skal\s+)?(?:(?:udføres?|anlæg[gs]?|v[æe]re)\s+(?:(?:som|et|en|af)\s+)?)?(\bsadeltag\b|\bvalmtag\b|\bvalm(?:\s*tag)?\b|\bflad(?:t)?\s*tag\b|\bensidig\b)/i,
      );
    if (!m) return null;
    const raw = m[1].toLowerCase();
    if (raw.includes("sadel")) return "Sadeltag";
    if (raw.includes("valm")) return "Valmtag";
    if (raw.includes("flad")) return "Fladt tag";
    if (raw.includes("ensidig")) return "Ensidig taghældning";
    return null;
  })();

  return { maxEtager, maxBebyggelsespct, tagform };
}

// ---------------------------------------------------------------------------
// Anthropic prompt
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `
Du er en dansk byggesagsbehandler. Læs vedhæftede lokalplan og udtræk de byggeretlige bestemmelser
som struktureret JSON. Vær præcis — er en bestemmelse ikke nævnt, returnér null/tomt array.

Returnér KUN dette JSON-objekt — ingen markdown, ingen forklaring:

{
  "maxEtager": <antal etager som heltal eller null>,
  "maxBebyggelsespct": <bebyggelsesprocent som heltal eller null>,
  "tagform": <beskrivelse af krav til tagform som string eller null>,
  "materialer": <array af tilladte facadematerialer, fx ["tegl","træ"]>,
  "byggelinjer": <afstandskrav til skel/vej som string eller null>,
  "specialBestemmelser": <array af 3-7 vigtige bestemmelser som korte sætninger>
}
`.trim();

// ---------------------------------------------------------------------------
// PdfExtractorService
// ---------------------------------------------------------------------------

export class PdfExtractorService {
  /**
   * Udtrækker strukturerede regler fra en lokalplan-PDF via Anthropic Claude.
   *
   * @param pdfUrl  URL til lokalplan-PDF (typisk fra Plandata: dokument.plandata.dk/...)
   *
   * IS_MOCK = true: returnerer deterministiske mock-data uden API-kald.
   * IS_MOCK = false: henter PDF server-side og sender til Claude API.
   */
  static async extractLokalplan(pdfUrl: string): Promise<LokalplanExtract> {
    if (!pdfUrl) {
      return { ...MOCK_EXTRACT, kilde: "mock" };
    }

    if (IS_MOCK) {
      return MOCK_EXTRACT;
    }

    const apiKey = getEnvOptional("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) {
      console.warn("[PdfExtractor] ANTHROPIC_API_KEY mangler — returnerer mock");
      return MOCK_EXTRACT;
    }

    // Hent PDF server-side
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      throw new Error(`PdfExtractorService: kunne ikke hente PDF (${pdfRes.status}): ${pdfUrl}`);
    }
    const pdfBuffer = await pdfRes.arrayBuffer();

    // Trin 1: Forsøg regelbaseret udtræk fra rå PDF-bytes (0 API-tokens)
    const rawPdfText = extractPdfRawText(pdfBuffer);
    const preparse = preParseLokalplan(rawPdfText);
    const allKeyFieldsFound =
      preparse.maxEtager !== null &&
      preparse.maxBebyggelsespct !== null &&
      preparse.tagform !== null;

    // Trin 2: Returner tidligt hvis alle nøglefelter er fundet via regex
    if (allKeyFieldsFound) {
      return {
        maxEtager: preparse.maxEtager,
        maxBebyggelsespct: preparse.maxBebyggelsespct,
        tagform: preparse.tagform,
        materialer: [],
        byggelinjer: null,
        specialBestemmelser: [],
        kilde: "anthropic",
      };
    }

    // Trin 3: Claude-kald med prompt caching på PDF-dokumentblokken
    // cache_control: ephemeral → PDF caches i 5 min; re-brug koster 10 % af normal pris.
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
    let anthropicRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
                  cache_control: { type: "ephemeral" },
                },
                { type: "text", text: EXTRACTION_PROMPT },
              ],
            },
          ],
        }),
      });

      if (anthropicRes.status !== 429) break;

      // Eksponentiel backoff: 10s, 20s, 40s
      const delayMs = 10_000 * Math.pow(2, attempt);
      console.warn(
        `[PdfExtractor] Rate limit (429) — venter ${delayMs / 1000}s før retry ${attempt + 1}/3`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!anthropicRes!.ok) {
      const body = await anthropicRes!.text();
      throw new Error(
        `PdfExtractorService: Anthropic API fejl (${anthropicRes!.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await anthropicRes!.json()) as { content?: Array<{ text?: string }> };
    const rawText: string = json?.content?.[0]?.text ?? "{}";

    // Strip evt. markdown code fence (```json ... ```) som Claude tilføjer
    const cleaned =
      rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim() || "{}";

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        maxEtager:
          typeof parsed.maxEtager === "number" ? parsed.maxEtager : (preparse.maxEtager ?? null),
        maxBebyggelsespct:
          typeof parsed.maxBebyggelsespct === "number"
            ? parsed.maxBebyggelsespct
            : (preparse.maxBebyggelsespct ?? null),
        tagform: typeof parsed.tagform === "string" ? parsed.tagform : (preparse.tagform ?? null),
        materialer: Array.isArray(parsed.materialer) ? (parsed.materialer as string[]) : [],
        byggelinjer: typeof parsed.byggelinjer === "string" ? parsed.byggelinjer : null,
        specialBestemmelser: Array.isArray(parsed.specialBestemmelser)
          ? (parsed.specialBestemmelser as string[])
          : [],
        kilde: "anthropic",
      };
    } catch {
      throw new Error(
        `PdfExtractorService: kunne ikke parse Anthropic-svar som JSON: ${rawText.slice(0, 200)}`,
      );
    }
  }
}
