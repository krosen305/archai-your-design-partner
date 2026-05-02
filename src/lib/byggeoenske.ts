// Typer for det strukturerede byggeønskeflow (ARCH-81).
// Byggeoenske produceres af det guidede 22-trins flow og persisteres i
// `projekter`-tabellen i Supabase.

export type Byggeoenske = {
  boligtype: string;
  areal: string;
  etager: string;
  kalder: string;
  tagform: string;
  tagmateriale: string;
  facade: string[];
  stil: string;
  planloesning: string;
  have: string[];
  garage: string;
  sovevaerelser: string;
  badevaerelser: string;
  ekstrarum: string[];
  energi: string;
  opvarmning: string;
  baeredygtighed: string[];
  budget: string;
  tidshorisont: string;
  raadgivning: string[];
  fritekst: string | null;
  billeder: { url: string; beskrivelse: string }[];
};

export type Projekt = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  adresse: string | null;
  adresse_dar_id: string | null;
  byggeoenske: Byggeoenske | null;
  bbr_data: unknown | null;
  dar_data: unknown | null;
  mat_data: unknown | null;
  byggeanalyse_resultat: unknown | null;
};

export type ProjektInsert = {
  adresse?: string | null;
  adresse_dar_id?: string | null;
  byggeoenske?: Byggeoenske | null;
  bbr_data?: unknown | null;
  dar_data?: unknown | null;
  mat_data?: unknown | null;
  byggeanalyse_resultat?: unknown | null;
};
