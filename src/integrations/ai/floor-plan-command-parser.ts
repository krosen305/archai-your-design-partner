// src/integrations/ai/floor-plan-command-parser.ts
//
// AI adapter that translates a natural-language instruction into a *candidate*
// FloorPlanCommand or a clarification (spec §7.5, §18.2, FR-AI-001..005).
//
// Boundaries (Rule 1 / Rule for AI): the AI never produces authoritative
// geometry. Its output is validated against FloorPlanCommandSchema; anything
// that fails becomes a clarification rather than a fabricated command. The
// candidate is only applied later through the same deterministic command
// pipeline as a drag — this module never persists.

import { z } from "zod";
import { FloorPlanCommandSchema } from "@/domain/floor-plan/command.schemas";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

// --- Prompt slice (§18.2: selected + nearby context, never the full document) ---

export type CommandParserSlice = {
  levelId: string;
  selected: Array<{ id: string; kind: "wall" | "opening" | "fixture" | "room" }>;
  rooms: Array<{ id: string; name: string; roomType: string }>;
  wallIds: string[];
};

export function buildCommandParserSlice(
  doc: FloorPlanDocument,
  levelId: string,
  selectedElementIds: string[],
): CommandParserSlice {
  const level = doc.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`buildCommandParserSlice: ukendt level "${levelId}"`);

  const kindOf = (id: string): "wall" | "opening" | "fixture" | "room" | null => {
    if (level.walls.some((x) => x.id === id)) return "wall";
    if (level.openings.some((x) => x.id === id)) return "opening";
    if (level.fixtures.some((x) => x.id === id)) return "fixture";
    if (level.rooms.some((x) => x.id === id)) return "room";
    return null;
  };

  const selected = selectedElementIds
    .map((id) => ({ id, kind: kindOf(id) }))
    .filter(
      (s): s is { id: string; kind: "wall" | "opening" | "fixture" | "room" } => s.kind !== null,
    );

  return {
    levelId,
    selected,
    rooms: level.rooms.map((r) => ({ id: r.id, name: r.name, roomType: r.roomType })),
    wallIds: level.walls.map((wall) => wall.id),
  };
}

// --- AI response contract --------------------------------------------------

const AIParseResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), command: FloorPlanCommandSchema }),
  z.object({
    kind: z.literal("clarification"),
    question: z.string(),
    options: z.array(z.string()).default([]),
  }),
]);

export type ParseCommandResult =
  | { kind: "command"; command: FloorPlanCommand }
  | { kind: "clarification"; question: string; options: string[] };

const FALLBACK: ParseCommandResult = {
  kind: "clarification",
  question: "Jeg er ikke sikker på, hvad du mener. Kan du være mere præcis?",
  options: [],
};

/** Validate raw AI output; invalid output degrades to a clarification, never a guess. */
export function interpretAIResponse(raw: unknown): ParseCommandResult {
  const parsed = AIParseResponseSchema.safeParse(raw);
  if (!parsed.success) return FALLBACK;
  if (parsed.data.kind === "command") {
    return { kind: "command", command: parsed.data.command };
  }
  return { kind: "clarification", question: parsed.data.question, options: parsed.data.options };
}

// --- Gateway port + parser -------------------------------------------------

export interface FloorPlanCommandGateway {
  suggest(input: { instruction: string; slice: CommandParserSlice }): Promise<unknown>;
}

// --- Concrete Anthropic adapter (SERVER-SIDE ONLY) -------------------------
// Import lazily via dynamic import in the server function — never bundled into
// the client. This file itself is imported from both client and server, so the
// adapter class lives here but must only be instantiated on the server.

const SYSTEM_PROMPT = `\
Du er en assistent, der oversætter naturligt dansk sprog til præcise plantegnings-redigeringskommandoer.

Du modtager et JSON-objekt med:
- instruction: brugerens naturlige sprogkommando
- slice: aktuel kontekst (valgte elementer, rum, vægge)

Du skal returnere ét JSON-objekt i ét af disse to formater:

Hvis du kan tolke kommandoen entydigt:
{"kind":"command","command":{...}}

Hvis kommandoen er uklar eller kræver mere info:
{"kind":"clarification","question":"Dit spørgsmål her","options":["mulighed 1","mulighed 2"]}

Tilgængelige kommandotyper og deres felter:

move_wall: { type, wallId, deltaM (meter), axis ("x"|"y") }
move_opening: { type, openingId, wallId, offsetM (meter fra væggens start) }
resize_opening: { type, openingId, widthM (meter) }
delete_wall: { type, wallId }
move_fixture: { type, fixtureId, roomId, x, y (LOCAL_METER koordinater) }
split_room: { type, roomId, wallLine: { start: {x,y}, end: {x,y} } }
merge_rooms: { type, roomIds: [id1, id2] }
add_wall: { type, levelId, start: {x,y}, end: {x,y}, thicknessM, wallKind ("exterior"|"interior"|"party") }
add_opening: { type, levelId, wallId, openingKind ("door"|"window"|"sliding_door"|"opening"|"garage_door"), offsetAlongWallM, widthM, heightM, swing ("left"|"right"|"sliding"|"none"|"unknown") }
add_fixture: { type, levelId, roomId, fixtureKind ("toilet"|"sink"|"shower"|"bathtub"|"kitchen_unit"|"technical_cabinet"|"wardrobe"|"appliance"|"ventilation_unit"|"heat_pump_indoor"|"other"), position: {x,y}, rotationDeg }
add_furniture: { type, levelId, roomId, furnitureKind ("single_bed"|"double_bed"|"sofa"|"armchair"|"dining_table"|"chair"|"wardrobe_shelf"), position: {x,y}, rotationDeg, widthM, depthM }

Regler:
- Brug kun ID'er fra slice — opfind aldrig nye ID'er.
- Koordinater er i LOCAL_METER (meter fra lokalt origo).
- Returner KUN JSON — ingen forklarende tekst uden for JSON-blokken.
- Hvis du er i tvivl om et ID, koordinat eller mål, returnér clarification i stedet.`;

export class AnthropicFloorPlanCommandGateway implements FloorPlanCommandGateway {
  async suggest(input: { instruction: string; slice: CommandParserSlice }): Promise<unknown> {
    const { callAnthropicGateway, extractStructuredOutput } = await import("./gateway");
    const { z } = await import("zod");

    const response = await callAnthropicGateway({
      model: "claude-haiku-4-5-20251001",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ instruction: input.instruction, slice: input.slice }),
        },
      ],
      maxTokens: 512,
      operation: "floor_plan_command_parse",
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return extractStructuredOutput(z.unknown(), text);
  }
}

export type ParseFloorPlanCommandInput = {
  document: FloorPlanDocument;
  levelId: string;
  selectedElementIds: string[];
  instruction: string;
};

export async function parseFloorPlanCommand(
  input: ParseFloorPlanCommandInput,
  gateway: FloorPlanCommandGateway,
): Promise<ParseCommandResult> {
  const slice = buildCommandParserSlice(input.document, input.levelId, input.selectedElementIds);
  const raw = await gateway.suggest({ instruction: input.instruction, slice });
  return interpretAIResponse(raw);
}
