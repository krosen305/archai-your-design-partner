// SERVER-SIDE ONLY — Anthropic API-nøgle må aldrig nå browseren.
// ByggeanalyseService — matcher struktureret Byggeoenske mod lokalplan + BBR.
// IS_MOCK = false: live Anthropic-kald (ARCH-83).

import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { Byggeoenske } from "@/lib/project-store";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { BbrKompliantData } from "@/integrations/bbr/client";

// ---------------------------------------------------------------------------
// Output-typer
// ---------------------------------------------------------------------------

export type ByggeanalyseItem = {
  emne: string;
  begrundelse: string;
};

export type ByggeanalyseDispensation = {
  emne: string;
  begrundelse: string;
  lovhjemmel: string;
};

export type ByggeanalyseKonflikt = {
  emne: string;
  konflikt: string;
  lokalplan_krav: string;
  bruger_oenske: string;
};

export type ByggeanalyseMangel = {
  emne: string;
  hvad_mangler: string;
};

export type ByggeanalyseResultat = {
  tilladt: ByggeanalyseItem[];
  kraever_dispensation: ByggeanalyseDispensation[];
  konflikt: ByggeanalyseKonflikt[];
  mangler_data: ByggeanalyseMangel[];
  stilOpsummering: string | null;
  kilde: "mock" | "anthropic";
};

export type ByggeanalyseInput = {
  byggeoenske: Partial<Byggeoenske>;
  lokalplanExtract: LokalplanExtract | null;
  bbr: BbrKompliantData | null;
  lokalplanNavn: string;
};

// ---------------------------------------------------------------------------
// Mock-data
// ---------------------------------------------------------------------------

const MOCK_RESULTAT: ByggeanalyseResultat = {
  tilladt: [
    {
      emne: "Etager",
      begrundelse: "2 etager er inden for lokalplanens typiske maksimum på 2 etager.",
    },
    {
      emne: "Energiklasse",
      begrundelse: "Lavenergi-standard overstiger BR18-minimumskrav og er ikke begrænset af lokalplan.",
    },
  ],
  kraever_dispensation: [
    {
      emne: "Facademateriale",
      begrundelse:
        "Træ som primært facademateriale er ikke eksplicit nævnt som tilladt i lokalplanen.",
      lovhjemmel: "Planlovens § 19 — dispensation fra lokalplanbestemmelser",
    },
  ],
  konflikt: [],
  mangler_data: [
    {
      emne: "Bebyggelsesprocent",
      hvad_mangler:
        "Grundareal mangler for at beregne om det ønskede areal på 180 m² er realiserbart.",
    },
  ],
  stilOpsummering: null,
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// Prompt-konstruktion
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
Du er byggesagsrådgiver og analyserer konkrete konflikter mellem et byggeprojekt og lokalplanen.

Svar ALTID i følgende JSON-struktur (ingen markdown, ingen forklaring):
{
  "tilladt": [{ "emne": string, "begrundelse": string }],
  "kraever_dispensation": [{ "emne": string, "begrundelse": string, "lovhjemmel": string }],
  "konflikt": [{ "emne": string, "konflikt": string, "lokalplan_krav": string, "bruger_oenske": string }],
  "mangler_data": [{ "emne": string, "hvad_mangler": string }],
  "stilOpsummering": string eller null
}

Felter der ALTID skal matches mod lokalplanen:
- tagform → lokalplanens tagformkrav
- facademateriale → materialekrav i lokalplan
- antalEtager → max etager
- oensketAreal → max bebyggelsesprocent (beregn fra grundareal hvis tilgængeligt)
- arkitektoniskStil → farve- og stilbestemmelser
- udeomraade → altan- og terrassebestemmelser
- energiklasse → eventuelle energikrav
- ventilation → tekniske installationskrav

stilOpsummering: Kun udfyldes hvis der er uploadet inspirationsbilleder.
Skriv en kort, præcis sætning (max 2 sætninger) der beskriver den arkitektoniske stil på billederne.
`.trim();

function buildUserMessage(input: ByggeanalyseInput): string {
  const { byggeoenske, lokalplanExtract, bbr, lokalplanNavn } = input;

  const projektDele: string[] = [];
  if (byggeoenske.byggetype) projektDele.push(`Byggetype: ${byggeoenske.byggetype}`);
  if (byggeoenske.oensketAreal) projektDele.push(`Ønsket areal: ${byggeoenske.oensketAreal} m²`);
  if (byggeoenske.antalEtager) projektDele.push(`Etager: ${byggeoenske.antalEtager}`);
  if (byggeoenske.arkitektoniskStil) projektDele.push(`Arkitektonisk stil: ${byggeoenske.arkitektoniskStil}`);
  if (byggeoenske.tagform) projektDele.push(`Tagform: ${byggeoenske.tagform}`);
  if (byggeoenske.facademateriale) projektDele.push(`Facademateriale: ${byggeoenske.facademateriale}`);
  if (byggeoenske.vinduesandel) projektDele.push(`Vinduesandel: ${byggeoenske.vinduesandel}`);
  if (byggeoenske.udeomraade) projektDele.push(`Udeområde: ${byggeoenske.udeomraade}`);
  if (byggeoenske.energiklasse) projektDele.push(`Energiklasse: ${byggeoenske.energiklasse}`);
  if (byggeoenske.varmekilde) projektDele.push(`Varmekilde: ${byggeoenske.varmekilde}`);
  if (byggeoenske.ventilation) projektDele.push(`Ventilation: ${byggeoenske.ventilation}`);
  if (byggeoenske.budget) projektDele.push(`Budget: ${byggeoenske.budget} mio. kr.`);

  let msg = `## Byggeprojekt\n${projektDele.join("\n")}`;

  if (bbr) {
    const bbrDele: string[] = [];
    if (bbr.grundareal) bbrDele.push(`Grundareal: ${bbr.grundareal} m²`);
    if (bbr.bebygget_areal) bbrDele.push(`Nuv. bebygget areal: ${bbr.bebygget_areal} m²`);
    if (bbr.bebyggelsesprocent !== null) bbrDele.push(`Nuv. bebyggelsesprocent: ${bbr.bebyggelsesprocent}%`);
    if (bbr.antal_etager !== null) bbrDele.push(`Nuv. etager: ${bbr.antal_etager}`);
    if (bbrDele.length > 0) msg += `\n\n## Ejendom (BBR)\n${bbrDele.join("\n")}`;
  }

  if (lokalplanExtract) {
    const lpDele: string[] = [];
    if (lokalplanExtract.maxEtager !== null) lpDele.push(`Max etager: ${lokalplanExtract.maxEtager}`);
    if (lokalplanExtract.maxBebyggelsespct !== null) lpDele.push(`Max bebyggelsesprocent: ${lokalplanExtract.maxBebyggelsespct}%`);
    if (lokalplanExtract.tagform) lpDele.push(`Tagformkrav: ${lokalplanExtract.tagform}`);
    if (lokalplanExtract.materialer.length > 0) lpDele.push(`Tilladte materialer: ${lokalplanExtract.materialer.join(", ")}`);
    if (lokalplanExtract.byggelinjer) lpDele.push(`Byggelinjer: ${lokalplanExtract.byggelinjer}`);
    if (lokalplanExtract.specialBestemmelser.length > 0) {
      lpDele.push(`Særlige bestemmelser:\n${lokalplanExtract.specialBestemmelser.map((s) => `- ${s}`).join("\n")}`);
    }
    if (lpDele.length > 0) msg += `\n\n## Lokalplan: ${lokalplanNavn}\n${lpDele.join("\n")}`;
  }

  msg +=
    "\n\nIdentificer præcist hvilke af brugerens valg der er tilladt, kræver dispensation, er i direkte konflikt, eller mangler data til at vurdere.";

  if (
    byggeoenske.inspirationsbilleder &&
    byggeoenske.inspirationsbilleder.length > 0
  ) {
    msg +=
      "\n\nDer er uploadet inspirationsbilleder. Beskriv kort den arkitektoniske stil i stilOpsummering-feltet.";
  }

  return msg;
}

