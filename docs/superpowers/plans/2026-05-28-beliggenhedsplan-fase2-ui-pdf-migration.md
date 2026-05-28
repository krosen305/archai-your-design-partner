# Beliggenhedsplan Fase 2 — UI, PDF, Migration, Vejnavn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gør beliggenhedsplan-generatoren brugervenlig og komplet: Supabase-migration, PDF-generering via `pdf-lib`, live vejnavn fra DAR, og en rigtig UI-side i `/projekt/teknik` der viser preview, readiness og download-links.

**Architecture:** Server-funktionen `exportBeliggenhedsplanFn` returnerer SVG-indhold direkte + signeret PDF-URL. UI henter data fra `useProject()` (adresse, kommunekode, matrikelId fra BBR, designPlacement footprint). PDF renderes fra `DrawingModel` via `pdf-lib` vektoropbygning — ingen SVG→raster-konvertering, Cloudflare-kompatibelt.

**Tech Stack:** `bun:test`, `pdf-lib` (bun add), Supabase Storage (eksisterende), DAWA REST (display-data), TanStack `createServerFn`, Zustand `useProject()`.

---

## Filer: opret / modificer

| Handling | Fil | Ansvar |
|---|---|---|
| **Opret** | `supabase/migrations/20260528100000_drawing_exports.sql` | `drawing_exports`-tabel + indexes + RLS |
| **Opret** | `src/lib/drawing/render-pdf.ts` | PDF-renderer fra `DrawingModel` via pdf-lib |
| **Ændr** | `src/services/drawing/export-drawing.service.ts` | Kald renderPdf, sæt pdfPath, returner svgContent + pdfUrl |
| **Ændr** | `src/routes/api.drawing.ts` | footprintGeojson + addressText i schema, brug decodeGeoJsonFootprint |
| **Ændr** | `src/integrations/geodanmark/drawing-layers.ts` | Implementer fetchRoadName via DAWA |
| **Ændr** | `src/routes/projekt.teknik.tsx` | Erstat Coming Soon med beliggenhedsplan-UI |

---

## Task 1: Supabase-migration — `drawing_exports`

**Files:**
- Create: `supabase/migrations/20260528100000_drawing_exports.sql`

- [ ] **Step 1: Skriv migration-filen**

```sql
-- =============================================================================
-- drawing_exports: tabel til beliggenhedsplan-eksporter (Fase 2)
--
-- DrawingRepository (drawing.repository.ts) bruger denne tabel allerede —
-- den eksisterer ikke i prod endnu. Kør migration før deploy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.drawing_exports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  svg_path        text,
  pdf_path        text,
  readiness_status text       NOT NULL,
  input_hash      text        NOT NULL,
  drawing_type    text        NOT NULL DEFAULT 'beliggenhedsplan',
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'review', 'approved', 'rejected')),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS drawing_exports_project_id_idx
  ON public.drawing_exports(project_id);

CREATE INDEX IF NOT EXISTS drawing_exports_generated_at_idx
  ON public.drawing_exports(project_id, generated_at DESC);

-- RLS: ejere ser kun egne projekters eksporter
ALTER TABLE public.drawing_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ejere ser egne eksporter"
  ON public.drawing_exports FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Ejere opretter eksporter"
  ON public.drawing_exports FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.drawing_exports CASCADE;
```

- [ ] **Step 2: Verificer syntaks og commit**

```bash
bunx tsc --noEmit
git add supabase/migrations/20260528100000_drawing_exports.sql
git commit -m "feat(migration): drawing_exports tabel til beliggenhedsplan-eksporter"
```

---

## Task 2: Installer pdf-lib

**Files:**
- Modify: `package.json` (via bun add)

- [ ] **Step 1: Installer pdf-lib**

```bash
bun add pdf-lib
```

Forventet: `pdf-lib` dukker op i `package.json` under `dependencies`.

- [ ] **Step 2: Verificer at TypeScript kan importere pdf-lib**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl relateret til `pdf-lib`.

---

## Task 3: PDF-renderer fra DrawingModel

**Files:**
- Create: `src/lib/drawing/render-pdf.ts`
- Test: skrives inline nedenfor (se step 1)

Arkitektur: `renderPdf(model: DrawingModel): Promise<Uint8Array>` renderers direkte fra modellen — ingen SVG-streng-parsing. SVG-elementstrengene i `DrawingFeature.svgElement` parses med simple regex for `<polygon>`, `<line>`, `<text>`, `<circle>`. Koordinater er allerede i SVG-pixels (3.7795 px/mm); konverteres til PDF-points (2.8346 pt/mm).

