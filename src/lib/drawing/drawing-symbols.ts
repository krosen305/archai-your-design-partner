// src/lib/drawing/drawing-symbols.ts

export function northArrowSvg(cx: number, cy: number, size: number): string {
  return `<g transform="translate(${cx},${cy})">
    <polygon points="0,${-size} ${size / 4},0 0,${size / 4}" fill="#222"/>
    <polygon points="0,${-size} ${-size / 4},0 0,${size / 4}" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text y="${size / 2 + 6}" text-anchor="middle" font-size="8" font-family="Arial">N</text>
  </g>`;
}

export function lineDashed(): string {
  return 'stroke-dasharray="4,3"';
}

export function lineDotted(): string {
  return 'stroke-dasharray="1,3"';
}
