// SERVER-SIDE ONLY – Anthropic API-nøgle må aldrig nå browseren.
// PdfExtractorService — udtræk strukturerede regler fra lokalplan-PDFer via Claude.
// IS_MOCK = false: live Anthropic-kald aktivt (ARCH-53).
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller PDF ikke kan hentes.
// Kræver ANTHROPIC_API_KEY i .dev.vars (lokalt) og Wrangler secrets (prod).

// ---------------------------------------------------------------------------
// Mock flag
// ---------------------------------------------------------------------------

const IS_MOCK = false;

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
// Anthropic prompt
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `
Du er en dansk byggesagsbehandler. Læs følgende lokalplan-tekst og udtræk disse oplysninger som JSON:

{
  "maxEtager": <antal etager som heltal eller null>,
  "maxBebyggelsespct": <bebyggelsesprocent som heltal eller null>,
  "tagform": <beskrivelse af krav til tagform som string eller null>,
  "materialer": <array af tilladte facadematerialer>,
  "byggelinjer": <afstandskrav til skel/vej som string eller null>,
  "specialBestemmelser": <array af øvrige vigtige bestemmelser>
}

Svar KUN med JSON — ingen forklaring eller ekstra tekst.

LOKALPLAN-TEKST:
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

    const apiKey = (process as any)?.env?.ANTHROPIC_API_KEY ?? "";
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
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // Send til Claude med PDF som dokument — retry ved 429 (rate limit)
    let anthropicRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
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
      console.warn(`[PdfExtractor] Rate limit (429) — venter ${delayMs / 1000}s før retry ${attempt + 1}/3`);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!anthropicRes!.ok) {
      const body = await anthropicRes!.text();
      throw new Error(
        `PdfExtractorService: Anthropic API fejl (${anthropicRes!.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await anthropicRes!.json()) as any;
    const rawText: string = json?.content?.[0]?.text ?? "{}";

    // Claude returnerer ind imellem JSON pakket i ```json ... ``` — strip disse
    const text = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim() || "{}";

    try {
      const parsed = JSON.parse(text);
      return {
        maxEtager: parsed.maxEtager ?? null,
        maxBebyggelsespct: parsed.maxBebyggelsespct ?? null,
        tagform: parsed.tagform ?? null,
        materialer: Array.isArray(parsed.materialer) ? parsed.materialer : [],
        byggelinjer: parsed.byggelinjer ?? null,
        specialBestemmelser: Array.isArray(parsed.specialBestemmelser)
          ? parsed.specialBestemmelser
          : [],
        kilde: "anthropic",
      };
    } catch {
      throw new Error(
        `PdfExtractorService: kunne ikke parse Anthropic-svar som JSON: ${text.slice(0, 200)}`,
      );
    }
  }
}