**Koordinatkonvertering:**
- `pdfX = svgPx * 0.75` (px→pt: 2.8346/3.7795 ≈ 0.75)
- `pdfY = pageHeightPt − svgPx * 0.75` (flip Y: SVG har 0,0 top-left, PDF har 0,0 bottom-left)

- [ ] **Step 1: Skriv fejltest (TDD)**

Opret `src/lib/drawing/render-pdf.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { renderPdf } from "./render-pdf";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

function makeMinimalModel(): DrawingModel {
  return {
    page: { size: "A3", orientation: "landscape", scale: 250, widthMm: 420, heightMm: 297 },
    viewport: { bbox25832: [720000, 6175000, 720100, 6175100], metersPerMm: 0.25 },
    features: [
      {
        id: "parcel",
        kind: "parcel_boundary",
        svgElement: '<polygon points="10,10 110,10 110,110 10,110" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "1a",
        labelX: 60,
        labelY: 60,
        zIndex: 30,
      },
    ],
    titleBlock: {
      title: "Beliggenhedsplan",
      address: "Testvej 1",
      matrikel: "1a Testby By, Testby",
      bygherre: null,
      sagNr: null,
      scale: "1:250",
      paperSize: "A3",
      date: "2026-05-28",
      revision: "A",
      disclaimer: "UDKAST",
      sourceList: ["MAT WFS"],
    },
    legend: [],
    northArrowRotationDeg: 0,
    readinessStatus: "AUTO_DRAFT",
  };
}

describe("renderPdf", () => {
  it("returnerer Uint8Array for en minimal model", async () => {
    const result = await renderPdf(makeMinimalModel());
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);
  });

  it("starter med PDF-magic bytes %PDF", async () => {
    const result = await renderPdf(makeMinimalModel());
    const header = new TextDecoder().decode(result.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("inkluderer en model med labeler uden at kaste fejl", async () => {
    const model = makeMinimalModel();
    model.features.push({
      id: "label-1",
      kind: "labels",
      svgElement: '<text x="60" y="60" font-family="Arial" font-size="7" fill="#000">Testvej 1</text>',
      label: "Testvej 1",
      labelX: 60,
      labelY: 60,
      zIndex: 45,
    });
    await expect(renderPdf(model)).resolves.toBeInstanceOf(Uint8Array);
  });
});
```

- [ ] **Step 2: Kør test — verificer at de fejler**

```bash
bun test src/lib/drawing/render-pdf.test.ts
```

Forventet: `Cannot find module './render-pdf'` eller lignende fejl.

- [ ] **Step 3: Implementer render-pdf.ts**

Opret `src/lib/drawing/render-pdf.ts`:

