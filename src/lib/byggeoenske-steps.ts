// Delt 22-trins datamodel for byggeønsker.
// Bruges af projekt.boligoenske.tsx (wizard) og byggeanalyse Cockpit (accordion).

import type { Byggeoenske } from "@/lib/project-store";

export type Option = { value: string | number | boolean; label: string; hint?: string };

export type Step = {
  key: keyof Byggeoenske;
  title: string;
  subtitle?: string;
  type: "choice" | "number" | "toggle" | "upload";
  options?: Option[];
  min?: number;
  max?: number;
  unit?: string;
  group: "Grundlæggende" | "Areal & rum" | "Stil & arkitektur" | "Bæredygtighed & teknik" | "Budget & inspiration";
};

export const STEPS: Step[] = [
  // Grundlæggende
  {
    key: "byggetype",
    title: "Hvilken type byggeri?",
    type: "choice",
    group: "Grundlæggende",
    options: [
      { value: "nybyg", label: "Nybyg", hint: "Helt nyt hus fra bunden" },
      { value: "tilbyg", label: "Tilbyg", hint: "Udvid eksisterende bolig" },
      { value: "ombyg", label: "Ombyg", hint: "Renovér indvendigt" },
    ],
  },
  { key: "husstandsstoerrelse", title: "Hvor mange skal bo i huset?", type: "number", min: 1, max: 12, unit: "personer", group: "Grundlæggende" },
  { key: "voksne", title: "Hvor mange voksne?", type: "number", min: 1, max: 8, unit: "voksne", group: "Grundlæggende" },
  { key: "boern", title: "Hvor mange børn?", type: "number", min: 0, max: 8, unit: "børn", group: "Grundlæggende" },
  {
    key: "livsfase",
    title: "Hvor er I i livet?",
    type: "choice",
    group: "Grundlæggende",
    options: [
      { value: "ung", label: "Ung familie", hint: "Børn på vej eller små børn" },
      { value: "etableret", label: "Etableret familie", hint: "Børn i skolealderen" },
      { value: "senior", label: "Senior", hint: "Voksne børn flyttet hjemmefra" },
    ],
  },
  // Areal & rum
  { key: "oensketAreal", title: "Boligareal", subtitle: "m²", type: "number", min: 60, max: 500, unit: "m²", group: "Areal & rum" },
  {
    key: "antalEtager",
    title: "Antal etager",
    type: "choice",
    group: "Areal & rum",
    options: [
      { value: 1, label: "1 etage" },
      { value: 1.5, label: "1½ etage" },
      { value: 2, label: "2 etager" },
      { value: 3, label: "3 etager" },
    ],
  },
  { key: "antalSovevaerelser", title: "Soveværelser", type: "number", min: 1, max: 8, unit: "stk.", group: "Areal & rum" },
  { key: "antalBadevaerelser", title: "Badeværelser", type: "number", min: 1, max: 5, unit: "stk.", group: "Areal & rum" },
  { key: "hjemmekontor", title: "Hjemmekontor?", type: "toggle", group: "Areal & rum" },
  // Stil
  {
    key: "arkitektoniskStil",
    title: "Arkitektonisk stil",
    type: "choice",
    group: "Stil & arkitektur",
    options: [
      { value: "moderne", label: "Moderne" },
      { value: "klassisk", label: "Klassisk" },
      { value: "skandinavisk", label: "Skandinavisk" },
      { value: "industriel", label: "Industriel" },
      { value: "minimalistisk", label: "Minimalistisk" },
    ],
  },
  {
    key: "tagform",
    title: "Tagform",
    type: "choice",
    group: "Stil & arkitektur",
    options: [
      { value: "fladt", label: "Fladt tag" },
      { value: "saddeltag", label: "Saddeltag" },
      { value: "valm", label: "Valmtag" },
      { value: "ensidig", label: "Ensidig taghældning" },
    ],
  },
  {
    key: "facademateriale",
    title: "Facademateriale",
    type: "choice",
    group: "Stil & arkitektur",
    options: [
      { value: "tegl", label: "Tegl" },
      { value: "trae", label: "Træ" },
      { value: "puds", label: "Puds" },
      { value: "metal", label: "Metal" },
      { value: "kombineret", label: "Kombineret" },
    ],
  },
  {
    key: "vinduesandel",
    title: "Glasandel",
    type: "choice",
    group: "Stil & arkitektur",
    options: [
      { value: "lille", label: "Mindre vinduer" },
      { value: "mellem", label: "Almindelig" },
      { value: "stor", label: "Store glasflader" },
    ],
  },
  {
    key: "udeomraade",
    title: "Udeområde",
    type: "choice",
    group: "Stil & arkitektur",
    options: [
      { value: "terrasse", label: "Terrasse" },
      { value: "have", label: "Stor have" },
      { value: "altan", label: "Altan" },
      { value: "tagterrasse", label: "Tagterrasse" },
    ],
  },
  // Bæredygtighed
  {
    key: "energiklasse",
    title: "Energistandard",
    type: "choice",
    group: "Bæredygtighed & teknik",
    options: [
      { value: "BR18", label: "BR18 (minimum)" },
      { value: "lavenergi", label: "Lavenergi" },
      { value: "passiv", label: "Passivhus" },
      { value: "plusenergi", label: "Plusenergihus" },
    ],
  },
  {
    key: "varmekilde",
    title: "Varmekilde",
    type: "choice",
    group: "Bæredygtighed & teknik",
    options: [
      { value: "varmepumpe", label: "Varmepumpe" },
      { value: "fjernvarme", label: "Fjernvarme" },
      { value: "jordvarme", label: "Jordvarme" },
      { value: "solvarme", label: "Solvarme" },
    ],
  },
  { key: "solceller", title: "Solceller?", type: "toggle", group: "Bæredygtighed & teknik" },
  {
    key: "ventilation",
    title: "Ventilation",
    type: "choice",
    group: "Bæredygtighed & teknik",
    options: [
      { value: "naturlig", label: "Naturlig" },
      { value: "mekanisk", label: "Mekanisk udsugning" },
      { value: "balanceret", label: "Balanceret m. varmegenvinding" },
    ],
  },
  { key: "ladestander", title: "Ladestander til bil?", type: "toggle", group: "Bæredygtighed & teknik" },
  // Budget & inspiration
  {
    key: "budget",
    title: "Budget",
    type: "choice",
    group: "Budget & inspiration",
    options: [
      { value: "under-3", label: "Under 3 mio. kr." },
      { value: "3-5", label: "3-5 mio. kr." },
      { value: "5-8", label: "5-8 mio. kr." },
      { value: "8-12", label: "8-12 mio. kr." },
      { value: "over-12", label: "Over 12 mio. kr." },
    ],
  },
  {
    key: "inspirationsbilleder",
    title: "Inspirationsbilleder",
    subtitle: "Op til 8 billeder",
    type: "upload",
    group: "Budget & inspiration",
  },
];

