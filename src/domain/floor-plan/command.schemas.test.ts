import { describe, expect, test } from "bun:test";
import { FloorPlanCommandSchema, CommandResultSchema } from "./command.schemas";

describe("FloorPlanCommandSchema", () => {
  test("accepts move_wall", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "move_wall",
        wallId: "wall_1",
        deltaM: 1.2,
        axis: "x",
      }).success,
    ).toBe(true);
  });

  test("rejects move_wall with invalid axis", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "move_wall",
        wallId: "wall_1",
        deltaM: 1.2,
        axis: "z",
      }).success,
    ).toBe(false);
  });

  test("accepts move_opening", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "move_opening",
        openingId: "op_1",
        wallId: "wall_1",
        offsetM: 0.8,
      }).success,
    ).toBe(true);
  });

  test("rejects resize_opening with non-positive width", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "resize_opening",
        openingId: "op_1",
        widthM: 0,
      }).success,
    ).toBe(false);
  });

  test("accepts move_fixture", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "move_fixture",
        fixtureId: "fx_1",
        roomId: "room_1",
        x: 7.4,
        y: 3.1,
      }).success,
    ).toBe(true);
  });

  test("accepts merge_rooms with two rooms", () => {
    expect(
      FloorPlanCommandSchema.safeParse({
        type: "merge_rooms",
        roomIds: ["room_1", "room_2"],
      }).success,
    ).toBe(true);
  });

  test("rejects merge_rooms with a single room", () => {
    expect(
      FloorPlanCommandSchema.safeParse({ type: "merge_rooms", roomIds: ["room_1"] }).success,
    ).toBe(false);
  });

  test("rejects an unknown command type", () => {
    expect(FloorPlanCommandSchema.safeParse({ type: "teleport_wall" }).success).toBe(false);
  });
});

describe("CommandResultSchema", () => {
  test("accepts an accepted result", () => {
    expect(
      CommandResultSchema.safeParse({
        accepted: true,
        changedElementIds: ["wall_1", "room_1"],
        liveFindings: [{ severity: "warning", category: "room_program", message: "for lille" }],
      }).success,
    ).toBe(true);
  });

  test("accepts a rejected result", () => {
    expect(
      CommandResultSchema.safeParse({
        accepted: false,
        reasonCode: "OPENING_OUTSIDE_PARENT_WALL",
        message: "Vinduet kan ikke placeres her.",
        suggestedCommands: [],
      }).success,
    ).toBe(true);
  });

  test("rejects a rejected result missing reasonCode", () => {
    expect(
      CommandResultSchema.safeParse({
        accepted: false,
        message: "noget gik galt",
        suggestedCommands: [],
      }).success,
    ).toBe(false);
  });
});
