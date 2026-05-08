// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
//
// Tinglysning – servitutter og andre tinglyste rettigheder (ARCH-104).
//
// ⚠️  IS_MOCK=true — TingbogenV2 kræver særskilt Datafordeler-abonnement.
//
// Verificering (ARCH-30, 2026-05-08): URL-formatet
//   https://services.datafordeler.dk/TingbogenV2/tingbogen/1.0.0/tingbog
// returnerer HTTP 404 for alle varianter af stien med den eksisterende API-nøgle.
// TingbogenV2 er en begrænset Datafordeler-tjeneste, der kræver særskilt tilmelding
// til TINGBOG-servicen (ikke inkluderet i standard-abonnementet).
//
// Løsning: Tilmeld TINGBOG-tjenesten på Datafordeler.dk, verificér endpoint,
// sæt FEATURE_FLAGS.tinglysningMock = false og kør integration test.
//
// Option B (fallback): Erhvervsstyrelsen B2B-adgang — kræver særskilt registrering.

import { FEATURE_FLAGS } from "@/lib/feature-flags";

const IS_MOCK = FEATURE_FLAGS.tinglysningMock;

const TINGBOGEN_BASE = "https://services.datafordeler.dk/TingbogenV2/tingbogen/1.0.0";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type Servitut = {
  dokumentId: string;
  type: "brugsret" | "vejret" | "byggelinje" | "højdebegrænsning" | "andet";
  tekst: string;
  tinglystDato: string;
  kritisk: boolean; // AI-evaluering: blokerer/begrænser byggeriet
};

export type TinglysningResult = {
  servitutter: Servitut[];
  pant: number; // antal pantehæftelser (ikke tekst, kun antal)
  kilde: "tinglysning" | "mock";
};

// ---------------------------------------------------------------------------
// Mock data — deterministisk testdata for Hasselvej 48-profil
// ---------------------------------------------------------------------------

const MOCK_RESULT: TinglysningResult = {
  servitutter: [
    {
      dokumentId: "mock-001",
      type: "byggelinje",
      tekst:
        "Ingen bebyggelse inden for 3 m fra skel mod nabo (sydside). Gælder alle bygninger uanset etageantal og udformning.",
      tinglystDato: "1994-09-22",
      kritisk: true,
    },
    {
      dokumentId: "mock-002",
      type: "andet",
      tekst:
        "Deklaration om fælles adgangsvej og parkeringsareal med naboejendom mod øst. Vedligeholdelsesudgifter fordeles ligeligt mellem parterne.",
      tinglystDato: "1987-04-15",
      kritisk: false,
    },
    {
      dokumentId: "mock-003",
      type: "andet",
      tekst:
        "Kloakservitut: Fælles kloakledning løber over ejendommen. Ingen permanent bebyggelse må opføres over ledningsstrækket.",
      tinglystDato: "2001-03-01",
      kritisk: false,
    },
  ],
  pant: 2,
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// AI-klassificering (live path) — Claude Haiku
// ---------------------------------------------------------------------------

async function classifyServitutter(servitutter: Omit<Servitut, "kritisk">[]): Promise<Servitut[]> {
  if (servitutter.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[Tinglysning] ANTHROPIC_API_KEY mangler — kritisk=false for alle servitutter");
    return servitutter.map((s) => ({ ...s, kritisk: false }));
  }

  const teksterListe = servitutter.map((s, i) => `${i + 1}. [${s.type}] ${s.tekst}`).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content:
            `Vurder om følgende servitutter blokerer eller væsentligt begrænser BYGGERI på ejendommen.\n` +
            `Svar KUN med et JSON array af booleans: [true/false, ...] — én per servitut i samme rækkefølge.\n\n` +
            teksterListe,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Anthropic klassificering HTTP ${res.status}`);

  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = body.content?.[0]?.type === "text" ? (body.content[0].text ?? "[]") : "[]";

  let kritiskListe: boolean[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    kritiskListe = match ? (JSON.parse(match[0]) as boolean[]) : [];
  } catch {
    kritiskListe = servitutter.map(() => false);
  }

  return servitutter.map((s, i) => ({
    ...s,
    kritisk: kritiskListe[i] ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Live API (Option A: Datafordeler TingbogenV2)
// ---------------------------------------------------------------------------

type TingbogsResponse = {
  TingbogPlus?: {
    Servitutter?: Array<{
      DokumentId?: string;
      TekstIndhold?: string;
      TinglystDato?: string;
      HaeftelsesType?: string;
    }>;
    Pantehæftelser?: unknown[];
  };
};

function mapServitutType(haeftelsesType?: string): Servitut["type"] {
  const t = (haeftelsesType ?? "").toLowerCase();
  if (t.includes("brugsret")) return "brugsret";
  if (t.includes("vejret")) return "vejret";
  if (t.includes("byggelin") || t.includes("byggelinie")) return "byggelinje";
  if (t.includes("højde") || t.includes("hoejde")) return "højdebegrænsning";
  return "andet";
}

async function fetchLiveTinglysning(
  ejerlavskode: number,
  matrikelnummer: string,
): Promise<TinglysningResult> {
  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) throw new Error("DATAFORDELER_API_KEY mangler");

  const url =
    `${TINGBOGEN_BASE}/tingbog?apiKey=${apiKey}` +
    `&ejerlavskode=${ejerlavskode}&matrikelnummer=${encodeURIComponent(matrikelnummer)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`TingbogenV2 HTTP ${res.status}`);

  const data = (await res.json()) as TingbogsResponse;
  const raw = data.TingbogPlus?.Servitutter ?? [];
  const pantCount = data.TingbogPlus?.Pantehæftelser?.length ?? 0;

  const rawServitutter = raw.map((s) => ({
    dokumentId: s.DokumentId ?? "",
    type: mapServitutType(s.HaeftelsesType),
    tekst: s.TekstIndhold ?? "",
    tinglystDato: s.TinglystDato ?? "",
  }));

  const servitutter = await classifyServitutter(rawServitutter).catch((e: Error) => {
    console.warn("[Tinglysning] AI-klassificering fejlede:", e.message);
    return rawServitutter.map((s) => ({ ...s, kritisk: false }));
  });

  return { servitutter, pant: pantCount, kilde: "tinglysning" };
}

// ---------------------------------------------------------------------------
// TinglysningService
// ---------------------------------------------------------------------------

export class TinglysningService {
  static async getServitutter(
    addressId: string,
    ejerlavskode?: number | null,
    matrikelnummer?: string | null,
  ): Promise<TinglysningResult> {
    if (!addressId) {
      return { servitutter: [], pant: 0, kilde: "mock" };
    }

    if (IS_MOCK) {
      return MOCK_RESULT;
    }

    if (!ejerlavskode || !matrikelnummer) {
      console.warn("[Tinglysning] Mangler ejerlavskode/matrikelnummer — returnerer tom liste");
      return { servitutter: [], pant: 0, kilde: "tinglysning" };
    }

    return fetchLiveTinglysning(ejerlavskode, matrikelnummer);
  }
}