export const STEP_GROUPS: Step["group"][] = [
  "Grundlæggende",
  "Areal & rum",
  "Stil & arkitektur",
  "Bæredygtighed & teknik",
  "Budget & inspiration",
];

// Estimat: gennemsnits-byggepris (DKK pr. m²) ved nybyg afhængig af valg.
export function estimerTotalpris(b: Partial<Byggeoenske>): number | null {
  if (!b.oensketAreal) return null;
  let prisPrM2 = 28000; // baseline 2025
  switch (b.energiklasse) {
    case "lavenergi": prisPrM2 += 2500; break;
    case "passiv": prisPrM2 += 5000; break;
    case "plusenergi": prisPrM2 += 7000; break;
  }
  switch (b.facademateriale) {
    case "tegl": prisPrM2 += 1500; break;
    case "trae": prisPrM2 += 800; break;
    case "metal": prisPrM2 += 2000; break;
    case "kombineret": prisPrM2 += 1200; break;
  }
  if (b.solceller) prisPrM2 += 800;
  if (b.varmekilde === "jordvarme") prisPrM2 += 1500;
  if (b.ventilation === "balanceret") prisPrM2 += 700;
  if (b.ladestander) prisPrM2 += 200;
  return Math.round(b.oensketAreal * prisPrM2);
}
