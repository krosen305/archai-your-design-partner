export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      analysis_events: {
        Row: {
          attempt: number | null;
          cache_hit: boolean | null;
          created_at: string;
          decision_summary: string | null;
          duration_ms: number | null;
          error_message: string | null;
          event_type: string;
          http_status: number | null;
          id: string;
          input_summary: string | null;
          metadata: Json | null;
          operation: string;
          output_summary: string | null;
          phase: string | null;
          run_id: string;
          service: string;
          status: string;
        };
        Insert: {
          attempt?: number | null;
          cache_hit?: boolean | null;
          created_at?: string;
          decision_summary?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          event_type: string;
          http_status?: number | null;
          id?: string;
          input_summary?: string | null;
          metadata?: Json | null;
          operation: string;
          output_summary?: string | null;
          phase?: string | null;
          run_id: string;
          service: string;
          status?: string;
        };
        Update: {
          attempt?: number | null;
          cache_hit?: boolean | null;
          created_at?: string;
          decision_summary?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          event_type?: string;
          http_status?: number | null;
          id?: string;
          input_summary?: string | null;
          metadata?: Json | null;
          operation?: string;
          output_summary?: string | null;
          phase?: string | null;
          run_id?: string;
          service?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "analysis_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      analysis_runs: {
        Row: {
          address_id: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          metadata: Json | null;
          project_id: string | null;
          run_kind: string;
          source: string | null;
          started_at: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          address_id?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          metadata?: Json | null;
          project_id?: string | null;
          run_kind: string;
          source?: string | null;
          started_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          address_id?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          metadata?: Json | null;
          project_id?: string | null;
          run_kind?: string;
          source?: string | null;
          started_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      address_source_results: {
        Row: {
          id: string;
          address_id: string;
          source_kind: string;
          status: string;
          confidence: string;
          is_mock: boolean;
          fetched_at: string;
          source_url: string | null;
          raw_feature_count: number | null;
          payload: Json | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          address_id: string;
          source_kind: string;
          status: string;
          confidence: string;
          is_mock?: boolean;
          fetched_at?: string;
          source_url?: string | null;
          raw_feature_count?: number | null;
          payload?: Json | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          address_id?: string;
          source_kind?: string;
          status?: string;
          confidence?: string;
          is_mock?: boolean;
          fetched_at?: string;
          source_url?: string | null;
          raw_feature_count?: number | null;
          payload?: Json | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      address_analysis: {
        Row: {
          address_id: string;
          compliance_result: Json | null;
          compliance_result_at: string | null;
          created_at: string;
          id: string;
          jordstykke_polygon: Json | null;
          jordstykke_polygon_at: string | null;
          lokalplan_extracted: Json | null;
          lokalplan_extracted_at: string | null;
          lokalplan_pdf_url: string | null;
          report_generated_at: string | null;
          report_text: string | null;
          servitut_extracted: Json | null;
          servitut_extracted_at: string | null;
          updated_at: string;
        };
        Insert: {
          address_id: string;
          compliance_result?: Json | null;
          compliance_result_at?: string | null;
          created_at?: string;
          id?: string;
          jordstykke_polygon?: Json | null;
          jordstykke_polygon_at?: string | null;
          lokalplan_extracted?: Json | null;
          lokalplan_extracted_at?: string | null;
          lokalplan_pdf_url?: string | null;
          report_generated_at?: string | null;
          report_text?: string | null;
          servitut_extracted?: Json | null;
          servitut_extracted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          address_id?: string;
          compliance_result?: Json | null;
          compliance_result_at?: string | null;
          created_at?: string;
          id?: string;
          jordstykke_polygon?: Json | null;
          jordstykke_polygon_at?: string | null;
          lokalplan_extracted?: Json | null;
          lokalplan_extracted_at?: string | null;
          lokalplan_pdf_url?: string | null;
          report_generated_at?: string | null;
          report_text?: string | null;
          servitut_extracted?: Json | null;
          servitut_extracted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      building_tasks: {
        Row: {
          blocked_by_constraint: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          is_auto_generated: boolean;
          metadata: Json;
          phase: string;
          priority: number;
          project_id: string;
          status: string;
          task_key: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          blocked_by_constraint?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          is_auto_generated?: boolean;
          metadata?: Json;
          phase: string;
          priority?: number;
          project_id: string;
          status?: string;
          task_key?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          blocked_by_constraint?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          is_auto_generated?: boolean;
          metadata?: Json;
          phase?: string;
          priority?: number;
          project_id?: string;
          status?: string;
          task_key?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      design_iterations: {
        Row: {
          area_m2: number | null;
          budget_estimate: number | null;
          byggeoenske: Json | null;
          compliance_snapshot: Json | null;
          created_at: string;
          description: string | null;
          floors: number | null;
          hus_dna: Json | null;
          id: string;
          inspirations: Json;
          is_active: boolean;
          label: string | null;
          placement_centroid_lat: number | null;
          placement_centroid_lng: number | null;
          placement_floors: number | null;
          placement_footprint_area_m2: number | null;
          placement_footprint_geojson: Json | null;
          placement_height_m: number | null;
          placement_min_distance_to_boundary_m: number | null;
          placement_outside_parcel_area_m2: number | null;
          placement_rotation_deg: number | null;
          placement_source: string | null;
          project_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          area_m2?: number | null;
          budget_estimate?: number | null;
          byggeoenske?: Json | null;
          compliance_snapshot?: Json | null;
          created_at?: string;
          description?: string | null;
          floors?: number | null;
          hus_dna?: Json | null;
          id?: string;
          inspirations?: Json;
          is_active?: boolean;
          label?: string | null;
          placement_centroid_lat?: number | null;
          placement_centroid_lng?: number | null;
          placement_floors?: number | null;
          placement_footprint_area_m2?: number | null;
          placement_footprint_geojson?: Json | null;
          placement_height_m?: number | null;
          placement_min_distance_to_boundary_m?: number | null;
          placement_outside_parcel_area_m2?: number | null;
          placement_rotation_deg?: number | null;
          placement_source?: string | null;
          project_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          area_m2?: number | null;
          budget_estimate?: number | null;
          byggeoenske?: Json | null;
          compliance_snapshot?: Json | null;
          created_at?: string;
          description?: string | null;
          floors?: number | null;
          hus_dna?: Json | null;
          id?: string;
          inspirations?: Json;
          is_active?: boolean;
          label?: string | null;
          placement_centroid_lat?: number | null;
          placement_centroid_lng?: number | null;
          placement_floors?: number | null;
          placement_footprint_area_m2?: number | null;
          placement_footprint_geojson?: Json | null;
          placement_height_m?: number | null;
          placement_min_distance_to_boundary_m?: number | null;
          placement_outside_parcel_area_m2?: number | null;
          placement_rotation_deg?: number | null;
          placement_source?: string | null;
          project_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "design_iterations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          address_adresseid: string | null;
          address_bbr: string | null;
          address_ejerlavskode: number | null;
          address_full: string | null;
          address_kommune: string | null;
          address_koordinater: Json | null;
          address_matrikel: string | null;
          address_matrikelnummer: string | null;
          address_postnr: string | null;
          address_postnrnavn: string | null;
          adresse_dar_id: string | null;
          area: string | null;
          bebygget_areal_m2: number | null;
          bfe_nr: string | null;
          billedanalyse: Json | null;
          brief_data: Json | null;
          brief_done: boolean;
          budget: string | null;
          budget_estimate: number | null;
          compliance_data: Json | null;
          compliance_done: boolean;
          created_at: string;
          current_step: string;
          description: string | null;
          floors: string | null;
          grundareal_m2: number | null;
          hard_stop: boolean | null;
          hard_stop_reason: string | null;
          heritage_save_value: number | null;
          hus_dna: Json | null;
          id: string;
          inspirations: Json | null;
          is_fredet: boolean | null;
          name: string | null;
          project_data_status: Json | null;
          timeline: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_adresseid?: string | null;
          address_bbr?: string | null;
          address_ejerlavskode?: number | null;
          address_full?: string | null;
          address_kommune?: string | null;
          address_koordinater?: Json | null;
          address_matrikel?: string | null;
          address_matrikelnummer?: string | null;
          address_postnr?: string | null;
          address_postnrnavn?: string | null;
          adresse_dar_id?: string | null;
          area?: string | null;
          bebygget_areal_m2?: number | null;
          bfe_nr?: string | null;
          billedanalyse?: Json | null;
          brief_data?: Json | null;
          brief_done?: boolean;
          budget?: string | null;
          budget_estimate?: number | null;
          compliance_data?: Json | null;
          compliance_done?: boolean;
          created_at?: string;
          current_step?: string;
          description?: string | null;
          floors?: string | null;
          grundareal_m2?: number | null;
          hard_stop?: boolean | null;
          hard_stop_reason?: string | null;
          heritage_save_value?: number | null;
          hus_dna?: Json | null;
          id?: string;
          inspirations?: Json | null;
          is_fredet?: boolean | null;
          name?: string | null;
          project_data_status?: Json | null;
          timeline?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_adresseid?: string | null;
          address_bbr?: string | null;
          address_ejerlavskode?: number | null;
          address_full?: string | null;
          address_kommune?: string | null;
          address_koordinater?: Json | null;
          address_matrikel?: string | null;
          address_matrikelnummer?: string | null;
          address_postnr?: string | null;
          address_postnrnavn?: string | null;
          adresse_dar_id?: string | null;
          area?: string | null;
          bebygget_areal_m2?: number | null;
          bfe_nr?: string | null;
          billedanalyse?: Json | null;
          brief_data?: Json | null;
          brief_done?: boolean;
          budget?: string | null;
          budget_estimate?: number | null;
          compliance_data?: Json | null;
          compliance_done?: boolean;
          created_at?: string;
          current_step?: string;
          description?: string | null;
          floors?: string | null;
          grundareal_m2?: number | null;
          hard_stop?: boolean | null;
          hard_stop_reason?: string | null;
          heritage_save_value?: number | null;
          hus_dna?: Json | null;
          id?: string;
          inspirations?: Json | null;
          is_fredet?: boolean | null;
          name?: string | null;
          project_data_status?: Json | null;
          timeline?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      site_constraints: {
        Row: {
          address_id: string;
          bnbo: boolean | null;
          bluespot_risk: boolean | null;
          building_field_source_id: string | null;
          confidence: string;
          extracted_at: string;
          fredskov: boolean;
          future_zone_type: string | null;
          geoteknik_jordart: string | null;
          grundvand_depth_summer_m: number | null;
          grundvand_depth_winter_m: number | null;
          grundvand_model_uncertainty_m: number | null;
          id: string;
          is_fredet: boolean | null;
          jordforurening_lokalitet_id: string | null;
          jordforurening_nuancering: string | null;
          jordforurening_olietank: boolean | null;
          jordforurening_v1: boolean | null;
          jordforurening_v2: boolean | null;
          klitfredning: boolean;
          landzone_permit_required: boolean | null;
          lokalplan_byggefelt_present: boolean | null;
          max_bebyggelsesprocent: number | null;
          max_etager: number | null;
          max_height_m: number | null;
          min_distance_to_boundary_m: number | null;
          natura2000: boolean | null;
          omraadeklassificering: string | null;
          osd: boolean | null;
          paragraph3_nature: boolean | null;
          protected_dige: boolean | null;
          raw_material_area: boolean | null;
          save_value: number | null;
          sewer_area_type: string | null;
          soil_contamination_status: string | null;
          source_kommuneplan_id: string | null;
          source_lokalplan_id: string | null;
          strandbeskyttelse: boolean;
          terrain_low_point_m: number | null;
          terrain_slope_pct: number | null;
          updated_at: string;
          wastewater_plan_status: string | null;
          within_building_field: boolean | null;
          zone_type: string | null;
          fortidsminde: boolean | null;
          fortidsminde_buffer: boolean | null;
        };
        Insert: {
          address_id: string;
          bnbo?: boolean | null;
          bluespot_risk?: boolean | null;
          building_field_source_id?: string | null;
          confidence?: string;
          extracted_at?: string;
          fredskov?: boolean;
          future_zone_type?: string | null;
          geoteknik_jordart?: string | null;
          grundvand_depth_summer_m?: number | null;
          grundvand_depth_winter_m?: number | null;
          grundvand_model_uncertainty_m?: number | null;
          id?: string;
          is_fredet?: boolean | null;
          jordforurening_lokalitet_id?: string | null;
          jordforurening_nuancering?: string | null;
          jordforurening_olietank?: boolean | null;
          jordforurening_v1?: boolean | null;
          jordforurening_v2?: boolean | null;
          klitfredning?: boolean;
          landzone_permit_required?: boolean | null;
          lokalplan_byggefelt_present?: boolean | null;
          max_bebyggelsesprocent?: number | null;
          max_etager?: number | null;
          max_height_m?: number | null;
          min_distance_to_boundary_m?: number | null;
          natura2000?: boolean | null;
          omraadeklassificering?: string | null;
          osd?: boolean | null;
          paragraph3_nature?: boolean | null;
          protected_dige?: boolean | null;
          raw_material_area?: boolean | null;
          save_value?: number | null;
          sewer_area_type?: string | null;
          soil_contamination_status?: string | null;
          source_kommuneplan_id?: string | null;
          source_lokalplan_id?: string | null;
          strandbeskyttelse?: boolean;
          terrain_low_point_m?: number | null;
          terrain_slope_pct?: number | null;
          updated_at?: string;
          wastewater_plan_status?: string | null;
          within_building_field?: boolean | null;
          zone_type?: string | null;
          fortidsminde?: boolean | null;
          fortidsminde_buffer?: boolean | null;
        };
        Update: {
          address_id?: string;
          bnbo?: boolean | null;
          bluespot_risk?: boolean | null;
          building_field_source_id?: string | null;
          confidence?: string;
          extracted_at?: string;
          fredskov?: boolean;
          future_zone_type?: string | null;
          geoteknik_jordart?: string | null;
          grundvand_depth_summer_m?: number | null;
          grundvand_depth_winter_m?: number | null;
          grundvand_model_uncertainty_m?: number | null;
          id?: string;
          is_fredet?: boolean | null;
          jordforurening_lokalitet_id?: string | null;
          jordforurening_nuancering?: string | null;
          jordforurening_olietank?: boolean | null;
          jordforurening_v1?: boolean | null;
          jordforurening_v2?: boolean | null;
          klitfredning?: boolean;
          landzone_permit_required?: boolean | null;
          lokalplan_byggefelt_present?: boolean | null;
          max_bebyggelsesprocent?: number | null;
          max_etager?: number | null;
          max_height_m?: number | null;
          min_distance_to_boundary_m?: number | null;
          natura2000?: boolean | null;
          omraadeklassificering?: string | null;
          osd?: boolean | null;
          paragraph3_nature?: boolean | null;
          protected_dige?: boolean | null;
          raw_material_area?: boolean | null;
          save_value?: number | null;
          sewer_area_type?: string | null;
          soil_contamination_status?: string | null;
          source_kommuneplan_id?: string | null;
          source_lokalplan_id?: string | null;
          strandbeskyttelse?: boolean;
          terrain_low_point_m?: number | null;
          terrain_slope_pct?: number | null;
          updated_at?: string;
          wastewater_plan_status?: string | null;
          within_building_field?: boolean | null;
          zone_type?: string | null;
          fortidsminde?: boolean | null;
          fortidsminde_buffer?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "site_constraints_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: true;
            referencedRelation: "address_analysis";
            referencedColumns: ["address_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
