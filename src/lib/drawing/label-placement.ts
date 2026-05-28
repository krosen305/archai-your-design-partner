export type PlacedLabel = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LabelPlacementInput = {
  anchorX: number;
  anchorY: number;
  text: string;
  existingLabels: PlacedLabel[];
  charWidthPx?: number;
  fontHeightPx?: number;
  offsetPx?: number;
};

export type LabelPlacementResult = PlacedLabel & {
  requiresManualReview: boolean;
};

const CANDIDATE_OFFSETS: [number, number][] = [
  [1, 1],   // NØ (foretrukket)
  [-1, 1],  // NV
  [1, -1],  // SØ
  [-1, -1], // SV
  [0, 1],   // N
  [1, 0],   // Ø
  [0, -1],  // S
  [-1, 0],  // V
];

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function findLabelPosition(input: LabelPlacementInput): LabelPlacementResult {
  const {
    anchorX,
    anchorY,
    text,
    existingLabels,
    charWidthPx = 5.5,
    fontHeightPx = 8,
    offsetPx = 4,
  } = input;

  const width = text.length * charWidthPx;
  const height = fontHeightPx;

  for (const [dx, dy] of CANDIDATE_OFFSETS) {
    const candidate: PlacedLabel = {
      x: anchorX + dx * offsetPx,
      y: anchorY + dy * offsetPx,
      width,
      height,
    };

    if (!existingLabels.some((existing) => overlaps(candidate, existing))) {
      return { ...candidate, requiresManualReview: false };
    }
  }

  // Fallback: brug NØ uanset overlap, markér til manuel gennemgang
  return {
    x: anchorX + offsetPx,
    y: anchorY + offsetPx,
    width,
    height,
    requiresManualReview: true,
  };
}