```typescript
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

const PX_TO_PT = 0.7500; // (72pt/inch) / (96px/inch) ≈ 0.75; i dette projekt 2.8346/3.7795

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().toLowerCase();
  if (clean === "none" || clean === "transparent") return null;
  if (clean.startsWith("#")) {
    const h = clean.slice(1);
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16) / 255,
        g: parseInt(h[1] + h[1], 16) / 255,
        b: parseInt(h[2] + h[2], 16) / 255,
      };
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
      };
    }
  }
  if (clean === "#000" || clean === "black") return { r: 0, g: 0, b: 0 };
  if (clean === "#fff" || clean === "white") return { r: 1, g: 1, b: 1 };
  return null;
}

function attr(el: string, name: string): string | null {
  const m = el.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function drawPolygon(
  page: PDFPage,
  pageH: number,
  svgEl: string,
): void {
  const pointsStr = attr(svgEl, "points");
  if (!pointsStr) return;
  const fillStr = attr(svgEl, "fill") ?? "none";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");

  const pts = pointsStr.trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(",").map(Number);
    return { x: x * PX_TO_PT, y: pageH - y * PX_TO_PT };
  });

  if (pts.length < 2) return;

  const pathParts = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 1; i < pts.length; i++) {
    pathParts.push(`L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`);
  }
  pathParts.push("Z");
  const pathData = pathParts.join(" ");

  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawSvgPath(pathData, {
    x: 0,
    y: 0,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function drawLine(page: PDFPage, pageH: number, svgEl: string): void {
  const x1 = parseFloat(attr(svgEl, "x1") ?? "0");
  const y1 = parseFloat(attr(svgEl, "y1") ?? "0");
  const x2 = parseFloat(attr(svgEl, "x2") ?? "0");
  const y2 = parseFloat(attr(svgEl, "y2") ?? "0");
  const strokeStr = attr(svgEl, "stroke") ?? "#000";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const strokeRgb = hexToRgb(strokeStr);
  if (!strokeRgb) return;

  page.drawLine({
    start: { x: x1 * PX_TO_PT, y: pageH - y1 * PX_TO_PT },
    end: { x: x2 * PX_TO_PT, y: pageH - y2 * PX_TO_PT },
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    thickness: strokeW * PX_TO_PT,
  });
}

function drawText(
  page: PDFPage,
  pageH: number,
  svgEl: string,
  font: PDFFont,
): void {
  const x = parseFloat(attr(svgEl, "x") ?? "0");
  const y = parseFloat(attr(svgEl, "y") ?? "0");
  const fontSize = parseFloat(attr(svgEl, "font-size") ?? "7");
  const fillStr = attr(svgEl, "fill") ?? "#000";
  const fillRgb = hexToRgb(fillStr);
  const textMatch = svgEl.match(/>([^<]+)</);
  const text = textMatch
    ? textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    : "";
  if (!text.trim()) return;

  page.drawText(text, {
    x: x * PX_TO_PT,
    y: pageH - y * PX_TO_PT,
    font,
    size: fontSize * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : rgb(0, 0, 0),
  });
}

function drawCircle(page: PDFPage, pageH: number, svgEl: string): void {
  const cx = parseFloat(attr(svgEl, "cx") ?? "0");
  const cy = parseFloat(attr(svgEl, "cy") ?? "0");
  const r = parseFloat(attr(svgEl, "r") ?? "2");
  const fillStr = attr(svgEl, "fill") ?? "#000";
  const fillRgb = hexToRgb(fillStr);

  page.drawCircle({
    x: cx * PX_TO_PT,
    y: pageH - cy * PX_TO_PT,
    size: r * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : rgb(0, 0, 0),
  });
}

function drawRect(page: PDFPage, pageH: number, svgEl: string): void {
  const x = parseFloat(attr(svgEl, "x") ?? "0");
  const y = parseFloat(attr(svgEl, "y") ?? "0");
  const w = parseFloat(attr(svgEl, "width") ?? "0");
  const h = parseFloat(attr(svgEl, "height") ?? "0");
  const fillStr = attr(svgEl, "fill") ?? "none";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawRectangle({
    x: x * PX_TO_PT,
    y: pageH - (y + h) * PX_TO_PT,
    width: w * PX_TO_PT,
    height: h * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function renderSvgElement(
  page: PDFPage,
  pageH: number,
  svgEl: string,
  font: PDFFont,
): void {
  // Recurse into <g> wrappers
  if (svgEl.trim().startsWith("<g")) {
    const inner = svgEl.replace(/^<g[^>]*>/, "").replace(/<\/g>\s*$/, "");
    // Split child elements naively by top-level tags
    const childMatches = inner.match(/<(?:polygon|line|text|circle|rect)[^>]*(?:\/>|>[\s\S]*?<\/[^>]+>)/g);
    if (childMatches) {
      for (const child of childMatches) {
        renderSvgElement(page, pageH, child, font);
      }
    }
    return;
  }

  if (svgEl.includes("<polygon")) drawPolygon(page, pageH, svgEl);
  else if (svgEl.includes("<line")) drawLine(page, pageH, svgEl);
  else if (svgEl.includes("<text")) drawText(page, pageH, svgEl, font);
  else if (svgEl.includes("<circle")) drawCircle(page, pageH, svgEl);
  else if (svgEl.includes("<rect")) drawRect(page, pageH, svgEl);
}

export async function renderPdf(model: DrawingModel): Promise<Uint8Array> {
  const PT_PER_MM = 2.8346;
  const widthPt = model.page.widthMm * PT_PER_MM;
  const heightPt = model.page.heightMm * PT_PER_MM;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(model.titleBlock.title);
  pdfDoc.setSubject(model.titleBlock.address);

  const page = pdfDoc.addPage([widthPt, heightPt]);

  // Hvid baggrund
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    color: rgb(1, 1, 1),
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Tegn features i z-index rækkefølge
  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  for (const feature of sorted) {
    try {
      renderSvgElement(page, heightPt, feature.svgElement, font);
    } catch {
      // Skip features der ikke kan parses — degraded men ikke blokerende
    }
  }

  // Titelbolk (højre side)
  const titleBlockW = 60 * PT_PER_MM;
  const drawW = widthPt - titleBlockW;
  const tb = model.titleBlock;

  page.drawRectangle({
    x: drawW,
    y: 0,
    width: titleBlockW,
    height: heightPt,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.73, 0.73, 0.73),
    borderWidth: 0.5,
  });

  const tbTextX = drawW + 4;
  const tbLines: Array<{ text: string; size: number; bold?: boolean }> = [
    { text: tb.title, size: 9, bold: true },
    { text: tb.address, size: 7 },
    { text: tb.matrikel, size: 7 },
    { text: "", size: 7 },
    ...tb.sourceList.map((s) => ({ text: s, size: 6 })),
    { text: "", size: 6 },
    ...(tb.bygherre ? [{ text: `Bygherre: ${tb.bygherre}`, size: 6 }] : []),
    ...(tb.sagNr ? [{ text: `Sagsnr.: ${tb.sagNr}`, size: 6 }] : []),
    { text: "", size: 6 },
    { text: `Dato: ${tb.date}`, size: 6 },
    { text: `Mål: ${tb.scale}  Ark: ${tb.paperSize}`, size: 6 },
    { text: `Rev.: ${tb.revision}`, size: 6 },
    ...(tb.disclaimer ? [{ text: tb.disclaimer, size: 6, bold: true }] : []),
  ];

  let tbY = heightPt - 14;
  for (const line of tbLines) {
    if (line.text) {
      page.drawText(line.text, {
        x: tbTextX,
        y: tbY,
        font,
        size: line.size,
        color: rgb(0.13, 0.13, 0.13),
      });
    }
    tbY -= 9;
  }

  return pdfDoc.save();
}
```

