export type BilledeAnalyseKategorier = {
  facade: string[];
  tagform: string[];
  vinduer: string[];
  materialer: string[];
  saerligeTraek: string[];
  farver: string[];
  stil: string[];
};

export type BilledeAnalyseKonflikt = {
  kategori: keyof BilledeAnalyseKategorier;
  muligheder: string[][];
  billedAntal: number[];
};

export type BilledeAnalyseResultat = {
  kategorier: BilledeAnalyseKategorier;
  konflikter: BilledeAnalyseKonflikt[];
  ekstraTags: string[];
  confidence: number;
  kilde: "haiku" | "mock";
};

export const BILLEDE_ANALYSE_VOCAB: Record<keyof BilledeAnalyseKategorier, string[]> = {
  facade: [
    "pudset",
    "tegl",
    "træbeklædning",
    "beton",
    "zink",
    "fiber-cement",
    "natursten",
    "cortenstål",
    "bindingsværk",
    "glas-facade",
  ],
  tagform: [
    "fladt tag",
    "sadeltag",
    "ensidig hældning",
    "mansardtag",
    "valmet tag",
    "tøndetag",
    "sedum-tag",
    "taghave",
  ],
  vinduer: [
    "store formater",
    "vinduesbånd",
    "taglys",
    "kviste",
    "franske døre",
    "hjørnevinduer",
    "facadeglas",
    "smalt format",
    "ovenlys",
  ],
  materialer: [
    "beton",
    "glas",
    "træ",
    "stål",
    "mursten",
    "zink",
    "kobber",
    "keramik",
    "komposit",
    "natursten",
  ],
  saerligeTraek: [
    "integreret carport",
    "fritstående carport",
    "overdækket terrasse",
    "altan",
    "taghave",
    "pool",
    "solceller",
    "udestue",
    "anneks",
    "udvendig trappe",
    "dobbelthøjt rum",
    "gennemgående plan",
  ],
  farver: [
    "hvid",
    "sort",
    "antracit",
    "mørkegrå",
    "lysegrå",
    "beige",
    "sandfarvet",
    "terracotta",
    "mørk træ",
    "lys træ",
    "rød tegl",
    "grøn patina",
  ],
  stil: [
    "minimalistisk",
    "moderne",
    "skandinavisk",
    "klassisk",
    "industriel",
    "organisk",
    "rustikt",
    "bæredygtigt",
    "nordisk",
  ],
};

const VOCAB_LINES = (
  Object.entries(BILLEDE_ANALYSE_VOCAB) as [keyof BilledeAnalyseKategorier, string[]][]
)
  .map(([kategori, termer]) => `${kategori}: [${termer.join(", ")}]`)
  .join("\n");

export const BILLEDE_ANALYSE_SYSTEM_PROMPT = `Du er arkitektonisk billedanalysatør for et dansk byggesagsystem.

Analyser de vedlagte billeder af boliger og returner præcis dette JSON-format - intet andet:
{
  "kategorier": {
    "facade": [...],
    "tagform": [...],
    "vinduer": [...],
    "materialer": [...],
    "saerligeTraek": [...],
    "farver": [...],
    "stil": [...]
  },
  "konflikter": [
    {
      "kategori": "<kategorinavn>",
      "muligheder": [[...], [...]],
      "billedAntal": [n, m]
    }
  ],
  "ekstraTags": [...],
  "confidence": 0-100
}

REGLER:
- Vælg KUN fra nedenstående vocab per kategori
- Tilføj tags til ekstraTags hvis du ser noget der ikke er i vocab
- Angiv konflikt hvis 2 eller flere billeder klart peger i modstridende retninger inden for en kategori
- Returner kun JSON - ingen forklaringstekst

VOCAB:
${VOCAB_LINES}`;
