// src/domain/floor-plan/canonical-hash.ts
//
// Canonical serialization + hashing for reproducible model_hash / inputHash
// (spec §23.3.3). Pure deterministic canonicalization; SHA-256 via the global
// Web Crypto API (portable across Cloudflare Workers and Bun).

/** Round to 3 decimals (1 mm) and normalize -0 to 0. */
function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`canonical-hash: non-finite number ${value}`);
  }
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "number") return canonicalNumber(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic JSON string: keys sorted lexicographically, numbers rounded to
 * 3 decimals, array order preserved.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 (hex) of the canonical serialization of `value`. */
export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}