- [ ] **Step 4: Kør test — verificer at de består**

```bash
bun test src/lib/drawing/render-pdf.test.ts
```

Forventet: 3/3 PASS.

- [ ] **Step 5: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/lib/drawing/render-pdf.ts src/lib/drawing/render-pdf.test.ts
git commit -m "feat(drawing): PDF-renderer via pdf-lib — vektortegning fra DrawingModel"
```

---

## Task 4: Opdater ExportResult og export-drawing.service.ts

**Files:**
- Modify: `src/services/drawing/export-drawing.service.ts`

Ændringer:
1. Tilføj `svgContent` og `pdfPath` / `pdfUrl` til `ExportResult`
2. Kald `renderPdf(model)` og `store.savePdf()`
3. Generer signed URL til PDF via Supabase (returneres til UI)

**Observation:** `store` i `ExportInput` bruger en udvidet type med `saveExportRecord`. For at holde grænsefladen ren, tilføjes `createSignedUrl` som en metode på storen så tjenesten ikke kender til Supabase direkte.

- [ ] **Step 1: Opdater DrawingExportStorePort i `src/domain/drawing/ports.ts`**

Tilføj `createSignedUrl` til `DrawingExportStorePort`:

```typescript
// Eksisterende felt (behold):
export interface DrawingExportStorePort {
  saveSvg(projectId: string, svg: string): Promise<string>;
  savePdf(projectId: string, pdf: Uint8Array): Promise<string>;
  getExport(exportId: string): Promise<DrawingExportRecord | null>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string | null>; // NY
}
```

- [ ] **Step 2: Implementer `createSignedUrl` i `drawing.repository.ts`**

Tilføj metoden til `DrawingRepository`:

```typescript
async createSignedUrl(path: string, expiresInSeconds: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("project-files")
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
```

- [ ] **Step 3: Opdater ExportResult type og service-logik**

Erstat hele `src/services/drawing/export-drawing.service.ts`:

```typescript
// src/services/drawing/export-drawing.service.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingExportStorePort } from "@/domain/drawing/ports";
import type { DrawingReadinessDecision, DrawingReadinessStatus } from "@/domain/drawing/decision-engine";
import { renderSvg } from "@/lib/drawing/render-svg";
import { renderPdf } from "@/lib/drawing/render-pdf";
import { buildDrawingModel } from "@/lib/drawing/drawing-model-builder";
import { createHash } from "crypto";

type ExportInput = {
  plan: BeliggenhedsplanInput;
  readiness: DrawingReadinessDecision;
  projectId: string;
  store: DrawingExportStorePort & {
    saveExportRecord(params: {
      projectId: string;
      svgPath: string | null;
      pdfPath: string | null;
      readinessStatus: string;
      inputHash: string;
    }): Promise<string>;
  };
};

export type ExportResult = {
  exportId: string;
  svgPath: string;
  svgContent: string;
  pdfPath: string | null;
  pdfUrl: string | null;
  readinessStatus: DrawingReadinessStatus;
  blockedFromPdf: boolean;
};

export async function exportDrawing(input: ExportInput): Promise<ExportResult> {
  const { plan, readiness, projectId, store } = input;

  if (readiness.status === "BLOCKED_MISSING_CORE_DATA") {
    throw new Error("Eksport blokeret: manglende kerndata. Se readiness.missingDataPoints.");
  }

  const model = buildDrawingModel(plan, readiness);
  const svg = renderSvg(model);
  const svgPath = await store.saveSvg(projectId, svg);
  const inputHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
  const blockedFromPdf = readiness.status === "BLOCKED_MISSING_CORE_DATA";

  let pdfPath: string | null = null;
  let pdfUrl: string | null = null;

  if (!blockedFromPdf) {
    try {
      const pdfBytes = await renderPdf(model);
      pdfPath = await store.savePdf(projectId, pdfBytes);
      pdfUrl = await store.createSignedUrl(pdfPath, 3600);
    } catch (err) {
      // PDF-generering fejlede: fortsæt med SVG-only eksport
      console.error("[exportDrawing] PDF-generering fejlede:", err);
    }
  }

  const exportId = await store.saveExportRecord({
    projectId,
    svgPath,
    pdfPath,
    readinessStatus: readiness.status,
    inputHash,
  });

  return { exportId, svgPath, svgContent: svg, pdfPath, pdfUrl, readinessStatus: readiness.status, blockedFromPdf };
}
```

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl (DrawingRepository mangler `createSignedUrl` — det er tilføjet i step 2).

- [ ] **Step 5: Kør eksisterende tests**

```bash
bun test src/services/drawing/
```

Forventet: alle eksisterende tests passer (ingen tests kræver PDF-generering endnu).

- [ ] **Step 6: Commit**

```bash
git add src/domain/drawing/ports.ts src/integrations/supabase/repositories/drawing.repository.ts src/services/drawing/export-drawing.service.ts
git commit -m "feat(drawing): PDF-eksport i exportDrawing service — pdfPath + pdfUrl i ExportResult"
```

---

## Task 5: Opdater server-funktion med footprintGeojson + addressText

**Files:**
- Modify: `src/routes/api.drawing.ts`

Ændringer:
1. Tilføj `footprintGeojson` (optional GeoJSON polygon) til inputschema
2. Tilføj `addressText` (optional string) til metadata
3. Brug `decodeGeoJsonFootprint(data.footprintGeojson)` hvis tilgængeligt; ellers fallback til 10×10m bbox-placeholder

- [ ] **Step 1: Erstat `api.drawing.ts`**

```typescript
// src/routes/api.drawing.ts
// Thin server function adapter for beliggenhedsplan export.
// Business logic lives in application services — this handler only validates,
// authenticates and delegates.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const ExportBeliggenhedsplanInputSchema = z.object({
  projectId: z.string().uuid(),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  addressId: z.string().min(1),
  addressText: z.string().optional().nullable(),
  footprintGeojson: GeoJsonPolygonSchema.optional().nullable(),
});

