const ANVENDELSE_KODER: Record<string, string> = {
  "110": "Stuehus til landbrugsejendom",
  "120": "Fritliggende enfamilieshus",
  "121": "Sammenbygget enfamilieshus",
  "122": "Dobbelthus",
  "130": "Raekke-, kaede- eller dobbelthus",
  "140": "Etagebolig",
  "510": "Sommerhus",
  "910": "Garage",
  "920": "Carport",
  "930": "Udhus",
};

const VARMEINSTALLATION_KODER: Record<string, string> = {
  "1": "Fjernvarme/blokvarme",
  "2": "Centralvarme (en fyringsenhed)",
  "3": "Ovn (el, gas, olie mv.)",
  "5": "Varmepumpe",
  "6": "Centralvarme (to fyringsenheder)",
  "7": "Etagecentralvarme",
  "8": "Ingen varmeinstallation",
  "9": "Blandet",
};

const OPVARMNINGSMIDDEL_KODER: Record<string, string> = {
  "1": "El",
  "2": "Gasolin/olie",
  "3": "Gas",
  "4": "Fast braendsel (kul/koks/trae)",
  "6": "Halm",
  "7": "Naturgas",
  "8": "Fjernvarme",
  "9": "Biobraendsel",
  "10": "Solenergi",
  "11": "Andet",
};

const YDERVAEGS_KODER: Record<string, string> = {
  "1": "Mursten/tegl",
  "2": "Letbeton/porebeton",
  "3": "Traebeklaedning",
  "4": "Betonsten",
  "5": "Eternit/fibercement",
  "6": "Plastmateriale",
  "7": "Metal",
  "8": "Glas",
  "10": "Gul mursten",
  "11": "Roed mursten",
  "12": "Puds",
  "80": "Andet",
  "90": "Blandet",
};

const TAGDAEKNING_KODER: Record<string, string> = {
  "1": "Tagsten (tegl/beton)",
  "2": "Eternit/fibercement",
  "3": "Metaltagplader",
  "4": "Bygningsplader",
  "5": "Straatag",
  "6": "Tagpap",
  "7": "Glas",
  "10": "Tagfolie",
  "11": "Groent tag",
  "80": "Andet",
  "90": "Blandet",
};

export function anvendelseLabel(kode: string | null): string | null {
  return kode ? (ANVENDELSE_KODER[kode] ?? `Kode ${kode}`) : null;
}

export function varmeinstallationLabel(kode: string | null): string | null {
  return kode ? (VARMEINSTALLATION_KODER[kode] ?? `Kode ${kode}`) : null;
}

export function opvarmningsmiddelLabel(kode: string | null): string | null {
  return kode ? (OPVARMNINGSMIDDEL_KODER[kode] ?? `Kode ${kode}`) : null;
}

export function ydervaegsMaterialeLabel(kode: string | null): string | null {
  return kode ? (YDERVAEGS_KODER[kode] ?? `Kode ${kode}`) : null;
}

export function tagdaekningLabel(kode: string | null): string | null {
  return kode ? (TAGDAEKNING_KODER[kode] ?? `Kode ${kode}`) : null;
}

const VANDFORSYNING_KODER: Record<string, string> = {
  "1": "Alment vandforsyningsanlæg",
  "2": "Privat fælles vandforsyningsanlæg",
  "3": "Enkeltindvinding (privat boring/brønd)",
  "4": "Ingen vandindvinding",
  "9": "Blandet vandforsyning",
};

const AFLOEBSFORHOLD_KODER: Record<string, string> = {
  "1": "Fælleskloak",
  "2": "Separatkloak",
  "3": "Spildevandsledning (ingen regnvandshåndtering)",
  "4": "Nedsivningsanlæg",
  "5": "Bundfælldningstank med nedsivning",
  "6": "Samletank",
  "7": "Ingen afledning",
  "8": "Drænledning",
  "9": "Blandet afløbsforhold",
};

export function vandforsyningLabel(kode: string | null): string | null {
  return kode ? (VANDFORSYNING_KODER[kode] ?? `Vandforsyning kode ${kode}`) : null;
}

export function afloebsforholdLabel(kode: string | null): string | null {
  return kode ? (AFLOEBSFORHOLD_KODER[kode] ?? `Afløb kode ${kode}`) : null;
}
