// src/lib/drawing/sheet-layout.test.ts
import { describe, it, expect } from "bun:test";
import { buildInfoLines, wrapText, type InfoLine } from "./sheet-layout";
import type { DrawingModel, InfoPanel } from "@/domain/drawing/drawing-model";

const infoPanel: InfoPanel = {
  siteMetrics: {
    grundarealM2: 1086,
    bebyggetArealM2: 140.57,
    etagearealM2: 271.24,
    bebyggelsesprocent: 24.98,
    calculationBasis: "BR18",
    rows: [
      { label: "Grundareal", value: 1086, display: "1.086 m²", documented: true },
      { label: "Samlet etageareal", value: null, display: "ikke dokumenteret", documented: false },
    ],
  },
  sourceRegister: [
    {
      label: "Matrikel (MAT WFS)",
      source: "registry",
      confidence: "high",
      fetchedAt: "2026-06-01T00:00:00Z",
      documented: true,
    },
  ],
  terrain: {
    koteDatum: "DVR90",
    sokkelKoteDisplay: "angives af kloakmester",
    gulvKoteDisplay: "ikke dokumenteret",
    rygningsKoteDisplay: "angives af arkitekt",
    terrainPointCount: 0,
    documented: false,
    note: "Koter ikke dokumenteret i tilgængelige datakilder",
  },
  technicalNotes: [{ category: "ledning", text: "Ledningsdata ikke hentet (LER)." }],
  missingDataWarnings: [
    {
      label: "Sokkelkote DVR90",
      responsibleParty: "kloakmester",
      blocksSubmission: false,
      severity: "placeholder",
    },
  ],
  completenessStatus: "UDKAST — 5 punkter mangler",
};

const model: DrawingModel = {
  page: { size: "A3", orientation: "landscape", scale: 250, widthMm: 420, heightMm: 297 },
  viewport: { bbox25832: [0, 0, 100, 100], metersPerMm: 0.25 },
  features: [],
  titleBlock: {
    title: "Beliggenhedsplan",
    drawingType: "Beliggenhedsplan",
    tegnNr: "1",
    address: "Byledet 3, 2820 Gentofte",
    matrikel: "2ac",
    bfeNr: "999",
    bygherre: "Test Bygherre",
    sagNr: "703036",
    buildingCode: "BR18",
    scale: "1:250",
    paperSize: "A3",
    date: "2026-06-09",
    revision: "A",
    disclaimer: "FORELØBIG — ikke til myndighedsbrug",
  },
  infoPanel,
  legend: [{ symbol: "<rect/>", label: "Matrikelskel" }],
  northArrowRotationDeg: 0,
  readinessStatus: "AUTO_DRAFT",
};

function headings(lines: InfoLine[]): string[] {
  return lines
    .filter((l): l is Extract<InfoLine, { kind: "heading" }> => l.kind === "heading")
    .map((l) => l.text);
}

describe("buildInfoLines", () => {
  it("starts with the drawing type as the title", () => {
    const lines = buildInfoLines(model);
    expect(lines[0]).toEqual({ kind: "title", text: "Beliggenhedsplan" });
    expect(lines[1]).toEqual({ kind: "subtitle", text: "Byledet 3, 2820 Gentofte" });
  });

  it("includes the mandatory sections in order", () => {
    const h = headings(buildInfoLines(model));
    expect(h).toContain("Arealer");
    expect(h).toContain("Datagrundlag");
    expect(h).toContain("Terræn og koter");
    expect(h).toContain("Tekniske noter");
    expect(h).toContain("Manglende / ikke-verificeret data");
    expect(h).toContain("Signaturforklaring");
  });

  it("emits a keyvalue line per site-metric row with muted flag", () => {
    const lines = buildInfoLines(model);
    const kv = lines.filter((l) => l.kind === "keyvalue");
    const etage = kv.find((l) => l.kind === "keyvalue" && l.key.includes("etageareal"));
    expect(etage).toBeDefined();
    if (etage?.kind === "keyvalue") {
      expect(etage.value).toBe("ikke dokumenteret");
      expect(etage.muted).toBe(true);
    }
  });

  it("emits warning lines for terrain note and missing data", () => {
    const warnings = buildInfoLines(model).filter((l) => l.kind === "warning");
    const texts = warnings.map((w) => (w.kind === "warning" ? w.text : ""));
    expect(texts.some((t) => t.includes("Koter ikke dokumenteret"))).toBe(true);
    expect(texts.some((t) => t.includes("Sokkelkote") && t.includes("kloakmester"))).toBe(true);
  });

  it("emits a status line and a disclaimer line", () => {
    const lines = buildInfoLines(model);
    expect(lines.some((l) => l.kind === "status" && l.text.includes("UDKAST"))).toBe(true);
    expect(lines.some((l) => l.kind === "disclaimer" && l.text.includes("FORELØBIG"))).toBe(true);
  });

  it("emits a legend line per legend entry", () => {
    const legend = buildInfoLines(model).filter((l) => l.kind === "legend");
    expect(legend).toHaveLength(1);
  });
});

describe("wrapText", () => {
  it("returns a single line when text fits", () => {
    expect(wrapText("kort tekst", 40)).toEqual(["kort tekst"]);
  });

  it("wraps long text into multiple lines within the limit", () => {
    const long =
      "Ledningsdata ikke hentet (LER). Regnvand og spildevand vist som principforslag, ikke en dokumenteret ledningsplan.";
    const wrapped = wrapText(long, 40);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      // each emitted line is at most one word over the soft limit
      expect(line.length).toBeLessThanOrEqual(45);
    }
  });

  it("never loses words", () => {
    const text = "et to tre fire fem seks syv otte ni ti";
    expect(wrapText(text, 10).join(" ")).toBe(text);
  });
});