type ExportInput = z.infer<typeof ExportBeliggenhedsplanInputSchema>;

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const exportBeliggenhedsplanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ExportInput) => ExportBeliggenhedsplanInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { assembleBeliggenhedsplan } = await import(
      "@/services/drawing/assemble-beliggenhedsplan.service"
    );
    const { exportDrawing } = await import("@/services/drawing/export-drawing.service");
    const { GeoDanmarkDrawingLayersAdapter } = await import(
      "@/integrations/geodanmark/drawing-layers"
    );
    const { DrawingRepository } = await import(
      "@/integrations/supabase/repositories/drawing.repository"
    );
    const { decodeGeoJsonFootprint } = await import(
      "@/integrations/import/geojson-footprint-decoder"
    );

    // Brug footprint fra UI hvis tilgængeligt; ellers fallback til 10×10m placeholder.
    // Footprint fra kortediteren er EPSG:25832 (se MatrikelMap.tsx + buildSquareFootprint25832).
    let proposedFootprint25832: GeoJsonPolygon25832;
    if (data.footprintGeojson) {
      proposedFootprint25832 = decodeGeoJsonFootprint(data.footprintGeojson);
    } else {
      proposedFootprint25832 = {
        type: "Polygon",
        crs: "EPSG:25832",
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        ],
      };
    }

    const assembled = await assembleBeliggenhedsplan({
      matrikelId: data.matrikelId,
      kommunekode: data.kommunekode,
      addressId: data.addressId,
      proposedFootprint25832,
      projectId: data.projectId,
      metadata: {
        title: "Beliggenhedsplan",
        address: data.addressText ?? data.addressId,
        matrikel: data.matrikelId,
        bygherre: null,
        sagNr: data.projectId,
        revisions: [],
        bfeNr: null,
        buildingCode: null,
        draughtsman: null,
        responsibleFirm: null,
        areaTable: null,
        date: new Date().toISOString().slice(0, 10),
        scale: 250 as const,
        paperSize: "A3" as const,
      },
      geometrySource: new GeoDanmarkDrawingLayersAdapter(),
      survey: null,
    });

    if (!assembled.plan) throw new Error(assembled.readiness.status);

    return exportDrawing({
      plan: assembled.plan,
      readiness: assembled.readiness,
      projectId: data.projectId,
      store: new DrawingRepository(),
    });
  });

