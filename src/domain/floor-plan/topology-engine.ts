// src/domain/floor-plan/topology-engine.ts
//
// Deterministic room detection from wall centerlines via planar face
// extraction (spec §23.3.1). Orthogonal-primary v1: walls meeting at shared
// endpoints or T-junctions are supported; nodes lying on a segment interior
// split that segment so the planar graph is well-formed. No JSTS.

import type { Line2D, Point2D, Polygon2D } from "../geometry/geometry-2d.types";
import { pointInPolygon, polygonCentroid, polygonSignedAreaM2 } from "../geometry/polygon-ops";

const TOL = 1e-6;
/** Faces with absolute area below this (m²) are treated as degenerate. */
const MIN_FACE_AREA_M2 = 1e-6;

export type DetectedRoom = {
  boundary: Polygon2D;
  areaM2: number;
  centroid: Point2D;
};

export type ReconciledRoom = DetectedRoom & { id: string };

// --- Planar graph construction --------------------------------------------

type Node = { index: number; point: Point2D };

function nodeKey(p: Point2D): string {
  // Round to ~1e-6 m so coincident endpoints collapse to one node.
  return `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
}

class NodeRegistry {
  private readonly byKey = new Map<string, Node>();
  readonly nodes: Node[] = [];

  intern(p: Point2D): Node {
    const key = nodeKey(p);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const node: Node = { index: this.nodes.length, point: p };
    this.byKey.set(key, node);
    this.nodes.push(node);
    return node;
  }
}

/** Parameter t in [0,1] of the closest point on segment a→b to p, or null if p is off-segment. */
function paramOnSegment(p: Point2D, a: Point2D, b: Point2D): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < TOL * TOL) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < -TOL || t > 1 + TOL) return null;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const dist = Math.hypot(p.x - projX, p.y - projY);
  if (dist > TOL) return null;
  return Math.max(0, Math.min(1, t));
}

type UndirectedEdge = { a: number; b: number };

function buildPlanarGraph(segments: Line2D[]): { nodes: Node[]; edges: UndirectedEdge[] } {
  const registry = new NodeRegistry();
  // Intern every endpoint first so all junction nodes exist before splitting.
  for (const seg of segments) {
    registry.intern(seg.start);
    registry.intern(seg.end);
  }

  const edgeKeys = new Set<string>();
  const edges: UndirectedEdge[] = [];
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ a, b });
  };

  for (const seg of segments) {
    // Collect every node lying on this segment, ordered along it, then connect
    // consecutive nodes (splitting at T-junctions).
    const onSeg: Array<{ t: number; index: number }> = [];
    for (const node of registry.nodes) {
      const t = paramOnSegment(node.point, seg.start, seg.end);
      if (t !== null) onSeg.push({ t, index: node.index });
    }
    onSeg.sort((p, q) => p.t - q.t);
    for (let i = 0; i < onSeg.length - 1; i++) {
      addEdge(onSeg[i]!.index, onSeg[i + 1]!.index);
    }
  }

  return { nodes: registry.nodes, edges };
}

// --- Face extraction (half-edge traversal) --------------------------------

type HalfEdge = { from: number; to: number; angle: number };

function extractFaces(nodes: Node[], edges: UndirectedEdge[]): number[][] {
  const halfEdges: HalfEdge[] = [];
  const angleOf = (from: number, to: number) =>
    Math.atan2(
      nodes[to]!.point.y - nodes[from]!.point.y,
      nodes[to]!.point.x - nodes[from]!.point.x,
    );

  for (const e of edges) {
    halfEdges.push({ from: e.a, to: e.b, angle: angleOf(e.a, e.b) });
    halfEdges.push({ from: e.b, to: e.a, angle: angleOf(e.b, e.a) });
  }

  // Index half-edges and group the outgoing ones per node, sorted CCW by angle.
  const heId = new Map<string, number>();
  halfEdges.forEach((he, id) => heId.set(`${he.from}->${he.to}`, id));
  const outgoing = new Map<number, number[]>();
  halfEdges.forEach((he, id) => {
    const list = outgoing.get(he.from) ?? [];
    list.push(id);
    outgoing.set(he.from, list);
  });
  for (const list of outgoing.values()) {
    list.sort((a, b) => halfEdges[a]!.angle - halfEdges[b]!.angle);
  }

  // next(h): at h's destination, take the clockwise neighbour of h's twin.
  const nextOf = (id: number): number => {
    const he = halfEdges[id]!;
    const twinId = heId.get(`${he.to}->${he.from}`)!;
    const list = outgoing.get(he.to)!;
    const pos = list.indexOf(twinId);
    return list[(pos - 1 + list.length) % list.length]!;
  };

  const visited = new Set<number>();
  const faces: number[][] = [];
  for (let start = 0; start < halfEdges.length; start++) {
    if (visited.has(start)) continue;
    const face: number[] = [];
    let cur = start;
    while (!visited.has(cur)) {
      visited.add(cur);
      face.push(halfEdges[cur]!.from);
      cur = nextOf(cur);
    }
    if (face.length >= 3) faces.push(face);
  }
  return faces;
}

// --- Public API ------------------------------------------------------------

/** Detect closed rooms from wall centerlines. Interior faces only. */
export function detectRooms(wallCenterlines: Line2D[]): DetectedRoom[] {
  const { nodes, edges } = buildPlanarGraph(wallCenterlines);
  if (edges.length === 0) return [];

  const rooms: DetectedRoom[] = [];
  for (const face of extractFaces(nodes, edges)) {
    const boundary: Polygon2D = { vertices: face.map((i) => nodes[i]!.point) };
    const signed = polygonSignedAreaM2(boundary);
    // Interior faces are counter-clockwise (positive); the unbounded outer face
    // is clockwise (negative) and is discarded.
    if (signed <= MIN_FACE_AREA_M2) continue;
    rooms.push({ boundary, areaM2: signed, centroid: polygonCentroid(boundary) });
  }

  // Deterministic ordering by centroid.
  rooms.sort((a, b) => a.centroid.x - b.centroid.x || a.centroid.y - b.centroid.y);
  return rooms;
}

function deterministicRoomId(room: DetectedRoom): string {
  return `room_${room.centroid.x.toFixed(3)}_${room.centroid.y.toFixed(3)}`;
}

/**
 * Assign stable room IDs: a previous room whose centroid still falls inside a
 * detected boundary keeps its ID; otherwise a deterministic geometry-derived ID
 * is minted. Preserves identity across small wall moves (spec §23.1 / FR-TOPO-002).
 */
export function reconcileRoomIdentity(
  previous: Array<{ id: string; centroid: Point2D }>,
  detected: DetectedRoom[],
): ReconciledRoom[] {
  const claimed = new Set<string>();
  return detected.map((room) => {
    const match = previous.find(
      (prev) => !claimed.has(prev.id) && pointInPolygon(prev.centroid, room.boundary),
    );
    if (match) {
      claimed.add(match.id);
      return { ...room, id: match.id };
    }
    return { ...room, id: deterministicRoomId(room) };
  });
}
