import { bbrCodeLabel } from "./code-registry";

export function anvendelseLabel(kode: string | null): string | null {
  return bbrCodeLabel("BygAnvendelse", kode);
}

export function varmeinstallationLabel(kode: string | null): string | null {
  return bbrCodeLabel("Varmeinstallation", kode);
}

export function opvarmningsmiddelLabel(kode: string | null): string | null {
  return bbrCodeLabel("Opvarmningsmiddel", kode);
}

export function ydervaegsMaterialeLabel(kode: string | null): string | null {
  return bbrCodeLabel("YdervaeggenesMateriale", kode);
}

export function tagdaekningLabel(kode: string | null): string | null {
  return bbrCodeLabel("Tagdaekningsmateriale", kode);
}

export function vandforsyningLabel(kode: string | null): string | null {
  return bbrCodeLabel("BygVandforsyning", kode);
}

export function afloebsforholdLabel(kode: string | null): string | null {
  return bbrCodeLabel("BygAfloebsforhold", kode);
}
