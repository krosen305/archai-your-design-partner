/**
 * StatusStripe – component test
 *
 * Uses the real Zustand project store (no mock of @/lib/project-store).
 * Imports react-test-setup to initialise happy-dom globals before RTL loads.
 *
 * We use container-based queries instead of screen.* because screen reads
 * document.body at module load time (before our setup runs).
 */
import "../../testing/react-test-setup";
import { describe, it, expect, beforeEach } from "bun:test";
import { getByText, queryByText } from "@testing-library/dom";
import { render } from "@testing-library/react";
import { resetProjectStore } from "../../testing/render-with-project";
import { useProject } from "@/lib/project-store";
import { StatusStripe } from "./StatusStripe";

const noop = () => {};

function renderStripe(
  props?: Partial<{ onOpenDetails: () => void; onRecompute: () => void; isRecomputing: boolean }>,
) {
  // Render AFTER store has been set up (do NOT reset inside render call)
  const { container } = render(
    <StatusStripe
      onOpenDetails={props?.onOpenDetails ?? noop}
      onRecompute={props?.onRecompute ?? noop}
      isRecomputing={props?.isRecomputing ?? false}
    />,
  );
  return container;
}

describe("StatusStripe", () => {
  beforeEach(() => {
    resetProjectStore();
  });

  it("viser hard_stop reason når hard_stop er sat", () => {
    // Set store state BEFORE rendering — resetProjectStore() already called by beforeEach
    useProject.getState().setHardStop(true, "Strandbeskyttelseslinje");

    const container = renderStripe();

    expect(getByText(container, "Strandbeskyttelseslinje")).toBeTruthy();
  });

  it("viser 'Analyserer…' når der ingen flags er og ingen hard_stop", () => {
    // Store reset by beforeEach — no flags, hard_stop=false
    const container = renderStripe();

    expect(getByText(container, "Analyserer…")).toBeTruthy();
  });

  it("skjuler hard_stop reason når hard_stop er false", () => {
    const container = renderStripe();

    expect(queryByText(container, "Strandbeskyttelseslinje")).toBeNull();
  });

  it("viser BEREGNER label mens recomputing kører", () => {
    const container = renderStripe({ isRecomputing: true });

    expect(getByText(container, "BEREGNER")).toBeTruthy();
  });

  it("viser OPDATÉR label som default", () => {
    const container = renderStripe();

    expect(getByText(container, "OPDATÉR")).toBeTruthy();
  });
});
