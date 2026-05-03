// Typer for `projekter`-tabellen (ARCH-81).
// Byggeoenske-typen defineres i project-store — her kun DB-wrapper typer.

import type { Byggeoenske } from "@/lib/project-store";
export type { Byggeoenske };

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
  byggeoenske?: Partial<Byggeoenske> | null;
  bbr_data?: unknown | null;
  dar_data?: unknown | null;
  mat_data?: unknown | null;
  byggeanalyse_resultat?: unknown | null;
};
