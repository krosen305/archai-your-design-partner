export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      address_analysis: {
        Row: {
          address_id: string
          compliance_result: Json | null
          compliance_result_at: string | null
          created_at: string
          id: string
          lokalplan_extracted: Json | null
          lokalplan_extracted_at: string | null
          lokalplan_pdf_url: string | null
          report_generated_at: string | null
          report_text: string | null
          servitut_extracted: Json | null
          servitut_extracted_at: string | null
          updated_at: string
        }
        Insert: {
          address_id: string
          compliance_result?: Json | null
          compliance_result_at?: string | null
          created_at?: string
          id?: string
          lokalplan_extracted?: Json | null
          lokalplan_extracted_at?: string | null
          lokalplan_pdf_url?: string | null
          report_generated_at?: string | null
          report_text?: string | null
          servitut_extracted?: Json | null
          servitut_extracted_at?: string | null
          updated_at?: string
        }
        Update: {
          address_id?: string
          compliance_result?: Json | null
          compliance_result_at?: string | null
          created_at?: string
          id?: string
          lokalplan_extracted?: Json | null
          lokalplan_extracted_at?: string | null
          lokalplan_pdf_url?: string | null
          report_generated_at?: string | null
          report_text?: string | null
          servitut_extracted?: Json | null
          servitut_extracted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_qa_verdicts: {
        Row: {
          blockers: string[] | null
          build_check: string | null
          created_at: string
          duration_ms: number | null
          lint_check: string | null
          session_id: string
          status: string
          tests_check: string | null
          warnings: string[] | null
        }
        Insert: {
          blockers?: string[] | null
          build_check?: string | null
          created_at?: string
          duration_ms?: number | null
          lint_check?: string | null
          session_id: string
          status: string
          tests_check?: string | null
          warnings?: string[] | null
        }
        Update: {
          blockers?: string[] | null
          build_check?: string | null
          created_at?: string
          duration_ms?: number | null
          lint_check?: string | null
          session_id?: string
          status?: string
          tests_check?: string | null
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_qa_verdicts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          completed_at: string | null
          id: string
          metadata: Json | null
          model: string
          started_at: string
          status: string
          trigger_issue: string | null
        }
        Insert: {
          completed_at?: string | null
          id: string
          metadata?: Json | null
          model: string
          started_at?: string
          status?: string
          trigger_issue?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          metadata?: Json | null
          model?: string
          started_at?: string
          status?: string
          trigger_issue?: string | null
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          agent: string
          completed_at: string | null
          created_at: string
          depends_on: string[]
          description: string
          duration_ms: number | null
          failure_details: string | null
          failure_message: string | null
          failure_type: string | null
          files_changed: string[] | null
          id: string
          output_summary: string | null
          retry_count: number
          session_id: string
          started_at: string | null
          status: string
          types_exported: string[] | null
        }
        Insert: {
          agent: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          description: string
          duration_ms?: number | null
          failure_details?: string | null
          failure_message?: string | null
          failure_type?: string | null
          files_changed?: string[] | null
          id: string
          output_summary?: string | null
          retry_count?: number
          session_id: string
          started_at?: string | null
          status?: string
          types_exported?: string[] | null
        }
        Update: {
          agent?: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          description?: string
          duration_ms?: number | null
          failure_details?: string | null
          failure_message?: string | null
          failure_type?: string | null
          files_changed?: string[] | null
          id?: string
          output_summary?: string | null
          retry_count?: number
          session_id?: string
          started_at?: string | null
          status?: string
          types_exported?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_events: {
        Row: {
          attempt: number | null
          cache_hit: boolean | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_type: string
          http_status: number | null
          id: string
          metadata: Json
          operation: string
          phase: string | null
          run_id: string
          service: string
          status: string
        }
        Insert: {
          attempt?: number | null
          cache_hit?: boolean | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          metadata?: Json
          operation: string
          phase?: string | null
          run_id: string
          service: string
          status?: string
        }
        Update: {
          attempt?: number | null
          cache_hit?: boolean | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          metadata?: Json
          operation?: string
          phase?: string | null
          run_id?: string
          service?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_run_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          address_id: string | null
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json
          project_id: string | null
          run_kind: string
          source: string
          started_at: string
          status: string
          user_id: string | null
        }
        Insert: {
          address_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          run_kind: string
          source?: string
          started_at?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          address_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          run_kind?: string
          source?: string
          started_at?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      building_tasks: {
        Row: {
          blocked_by_constraint: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_auto_generated: boolean
          metadata: Json
          phase: string
          priority: number
          project_id: string
          status: string
          task_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          blocked_by_constraint?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_auto_generated?: boolean
          metadata?: Json
          phase: string
          priority?: number
          project_id: string
          status?: string
          task_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          blocked_by_constraint?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_auto_generated?: boolean
          metadata?: Json
          phase?: string
          priority?: number
          project_id?: string
          status?: string
          task_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      design_iterations: {
        Row: {
          area_m2: number | null
          budget_estimate: number | null
          byggeoenske: Json | null
          compliance_snapshot: Json | null
          created_at: string
          description: string | null
          floors: number | null
          hus_dna: Json | null
          id: string
          inspirations: Json
          is_active: boolean
          label: string | null
          placement_centroid_lat: number | null
          placement_centroid_lng: number | null
          placement_floors: number | null
          placement_footprint_area_m2: number | null
          placement_footprint_geojson: Json | null
          placement_height_m: number | null
          placement_min_distance_to_boundary_m: number | null
          placement_outside_parcel_area_m2: number
          placement_rotation_deg: number | null
          placement_source: string | null
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          area_m2?: number | null
          budget_estimate?: number | null
          byggeoenske?: Json | null
          compliance_snapshot?: Json | null
          created_at?: string
          description?: string | null
          floors?: number | null
          hus_dna?: Json | null
          id?: string
          inspirations?: Json
          is_active?: boolean
          label?: string | null
          placement_centroid_lat?: number | null
          placement_centroid_lng?: number | null
          placement_floors?: number | null
          placement_footprint_area_m2?: number | null
          placement_footprint_geojson?: Json | null
          placement_height_m?: number | null
          placement_min_distance_to_boundary_m?: number | null
          placement_outside_parcel_area_m2?: number
          placement_rotation_deg?: number | null
          placement_source?: string | null
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          area_m2?: number | null
          budget_estimate?: number | null
          byggeoenske?: Json | null
          compliance_snapshot?: Json | null
          created_at?: string
          description?: string | null
          floors?: number | null
          hus_dna?: Json | null
          id?: string
          inspirations?: Json
          is_active?: boolean
          label?: string | null
          placement_centroid_lat?: number | null
          placement_centroid_lng?: number | null
          placement_floors?: number | null
          placement_footprint_area_m2?: number | null
          placement_footprint_geojson?: Json | null
          placement_height_m?: number | null
          placement_min_distance_to_boundary_m?: number | null
          placement_outside_parcel_area_m2?: number
          placement_rotation_deg?: number | null
          placement_source?: string | null
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_iterations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          address_adresseid: string | null
          address_bbr: string | null
          address_ejerlavskode: number | null
          address_full: string | null
          address_kommune: string | null
          address_koordinater: Json | null
          address_matrikel: string | null
          address_matrikelnummer: string | null
          address_postnr: string | null
          address_postnrnavn: string | null
          adresse_dar_id: string | null
          area: string | null
          bebygget_areal_m2: number | null
          bfe_nr: string | null
          billedanalyse: Json | null
          brief_data: Json | null
          brief_done: boolean
          budget: string | null
          budget_estimate: number | null
          compliance_data: Json | null
          compliance_done: boolean
          created_at: string
          current_step: string
          description: string | null
          floors: string | null
          grundareal_m2: number | null
          hard_stop: boolean | null
          hard_stop_reason: string | null
          heritage_save_value: number | null
          hus_dna: Json | null
          id: string
          inspirations: Json | null
          is_fredet: boolean | null
          name: string | null
          project_data_status: Json | null
          timeline: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_adresseid?: string | null
          address_bbr?: string | null
          address_ejerlavskode?: number | null
          address_full?: string | null
          address_kommune?: string | null
          address_koordinater?: Json | null
          address_matrikel?: string | null
          address_matrikelnummer?: string | null
          address_postnr?: string | null
          address_postnrnavn?: string | null
          adresse_dar_id?: string | null
          area?: string | null
          bebygget_areal_m2?: number | null
          bfe_nr?: string | null
          billedanalyse?: Json | null
          brief_data?: Json | null
          brief_done?: boolean
          budget?: string | null
          budget_estimate?: number | null
          compliance_data?: Json | null
          compliance_done?: boolean
          created_at?: string
          current_step?: string
          description?: string | null
          floors?: string | null
          grundareal_m2?: number | null
          hard_stop?: boolean | null
          hard_stop_reason?: string | null
          heritage_save_value?: number | null
          hus_dna?: Json | null
          id?: string
          inspirations?: Json | null
          is_fredet?: boolean | null
          name?: string | null
          project_data_status?: Json | null
          timeline?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_adresseid?: string | null
          address_bbr?: string | null
          address_ejerlavskode?: number | null
          address_full?: string | null
          address_kommune?: string | null
          address_koordinater?: Json | null
          address_matrikel?: string | null
          address_matrikelnummer?: string | null
          address_postnr?: string | null
          address_postnrnavn?: string | null
          adresse_dar_id?: string | null
          area?: string | null
          bebygget_areal_m2?: number | null
          bfe_nr?: string | null
          billedanalyse?: Json | null
          brief_data?: Json | null
          brief_done?: boolean
          budget?: string | null
          budget_estimate?: number | null
          compliance_data?: Json | null
          compliance_done?: boolean
          created_at?: string
          current_step?: string
          description?: string | null
          floors?: string | null
          grundareal_m2?: number | null
          hard_stop?: boolean | null
          hard_stop_reason?: string | null
          heritage_save_value?: number | null
          hus_dna?: Json | null
          id?: string
          inspirations?: Json | null
          is_fredet?: boolean | null
          name?: string | null
          project_data_status?: Json | null
          timeline?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_constraints: {
        Row: {
          address_id: string
          confidence: string
          extracted_at: string
          fredskov: boolean
          id: string
          is_fredet: boolean | null
          klitfredning: boolean
          max_bebyggelsesprocent: number | null
          max_etager: number | null
          max_height_m: number | null
          min_distance_to_boundary_m: number | null
          save_value: number | null
          soil_contamination_status: string | null
          source_kommuneplan_id: string | null
          source_lokalplan_id: string | null
          strandbeskyttelse: boolean
          updated_at: string
        }
        Insert: {
          address_id: string
          confidence?: string
          extracted_at?: string
          fredskov?: boolean
          id?: string
          is_fredet?: boolean | null
          klitfredning?: boolean
          max_bebyggelsesprocent?: number | null
          max_etager?: number | null
          max_height_m?: number | null
          min_distance_to_boundary_m?: number | null
          save_value?: number | null
          soil_contamination_status?: string | null
          source_kommuneplan_id?: string | null
          source_lokalplan_id?: string | null
          strandbeskyttelse?: boolean
          updated_at?: string
        }
        Update: {
          address_id?: string
          confidence?: string
          extracted_at?: string
          fredskov?: boolean
          id?: string
          is_fredet?: boolean | null
          klitfredning?: boolean
          max_bebyggelsesprocent?: number | null
          max_etager?: number | null
          max_height_m?: number | null
          min_distance_to_boundary_m?: number | null
          save_value?: number | null
          soil_contamination_status?: string | null
          source_kommuneplan_id?: string | null
          source_lokalplan_id?: string | null
          strandbeskyttelse?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_constraints_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: true
            referencedRelation: "address_analysis"
            referencedColumns: ["address_id"]
          },
        ]
      }
    }
    Views: {
      analysis_event_errors: {
        Row: {
          address_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          event_type: string | null
          http_status: number | null
          metadata: Json | null
          operation: string | null
          phase: string | null
          project_id: string | null
          run_id: string | null
          run_kind: string | null
          service: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_run_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_run_summaries: {
        Row: {
          address_id: string | null
          api_call_count: number | null
          api_calls_by_service: Json | null
          cache_hit_count: number | null
          cache_read_count: number | null
          completed_at: string | null
          db_write_count: number | null
          duration_ms: number | null
          error_count: number | null
          error_message: string | null
          event_count: number | null
          id: string | null
          project_id: string | null
          run_kind: string | null
          source: string | null
          started_at: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