// ---------------------------------------------------------------------------
// Route (required by TanStack Router file-based routing)
// ---------------------------------------------------------------------------

function ApiDrawingRoute() {
  return null;
}

export const Route = createFileRoute("/api/drawing")({
  component: ApiDrawingRoute,
});
```

- [ ] **Step 2: TypeScript check**

```bash
bunx tsc --noEmit
```

Forventet: ingen nye fejl.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.drawing.ts
git commit -m "feat(drawing): footprintGeojson + addressText i exportBeliggenhedsplanFn"
```

---

## Task 6: Implementer fetchRoadName via DAWA

**Files:**
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

Implementerer `fetchRoadName(addressId)` via DAWA REST API `https://api.dataforsyningen.dk/adresser/{id}?format=json`. DAWA er tilladt for display-data jf. CLAUDE.md (vejnavn er ikke compliance-data).

- [ ] **Step 1: Skriv fejltest**

Opret `src/integrations/geodanmark/drawing-layers.road-name.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock global fetch for at undgå rigtige HTTP-kald
const fetchMock = mock();
global.fetch = fetchMock as unknown as typeof fetch;

describe("GeoDanmarkDrawingLayersAdapter.fetchRoadName", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returnerer vejnavn fra DAWA-svar", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "test-id",
        adgangsadresse: {
          vejstykke: { adresseringsnavn: "Hasselvej" },
        },
      }),
    });

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("test-adresse-id");

    expect(result.name).toBe("Hasselvej");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("test-adresse-id"),
    );
  });

  it("returnerer null ved fetch-fejl", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("bad-id");

    expect(result.name).toBeNull();
  });

  it("returnerer null ved 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("unknown-id");

    expect(result.name).toBeNull();
  });
});
```

- [ ] **Step 2: Kør test — verificer fejl**

```bash
bun test src/integrations/geodanmark/drawing-layers.road-name.test.ts
```

Forventet: `fetchRoadName` returnerer `{ name: null }` — dvs. test 1 fejler.

- [ ] **Step 3: Implementer fetchRoadName i drawing-layers.ts**

Erstat `fetchRoadName`-metoden i `GeoDanmarkDrawingLayersAdapter` (find og erstat den eksisterende stub-metode):

```typescript
  async fetchRoadName(addressId: string): Promise<{ name: string | null }> {
    try {
      const url = `https://api.dataforsyningen.dk/adresser/${encodeURIComponent(addressId)}?format=json&noformat=1`;
      const res = await fetch(url);
      if (!res.ok) return { name: null };
      const data = (await res.json()) as Record<string, unknown>;
      // DAWA-struktur: adgangsadresse.vejstykke.adresseringsnavn
      const vejstykke = (data["adgangsadresse"] as Record<string, unknown> | undefined)
        ?.["vejstykke"] as Record<string, unknown> | undefined;
      const name = (vejstykke?.["adresseringsnavn"] as string | undefined) ?? null;
      return { name };
    } catch {
      return { name: null };
    }
  }
```

- [ ] **Step 4: Kør test — verificer pass**

```bash
bun test src/integrations/geodanmark/drawing-layers.road-name.test.ts
```

Forventet: 3/3 PASS.

- [ ] **Step 5: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/integrations/geodanmark/drawing-layers.ts src/integrations/geodanmark/drawing-layers.road-name.test.ts
git commit -m "feat(drawing): fetchRoadName via DAWA REST — vejnavn til beliggenhedsplan-titleblok"
```

---

## Task 7: Beliggenhedsplan UI i projekt/teknik

**Files:**
- Modify: `src/routes/projekt.teknik.tsx`

UI-ansvar (jf. CLAUDE.md Rule 2 — UI er adapter):
- Henter projekt-data via `useProject()`
- Kalder `exportBeliggenhedsplanFn` (serverFn)
- Viser readiness-status med forklaringer
- Viser SVG-preview inline
- Tilbyder SVG- og PDF-download