// ---------------------------------------------------------------------------
// Billeder som vision-input (max 4 for at begrænse tokens)
// ---------------------------------------------------------------------------

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } };

function buildImageBlocks(urls: string[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const url of urls.slice(0, 4)) {
    if (url.startsWith("data:image/")) {
      // Base64 (gæst-bruger)
      const [header, data] = url.split(",");
      const mediaType = header.includes("png") ? "image/png" : "image/jpeg";
      blocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    } else {
      // Signed URL fra Supabase Storage
      blocks.push({ type: "image", source: { type: "url", url } });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// ByggeanalyseService
// ---------------------------------------------------------------------------

export class ByggeanalyseService {
  static async analyse(input: ByggeanalyseInput): Promise<ByggeanalyseResultat> {
    const { byggeoenske } = input;

    // Ingen meningsfulde data → returnér mock
    const harByggeoenskeData = Object.values(byggeoenske).some(
      (v) => v !== undefined && v !== null,
    );
    if (!harByggeoenskeData) return MOCK_RESULTAT;

    if (FEATURE_FLAGS.byggeanalyseMock) return MOCK_RESULTAT;

    const apiKey = (process as any)?.env?.ANTHROPIC_API_KEY as string ?? "";
    if (!apiKey) {
      console.warn("[ByggeanalyseService] ANTHROPIC_API_KEY mangler — returnerer mock");
      return MOCK_RESULTAT;
    }

    const userText = buildUserMessage(input);
    const imageBlocks = buildImageBlocks(byggeoenske.inspirationsbilleder ?? []);

    const userContent: ContentBlock[] = [
      ...imageBlocks,
      { type: "text", text: userText },
    ];

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (res.status !== 429) break;
      const delayMs = 10_000 * Math.pow(2, attempt);
      console.warn(`[ByggeanalyseService] Rate limit — venter ${delayMs / 1000}s (forsøg ${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!res!.ok) {
      const body = await res!.text();
      throw new Error(`ByggeanalyseService: Anthropic API fejl (${res!.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res!.json()) as { content?: Array<{ text?: string }> };
    const rawText = json?.content?.[0]?.text ?? "{}";
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        tilladt: Array.isArray(parsed.tilladt) ? parsed.tilladt : [],
        kraever_dispensation: Array.isArray(parsed.kraever_dispensation)
          ? parsed.kraever_dispensation
          : [],
        konflikt: Array.isArray(parsed.konflikt) ? parsed.konflikt : [],
        mangler_data: Array.isArray(parsed.mangler_data) ? parsed.mangler_data : [],
        stilOpsummering: typeof parsed.stilOpsummering === "string" ? parsed.stilOpsummering : null,
        kilde: "anthropic",
      };
    } catch {
      throw new Error(
        `ByggeanalyseService: kunne ikke parse Anthropic-svar: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
