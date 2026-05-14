// SERVER-SIDE ONLY — Anthropic API-nøgle må aldrig nå browseren.
// ByggeanalyseService — matcher struktureret Byggeoenske mod lokalplan + BBR.
// IS_MOCK = false: live Anthropic-kald (ARCH-83).
// ARCH-109: modtager RuleEngineResult som kontekst — AI genberegner ikke.

import { z } from "zod";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { Byggeoenske } from "@/lib/project-store";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme, Lokalplan } from "@/integrations/plandata/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import { getEnvOptional } from "@/lib/env";
import { logger } from "@/lib/logger";

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
  ruleEngine?: RuleEngineResult; // regelkerne-resultat fra ARCH-109
};

export type ByggeanalyseInput = {
  byggeoenske: Partial<Byggeoenske>;
  lokalplanExtract: LokalplanExtract | null;
  bbr: BbrKompliantData | null;
  lokalplanNavn: string;
  // Ekstra kontekst til regelkerne (ARCH-109) — valgfri for bagudkompatibilitet
  kommuneplanramme?: Kommuneplanramme | null;
  lokalplaner?: Lokalplan[];
  naturbeskyttelse?: NaturbeskyttelsesResultat | null;
  geusRisk?: GeusRiskData | null;
  servitutter?: TinglysningResult | null;
  terrain?: TerrainData | null;
  fbbData?: import("@/integrations/fbb/client").FbbResultat | null; // ARCH-131
  municipality?: string;
  kommunekode?: string;
  ruleEngineResult?: RuleEngineResult; // sendt fra runByggeanalyse-handleren
};

const ByggeanalyseSchema = z.object({
  tilladt: z.array(z.object({ emne: z.string(), begrundelse: z.string() })).default([]),
  kraever_dispensation: z
    .array(z.object({ emne: z.string(), begrundelse: z.string(), lovhjemmel: z.string() }))
    .default([]),
  konflikt: z
    .array(
      z.object({
        emne: z.string(),
        konflikt: z.string(),
        lokalplan_krav: z.string(),
        bruger_oenske: z.string(),
      }),
    )
    .default([]),
  mangler_data: z.array(z.object({ emne: z.string(), hvad_mangler: z.string() })).default([]),
  stilOpsummering: z.string().nullable().default(null),
});

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
      begrundelse:
        "Lavenergi-standard overstiger BR18-minimumskrav og er ikke begrænset af lokalplan.",
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

const SYSTEM_PROMPT_BASE = `
Du er dansk byggesagsekspert. Du modtager allerede beregnede regelresultater og skal fortolke dem, vurdere dispensationssandsynligheder og identificere risici der IKKE fanges af de deterministiske regler.

Svar ALTID i følgende JSON-struktur (ingen markdown, ingen forklaring):
{
  "tilladt": [{ "emne": string, "begrundelse": string }],
  "kraever_dispensation": [{ "emne": string, "begrundelse": string, "lovhjemmel": string }],
  "konflikt": [{ "emne": string, "konflikt": string, "lokalplan_krav": string, "bruger_oenske": string }],
  "mangler_data": [{ "emne": string, "hvad_mangler": string }],
  "stilOpsummering": string eller null
}

Din opgave:
1. Fortolk lokalplan-klausuler der IKKE er dækket af de beregnede regler (stil, materialer, særlige bestemmelser)
2. Vurder dispensationssandsynlighed (høj/medium/lav) for hvert punkt i dispensationList
3. Identificér risici der kræver ingeniørvurdering (geoteknik, konstruktion, brand)
4. Match byggeønsker mod lokalplan-bestemmelser der ikke kan beregnes matematisk

VIGTIGT: Genberegn IKKE bebyggelsesprocent, etager eller bygningshøjde — disse er allerede beregnet.
stilOpsummering: Kun udfyldes hvis der er uploadet inspirationsbilleder.
`.trim();

