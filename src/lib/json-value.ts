import type { Json } from "@/integrations/supabase/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJsonValue(value: unknown): Json | undefined {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "object":
      if (Array.isArray(value)) {
        const items = value
          .map((item) => toJsonValue(item))
          .filter((item): item is Json => item !== undefined);
        return items;
      }

      if (!isPlainObject(value)) return undefined;

      {
        const jsonObject: { [key: string]: Json | undefined } = {};
        for (const [key, entry] of Object.entries(value)) {
          const jsonEntry = toJsonValue(entry);
          if (jsonEntry !== undefined) {
            jsonObject[key] = jsonEntry;
          }
        }
        return jsonObject;
      }
    default:
      return undefined;
  }
}

export function toJsonObject(value: Record<string, unknown> | null | undefined): {
  [key: string]: Json | undefined;
} {
  if (!value) return {};

  const jsonValue = toJsonValue(value);
  return jsonValue && !Array.isArray(jsonValue) && typeof jsonValue === "object" ? jsonValue : {};
}
