import type { Json } from "@/integrations/supabase/types";

export type AnalysisRunRow = {
  id: string;
  run_kind: string;
  project_id: string | null;
  address_id: string | null;
  user_id: string | null;
  source: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Json | null;
};

export type AnalysisRunInsert = {
  id: string;
  run_kind: string;
  project_id?: string | null;
  address_id?: string | null;
  user_id?: string | null;
  source?: string | null;
  metadata?: Json | null;
};

export type AnalysisRunUpdate = {
  status?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
};

export type AnalysisEventRow = {
  id: string;
  run_id: string;
  event_type: string;
  phase: string | null;
  service: string;
  operation: string;
  status: string;
  cache_hit: boolean | null;
  attempt: number | null;
  http_status: number | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Json | null;
  input_summary: string | null;
  output_summary: string | null;
  decision_summary: string | null;
  created_at: string;
};

export type AnalysisEventInsert = {
  run_id: string;
  event_type: string;
  phase?: string | null;
  service: string;
  operation: string;
  status?: string;
  cache_hit?: boolean | null;
  attempt?: number | null;
  http_status?: number | null;
  duration_ms?: number | null;
  error_message?: string | null;
  metadata?: Json | null;
  input_summary?: string | null;
  output_summary?: string | null;
  decision_summary?: string | null;
};

export type TracingDatabase = {
  public: {
    Tables: {
      analysis_runs: {
        Row: AnalysisRunRow;
        Insert: AnalysisRunInsert;
        Update: AnalysisRunUpdate;
        Relationships: [];
      };
      analysis_events: {
        Row: AnalysisEventRow;
        Insert: AnalysisEventInsert;
        Update: Partial<AnalysisEventInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