**Data fra `useProject()`:**
- `address.adresseid` → `addressId`
- `address.adresse` → `addressText`
- `address.kommunekode` → `kommunekode`
- `bbrData.jordstykke_lokal_id` → `matrikelId`
- `currentProjectId` → `projectId`
- `designPlacement.footprintGeojson` → `footprintGeojson` (EPSG:25832 fra korteditor)

- [ ] **Step 1: Erstat `projekt.teknik.tsx`**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useProject } from "@/lib/project-store";
import { exportBeliggenhedsplanFn } from "@/routes/api.drawing";
import type { ExportResult } from "@/services/drawing/export-drawing.service";
import type { DrawingReadinessStatus } from "@/domain/drawing/decision-engine";

// ---------------------------------------------------------------------------
// Readiness-status tekster
// ---------------------------------------------------------------------------

const READINESS_LABELS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "Udkast (mangler data)",
  AUTO_REVIEW: "Klar til myndighedsreview",
  SURVEY_REQUIRED: "Kræver landinspektør",
  BLOCKED_MISSING_CORE_DATA: "Blokeret — kerndata mangler",
};

const READINESS_COLORS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "bg-yellow-50 border-yellow-200 text-yellow-800",
  AUTO_REVIEW: "bg-green-50 border-green-200 text-green-800",
  SURVEY_REQUIRED: "bg-orange-50 border-orange-200 text-orange-800",
  BLOCKED_MISSING_CORE_DATA: "bg-red-50 border-red-200 text-red-800",
};

// ---------------------------------------------------------------------------
// Download-hjælpefunktioner
// ---------------------------------------------------------------------------