// Simpel prompt til bagudkompatibilitet (ingen regelkerne-data tilgængeligt)
const SYSTEM_PROMPT_LEGACY = `
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
  if (byggeoenske.arkitektoniskStil)
    projektDele.push(`Arkitektonisk stil: ${byggeoenske.arkitektoniskStil}`);
  if (byggeoenske.tagform) projektDele.push(`Tagform: ${byggeoenske.tagform}`);
  if (byggeoenske.facademateriale)
    projektDele.push(`Facademateriale: ${byggeoenske.facademateriale}`);
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
    if (bbr.bebyggelsesprocent !== null)
      bbrDele.push(`Nuv. bebyggelsesprocent: ${bbr.bebyggelsesprocent}%`);
    if (bbr.antal_etager !== null) bbrDele.push(`Nuv. etager: ${bbr.antal_etager}`);
    // Energibaseline (ARCH-117)
    if (bbr.varmeinstallation) bbrDele.push(`Eksist. varmeinstallation: ${bbr.varmeinstallation}`);
    if (bbr.opvarmningsmiddel) bbrDele.push(`Eksist. opvarmningsmiddel: ${bbr.opvarmningsmiddel}`);
    // Materialer (ARCH-118) — kontekst for tilbygnings- og ombygningsprojekter
    if (bbr.ydervaegs_materiale)
      bbrDele.push(`Eksist. facademateriale: ${bbr.ydervaegs_materiale}`);
    if (bbr.tagdaekning) bbrDele.push(`Eksist. tagdækning: ${bbr.tagdaekning}`);
    if (bbr.fredet) bbrDele.push(`Fredning: Ja (BBR byg070)`);
    if (bbrDele.length > 0) msg += `\n\n## Ejendom (BBR)\n${bbrDele.join("\n")}`;
  }

  if (lokalplanExtract) {
    const lpDele: string[] = [];
    if (lokalplanExtract.maxEtager !== null)
      lpDele.push(`Max etager: ${lokalplanExtract.maxEtager}`);
    if (lokalplanExtract.maxBebyggelsespct !== null)
      lpDele.push(`Max bebyggelsesprocent: ${lokalplanExtract.maxBebyggelsespct}%`);
    if (lokalplanExtract.tagform) lpDele.push(`Tagformkrav: ${lokalplanExtract.tagform}`);
    if (lokalplanExtract.materialer.length > 0)
      lpDele.push(`Tilladte materialer: ${lokalplanExtract.materialer.join(", ")}`);
    if (lokalplanExtract.byggelinjer) lpDele.push(`Byggelinjer: ${lokalplanExtract.byggelinjer}`);
    if (lokalplanExtract.specialBestemmelser.length > 0) {
      lpDele.push(
        `Særlige bestemmelser:\n${lokalplanExtract.specialBestemmelser.map((s) => `- ${s}`).join("\n")}`,
      );
    }
    if (lpDele.length > 0) msg += `\n\n## Lokalplan: ${lokalplanNavn}\n${lpDele.join("\n")}`;
  }

  // Regelkerne-kontekst (ARCH-109) — AI skal ikke genberegne disse
  if (input.ruleEngineResult) {
    const re = input.ruleEngineResult;
    const reSummary: string[] = [];
    reSummary.push(`Status: ${re.status}`);
    if (re.violations.length > 0) {
      reSummary.push(
        `Violations:\n${re.violations.map((v) => `- [${v.severity}] ${v.rule}: ${v.reason.slice(0, 120)}`).join("\n")}`,
      );
    }
    if (re.dispensationList.length > 0) {
      reSummary.push(
        `Dispensationskrav:\n${re.dispensationList.map((d) => `- ${d.label} (${d.authority})`).join("\n")}`,
      );
    }
    if (re.missingInputs.length > 0) {
      reSummary.push(`Manglende data: ${re.missingInputs.slice(0, 6).join(", ")}`);
    }
    const calc = re.calculations;
    if (calc.buildingPercent.actual !== null) {
      reSummary.push(
        `Beregnet bebyggelsesprocent: ${calc.buildingPercent.actual}% (limit: ${calc.buildingPercent.limit}%, kilde: ${calc.buildingPercent.appliedRule})`,
      );
    }
    msg += `\n\n## Deterministisk regelkerne-resultat (GENBEREGN IKKE)\n${reSummary.join("\n\n")}`;
  }

  msg +=
    "\n\nIdentificer præcist hvilke af brugerens valg der er tilladt, kræver dispensation, er i direkte konflikt, eller mangler data til at vurdere.";

  if (byggeoenske.inspirationsbilleder && byggeoenske.inspirationsbilleder.length > 0) {
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
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
    };

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

    const apiKey = getEnvOptional("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) {
      logger.warn("[ByggeanalyseService] ANTHROPIC_API_KEY mangler — returnerer mock");
      return MOCK_RESULTAT;
    }

    const systemPrompt = input.ruleEngineResult ? SYSTEM_PROMPT_BASE : SYSTEM_PROMPT_LEGACY;
    const userText = buildUserMessage(input);
    const imageBlocks = buildImageBlocks(byggeoenske.inspirationsbilleder ?? []);

    const userContent: ContentBlock[] = [...imageBlocks, { type: "text", text: userText }];

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
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (res.status !== 429) break;
      const delayMs = 10_000 * Math.pow(2, attempt);
      logger.warn(
        `[ByggeanalyseService] Rate limit — venter ${delayMs / 1000}s (forsøg ${attempt + 1}/3)`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!res!.ok) {
      const body = await res!.text();
      throw new Error(
        `ByggeanalyseService: Anthropic API fejl (${res!.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res!.json()) as { content?: Array<{ text?: string }> };
    const rawText = json?.content?.[0]?.text ?? "{}";
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    try {
      const parsed = ByggeanalyseSchema.parse(JSON.parse(cleaned));
      return { ...parsed, kilde: "anthropic" as const, ruleEngine: input.ruleEngineResult };
    } catch {
      throw new Error(
        `ByggeanalyseService: kunne ikke parse Anthropic-svar: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