function downloadSvg(svgContent: string, filename: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

function TeknikPage() {
  const {
    address,
    bbrData,
    currentProjectId,
    designPlacement,
  } = useProject();

  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backTo = address?.adresseid
    ? `/projekt/${address.adresseid}/cockpit`
    : "/projekt/start";

  // Bestem om vi kan generere
  const matrikelId = bbrData?.jordstykke_lokal_id ?? null;
  const canGenerate =
    !!currentProjectId &&
    !!address?.adresseid &&
    !!address?.kommunekode &&
    !!matrikelId;

  const missingFields: string[] = [];
  if (!currentProjectId) missingFields.push("Projekt ikke gemt");
  if (!address?.adresseid) missingFields.push("Adresse ikke valgt");
  if (!address?.kommunekode) missingFields.push("Kommunekode mangler");
  if (!matrikelId) missingFields.push("Matrikeldata ikke hentet (kør adresseanalyse)");

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await exportBeliggenhedsplanFn({
        data: {
          projectId: currentProjectId!,
          matrikelId: matrikelId!,
          kommunekode: address!.kommunekode,
          addressId: address!.adresseid,
          addressText: address!.adresse ?? null,
          footprintGeojson: (designPlacement?.footprintGeojson as Record<string, unknown> | null | undefined) ?? null,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl ved generering");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to={backTo} className="text-sm text-stone-500 hover:text-stone-700 mb-1 block">
              ← Tilbage til cockpit
            </Link>
            <h1 className="text-2xl font-semibold text-stone-900">Beliggenhedsplan</h1>
            <p className="text-stone-500 text-sm mt-1">
              Myndighedstegning til byggetilladelse — genereret fra matrikeldata og bygningsfodprint
            </p>
          </div>
        </div>

        {/* Manglende forudsætninger */}
        {!canGenerate && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">Mangler data for at generere:</p>
            <ul className="list-disc list-inside space-y-1">
              {missingFields.map((f) => (
                <li key={f} className="text-sm text-amber-700">{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Generer-knap */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="px-5 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium
                       hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? "Genererer…" : "Generer beliggenhedsplan"}
          </button>

          {result && !loading && (
            <span className="text-sm text-green-700 font-medium">Tegning genereret</span>
          )}
        </div>

        {/* Fejl */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Fejl ved generering</p>
            <p className="text-sm text-red-700 mt-1 font-mono">{error}</p>
          </div>
        )}

        {/* Resultat */}
        {result && (
          <div className="space-y-4">

            {/* Readiness-badge */}
            <div className={`rounded-lg border p-4 ${READINESS_COLORS[result.readinessStatus]}`}>
              <p className="text-sm font-semibold">
                Status: {READINESS_LABELS[result.readinessStatus]}
              </p>
            </div>

            {/* Download-knapper */}
            <div className="flex gap-3">
              <button
                onClick={() =>
                  downloadSvg(
                    result.svgContent,
                    `beliggenhedsplan-${result.exportId.slice(0, 8)}.svg`,
                  )
                }
                className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-sm
                           font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                Download SVG
              </button>

              {result.pdfUrl && !result.blockedFromPdf && (
                <a
                  href={result.pdfUrl}
                  download={`beliggenhedsplan-${result.exportId.slice(0, 8)}.pdf`}
                  className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-sm
                             font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Download PDF
                </a>
              )}

              {result.blockedFromPdf && (
                <span className="text-sm text-stone-400 self-center">
                  PDF ikke tilgængelig (blokeret af readiness-status)
                </span>
              )}
            </div>

            {/* SVG-preview */}
            <div className="rounded-xl border border-stone-200 bg-white overflow-auto shadow-sm">
              <div className="p-3 border-b border-stone-100">
                <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Preview — beliggenhedsplan
                </span>
              </div>
              <div
                className="p-4"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: result.svgContent }}
              />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export const Route = createFileRoute("/projekt/teknik")({
  component: TeknikPage,
});
```

- [ ] **Step 2: TypeScript check**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl. Hvis `useProject()` ikke returnerer `bbrData` direkte, brug `useProject(s => s.bbrData)`.

**Vigtigt:** Hvis TypeScript klager over at `bbrData` ikke er del af det der returneres fra `useProject()`, opdater destructuring til:
```tsx
const address = useProject(s => s.address);
const bbrData = useProject(s => s.bbrData);
const currentProjectId = useProject(s => s.currentProjectId);
const designPlacement = useProject(s => s.designPlacement);
```

- [ ] **Step 3: Lint check**

```bash
bunx eslint src/routes/projekt.teknik.tsx
```

Forventet: ingen fejl (evt. `react/no-danger` warning fra eslint-config — det er acceptabelt).

- [ ] **Step 4: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "feat(ui): beliggenhedsplan-side i /projekt/teknik — preview, download SVG/PDF"
```

---

## Task 8: Fuld verifikation

- [ ] **Step 1: Kør alle unit-tests**

```bash
bun test src
```

Forventet: alle tests passer. Ingen regressions.

- [ ] **Step 2: TypeScript**

```bash
bunx tsc --noEmit
```

Forventet: 0 fejl.

- [ ] **Step 3: Lint**

```bash
bunx eslint .
```

Forventet: ingen nye fejl (eksisterende baseline OK).

- [ ] **Step 4: Build**

```bash
bun run build
```

Forventet: build succeederer.

- [ ] **Step 5: Afslutningskontrol**

Verificer alle krav fra spec'en er opfyldt:

| Krav | Verificeret? |
|---|---|
| `drawing_exports`-tabel migration oprettet | [ ] |
| `pdf-lib` installeret | [ ] |
| `render-pdf.ts` eksisterer og unit-tests passer | [ ] |
| `ExportResult` har `svgContent`, `pdfPath`, `pdfUrl` | [ ] |
| `exportDrawing` genererer PDF for non-BLOCKED status | [ ] |
| `api.drawing.ts` accepterer `footprintGeojson` | [ ] |
| `fetchRoadName` returnerer vejnavn fra DAWA | [ ] |
| `/projekt/teknik` viser "Generer"-knap, preview, download-knapper | [ ] |
| Ingen nye `any`-casts eller uchecked boundary-kald | [ ] |
| Ingen nye direkte Supabase-kald uden for repositories | [ ] |

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(drawing): beliggenhedsplan fase 2 komplet — UI, PDF, migration, vejnavn"
```

---

## Kendte begrænsninger (deferred)

- **Footprint CRS**: `designPlacement.footprintGeojson` er EPSG:25832 (fra `buildSquareFootprint25832` i MatrikelMap) — men typen i `project-state.ts` mangler `crs`-feltet. `decodeGeoJsonFootprint` tilføjer `crs: "EPSG:25832"` korrekt.
- **PDF SVG-fidelitet**: `render-pdf.ts` parser SVG-element-strings med regex — komplekse `<g>`-nestinger eller SVG `<path>`-elementer renderes ikke. Tilstrækkelig for v1.
- **Nordpil i PDF**: Nordpil-SVG fra `drawing-symbols.ts` bruger `<path>` — skippes i PDF v1. Kan tilføjes i v2 via `page.drawSvgPath`.
- **DAR vejnavn**: Bruger DAWA REST (tilladt for display-data jf. CLAUDE.md). Kan erstattes med DAR GraphQL i v2.
