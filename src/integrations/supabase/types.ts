export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
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
      address_source_results: {
        Row: {
          address_id: string;
          confidence: string;
          created_at: string;
          expires_at: string;
          fetched_at: string;
          id: string;
          is_mock: boolean;
          payload: Json | null;
          raw_feature_count: number | null;
          source_kind: string;
          source_url: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          address_id: string;
          confidence: string;
          created_at?: string;
          expires_at: string;
          fetched_at?: string;
          id?: string;
          is_mock?: boolean;
          payload?: Json | null;
          raw_feature_count?: number | null;
          source_kind: string;
          source_url?: string | null;
          status: string;
          updated_at?: string;
        };
        Update: {
          address_id?: string;
          confidence?: string;
          created_at?: string;
          expires_at?: string;
          fetched_at?: string;
          id?: string;
          is_mock?: boolean;
          payload?: Json | null;
          raw_feature_count?: number | null;
          source_kind?: string;
          source_url?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
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
          metadata: Json;
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
          metadata?: Json;
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
          metadata?: Json;
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
            referencedRelation: "analysis_run_summaries";
            referencedColumns: ["id"];
          },
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
          metadata: Json;
          project_id: string | null;
          run_kind: string;
          source: string;
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
          metadata?: Json;
          project_id?: string | null;
          run_kind: string;
          source?: string;
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
          metadata?: Json;
          project_id?: string | null;
          run_kind?: string;
          source?: string;
          started_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analysis_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      broadband_coverage: {
        Row: {
          adgangsadresse_id: string;
          fast_traadloes_download_mbit: number | null;
          fast_traadloes_upload_mbit: number | null;
          fiber_download_mbit: number | null;
          fiber_upload_mbit: number | null;
          imported_at: string;
          kabel_tv_download_mbit: number | null;
          kabel_tv_upload_mbit: number | null;
          mobil_download_mbit: number | null;
          source_url: string | null;
          xdsl_download_mbit: number | null;
          xdsl_upload_mbit: number | null;
        };
        Insert: {
          adgangsadresse_id: string;
          fast_traadloes_download_mbit?: number | null;
          fast_traadloes_upload_mbit?: number | null;
          fiber_download_mbit?: number | null;
          fiber_upload_mbit?: number | null;
          imported_at?: string;
          kabel_tv_download_mbit?: number | null;
          kabel_tv_upload_mbit?: number | null;
          mobil_download_mbit?: number | null;
          source_url?: string | null;
          xdsl_download_mbit?: number | null;
          xdsl_upload_mbit?: number | null;
        };
        Update: {
          adgangsadresse_id?: string;
          fast_traadloes_download_mbit?: number | null;
          fast_traadloes_upload_mbit?: number | null;
          fiber_download_mbit?: number | null;
          fiber_upload_mbit?: number | null;
          imported_at?: string;
          kabel_tv_download_mbit?: number | null;
          kabel_tv_upload_mbit?: number | null;
          mobil_download_mbit?: number | null;
          source_url?: string | null;
          xdsl_download_mbit?: number | null;
          xdsl_upload_mbit?: number | null;
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
          placement_outside_parcel_area_m2: number;
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
          placement_outside_parcel_area_m2?: number;
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
          placement_outside_parcel_area_m2?: number;
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
      drawing_exports: {
        Row: {
          approved_at: string | null;
          drawing_type: string;
          generated_at: string;
          id: string;
          input_hash: string;
          pdf_path: string | null;
          project_id: string;
          readiness_status: string;
          status: string;
          svg_path: string | null;
        };
        Insert: {
          approved_at?: string | null;
          drawing_type?: string;
          generated_at?: string;
          id?: string;
          input_hash: string;
          pdf_path?: string | null;
          project_id: string;
          readiness_status: string;
          status?: string;
          svg_path?: string | null;
        };
        Update: {
          approved_at?: string | null;
          drawing_type?: string;
          generated_at?: string;
          id?: string;
          input_hash?: string;
          pdf_path?: string | null;
          project_id?: string;
          readiness_status?: string;
          status?: string;
          svg_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drawing_exports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plan_commands: {
        Row: {
          command_hash: string;
          command_index: number;
          command_json: Json;
          created_at: string;
          created_by: string | null;
          floor_plan_iteration_id: string;
          id: string;
          project_id: string;
          source: string;
        };
        Insert: {
          command_hash: string;
          command_index: number;
          command_json: Json;
          created_at?: string;
          created_by?: string | null;
          floor_plan_iteration_id: string;
          id?: string;
          project_id: string;
          source: string;
        };
        Update: {
          command_hash?: string;
          command_index?: number;
          command_json?: Json;
          created_at?: string;
          created_by?: string | null;
          floor_plan_iteration_id?: string;
          id?: string;
          project_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_commands_floor_plan_iteration_id_fkey";
            columns: ["floor_plan_iteration_id"];
            isOneToOne: false;
            referencedRelation: "floor_plan_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_commands_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plan_exports: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          drawing_type: string;
          floor_plan_iteration_id: string;
          generated_at: string;
          id: string;
          input_hash: string;
          pdf_path: string | null;
          project_id: string;
          readiness_status: string;
          svg_path: string | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          drawing_type?: string;
          floor_plan_iteration_id: string;
          generated_at?: string;
          id?: string;
          input_hash: string;
          pdf_path?: string | null;
          project_id: string;
          readiness_status: string;
          svg_path?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          drawing_type?: string;
          floor_plan_iteration_id?: string;
          generated_at?: string;
          id?: string;
          input_hash?: string;
          pdf_path?: string | null;
          project_id?: string;
          readiness_status?: string;
          svg_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_exports_floor_plan_iteration_id_fkey";
            columns: ["floor_plan_iteration_id"];
            isOneToOne: false;
            referencedRelation: "floor_plan_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_exports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plan_iterations: {
        Row: {
          created_at: string;
          created_by: string | null;
          design_iteration_id: string | null;
          exterior_wall_length_m: number | null;
          floor_plan_json: Json;
          footprint_area_m2: number | null;
          gross_area_m2: number | null;
          id: string;
          is_active: boolean;
          levels_count: number;
          material_basis_readiness: string;
          model_hash: string;
          net_area_m2: number | null;
          openings_count: number;
          project_id: string;
          rooms_count: number;
          schema_version: string;
          verification_status: string;
          version: number;
          wall_length_total_m: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          design_iteration_id?: string | null;
          exterior_wall_length_m?: number | null;
          floor_plan_json: Json;
          footprint_area_m2?: number | null;
          gross_area_m2?: number | null;
          id?: string;
          is_active?: boolean;
          levels_count?: number;
          material_basis_readiness?: string;
          model_hash: string;
          net_area_m2?: number | null;
          openings_count?: number;
          project_id: string;
          rooms_count?: number;
          schema_version?: string;
          verification_status?: string;
          version?: number;
          wall_length_total_m?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          design_iteration_id?: string | null;
          exterior_wall_length_m?: number | null;
          floor_plan_json?: Json;
          footprint_area_m2?: number | null;
          gross_area_m2?: number | null;
          id?: string;
          is_active?: boolean;
          levels_count?: number;
          material_basis_readiness?: string;
          model_hash?: string;
          net_area_m2?: number | null;
          openings_count?: number;
          project_id?: string;
          rooms_count?: number;
          schema_version?: string;
          verification_status?: string;
          version?: number;
          wall_length_total_m?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_iterations_design_iteration_id_fkey";
            columns: ["design_iteration_id"];
            isOneToOne: false;
            referencedRelation: "design_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_iterations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plan_verifications: {
        Row: {
          findings_json: Json;
          floor_plan_iteration_id: string;
          id: string;
          input_hash: string;
          missing_data_points_json: Json;
          project_id: string;
          rule_engine_snapshot_id: string | null;
          status: string;
          verified_at: string;
          verified_by: string | null;
        };
        Insert: {
          findings_json?: Json;
          floor_plan_iteration_id: string;
          id?: string;
          input_hash: string;
          missing_data_points_json?: Json;
          project_id: string;
          rule_engine_snapshot_id?: string | null;
          status: string;
          verified_at?: string;
          verified_by?: string | null;
        };
        Update: {
          findings_json?: Json;
          floor_plan_iteration_id?: string;
          id?: string;
          input_hash?: string;
          missing_data_points_json?: Json;
          project_id?: string;
          rule_engine_snapshot_id?: string | null;
          status?: string;
          verified_at?: string;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_verifications_floor_plan_iteration_id_fkey";
            columns: ["floor_plan_iteration_id"];
            isOneToOne: false;
            referencedRelation: "floor_plan_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_verifications_project_id_fkey";
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
      project_br18_applicability: {
        Row: {
          br18_version: string;
          created_at: string;
          evaluated_at: string;
          id: string;
          missing_inputs: string[];
          project_id: string;
          reasons: string[];
          requirement_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          br18_version?: string;
          created_at?: string;
          evaluated_at?: string;
          id?: string;
          missing_inputs?: string[];
          project_id: string;
          reasons?: string[];
          requirement_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          br18_version?: string;
          created_at?: string;
          evaluated_at?: string;
          id?: string;
          missing_inputs?: string[];
          project_id?: string;
          reasons?: string[];
          requirement_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_br18_applicability_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_br18_evidence: {
        Row: {
          created_at: string;
          evidence_type: string;
          file_id: string | null;
          id: string;
          project_id: string;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by_role: string | null;
          source: string;
          status: string;
          structured_payload: Json | null;
          updated_at: string;
          validation_notes: string[];
        };
        Insert: {
          created_at?: string;
          evidence_type: string;
          file_id?: string | null;
          id?: string;
          project_id: string;
          requirement_id: string;
          reviewed_at?: string | null;
          reviewed_by_role?: string | null;
          source: string;
          status?: string;
          structured_payload?: Json | null;
          updated_at?: string;
          validation_notes?: string[];
        };
        Update: {
          created_at?: string;
          evidence_type?: string;
          file_id?: string | null;
          id?: string;
          project_id?: string;
          requirement_id?: string;
          reviewed_at?: string | null;
          reviewed_by_role?: string | null;
          source?: string;
          status?: string;
          structured_payload?: Json | null;
          updated_at?: string;
          validation_notes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "project_br18_evidence_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
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
          authority_readiness_status: string | null;
          bebygget_areal_m2: number | null;
          bfe_nr: string | null;
          billedanalyse: Json | null;
          br18_version: string;
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
          authority_readiness_status?: string | null;
          bebygget_areal_m2?: number | null;
          bfe_nr?: string | null;
          billedanalyse?: Json | null;
          br18_version?: string;
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
          authority_readiness_status?: string | null;
          bebygget_areal_m2?: number | null;
          bfe_nr?: string | null;
          billedanalyse?: Json | null;
          br18_version?: string;
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
          access_road_nearby: boolean | null;
          address_id: string;
          bbr_afloebsforhold_kode: string | null;
          bbr_ombygningsaar: number | null;
          bbr_sanerings_risiko: string | null;
          bbr_vandforsyning_kode: string | null;
          bluespot_risk: boolean | null;
          bnbo: boolean | null;
          broadband_fast_traadloes_mbit: number | null;
          broadband_fiber_mbit: number | null;
          broadband_kabel_mbit: number | null;
          broadband_match_type: string | null;
          broadband_max_fast_mbit: number | null;
          broadband_mobil_mbit: number | null;
          broadband_xdsl_mbit: number | null;
          building_field_source_id: string | null;
          confidence: string;
          energimaerke_er_udloebet: boolean | null;
          energimaerke_gyldig_til: string | null;
          energimaerke_klasse: string | null;
          energimaerke_rapport_id: string | null;
          energimaerke_rapport_url: string | null;
          energimaerke_rapportdato: string | null;
          energy_frame_required: boolean | null;
          extracted_at: string;
          fire_review_required: boolean | null;
          fortidsminde: boolean | null;
          fortidsminde_buffer: boolean | null;
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
          lca_required: boolean | null;
          lokalplan_byggefelt_present: boolean | null;
          max_bebyggelsesprocent: number | null;
          max_etager: number | null;
          max_height_m: number | null;
          min_distance_to_boundary_m: number | null;
          natura2000: boolean | null;
          neighbor_building_count_40m: number | null;
          neighbor_context_confidence: string | null;
          neighbor_nearest_building_distance_m: number | null;
          noise_acoustic_review_required: boolean | null;
          noise_air_lden_db: number | null;
          noise_air_lnight_db: number | null;
          noise_coverage_status: string | null;
          noise_industry_lden_db: number | null;
          noise_model_year: number | null;
          noise_rail_lden_db: number | null;
          noise_rail_lnight_db: number | null;
          noise_road_lden_db: number | null;
          noise_road_lnight_db: number | null;
          omraadeklassificering: string | null;
          osd: boolean | null;
          paragraph3_nature: boolean | null;
          planning_large_livestock_area: boolean | null;
          planning_noise_area: boolean | null;
          planning_odor_area: boolean | null;
          planning_production_noise_consequence_area: boolean | null;
          planning_surroundings_review_required: boolean | null;
          planning_technical_facility_consequence_area: boolean | null;
          protected_dige: boolean | null;
          raw_material_area: boolean | null;
          road_nearest_centerline_distance_m: number | null;
          save_value: number | null;
          sewer_area_type: string | null;
          soil_contamination_status: string | null;
          source_kommuneplan_id: string | null;
          source_lokalplan_id: string | null;
          static_review_required: boolean | null;
          strandbeskyttelse: boolean;
          terrain_low_point_m: number | null;
          terrain_slope_pct: number | null;
          updated_at: string;
          wastewater_plan_status: string | null;
          within_building_field: boolean | null;
          zone_type: string | null;
        };
        Insert: {
          access_road_nearby?: boolean | null;
          address_id: string;
          bbr_afloebsforhold_kode?: string | null;
          bbr_ombygningsaar?: number | null;
          bbr_sanerings_risiko?: string | null;
          bbr_vandforsyning_kode?: string | null;
          bluespot_risk?: boolean | null;
          bnbo?: boolean | null;
          broadband_fast_traadloes_mbit?: number | null;
          broadband_fiber_mbit?: number | null;
          broadband_kabel_mbit?: number | null;
          broadband_match_type?: string | null;
          broadband_max_fast_mbit?: number | null;
          broadband_mobil_mbit?: number | null;
          broadband_xdsl_mbit?: number | null;
          building_field_source_id?: string | null;
          confidence?: string;
          energimaerke_er_udloebet?: boolean | null;
          energimaerke_gyldig_til?: string | null;
          energimaerke_klasse?: string | null;
          energimaerke_rapport_id?: string | null;
          energimaerke_rapport_url?: string | null;
          energimaerke_rapportdato?: string | null;
          energy_frame_required?: boolean | null;
          extracted_at?: string;
          fire_review_required?: boolean | null;
          fortidsminde?: boolean | null;
          fortidsminde_buffer?: boolean | null;
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
          lca_required?: boolean | null;
          lokalplan_byggefelt_present?: boolean | null;
          max_bebyggelsesprocent?: number | null;
          max_etager?: number | null;
          max_height_m?: number | null;
          min_distance_to_boundary_m?: number | null;
          natura2000?: boolean | null;
          neighbor_building_count_40m?: number | null;
          neighbor_context_confidence?: string | null;
          neighbor_nearest_building_distance_m?: number | null;
          noise_acoustic_review_required?: boolean | null;
          noise_air_lden_db?: number | null;
          noise_air_lnight_db?: number | null;
          noise_coverage_status?: string | null;
          noise_industry_lden_db?: number | null;
          noise_model_year?: number | null;
          noise_rail_lden_db?: number | null;
          noise_rail_lnight_db?: number | null;
          noise_road_lden_db?: number | null;
          noise_road_lnight_db?: number | null;
          omraadeklassificering?: string | null;
          osd?: boolean | null;
          paragraph3_nature?: boolean | null;
          planning_large_livestock_area?: boolean | null;
          planning_noise_area?: boolean | null;
          planning_odor_area?: boolean | null;
          planning_production_noise_consequence_area?: boolean | null;
          planning_surroundings_review_required?: boolean | null;
          planning_technical_facility_consequence_area?: boolean | null;
          protected_dige?: boolean | null;
          raw_material_area?: boolean | null;
          road_nearest_centerline_distance_m?: number | null;
          save_value?: number | null;
          sewer_area_type?: string | null;
          soil_contamination_status?: string | null;
          source_kommuneplan_id?: string | null;
          source_lokalplan_id?: string | null;
          static_review_required?: boolean | null;
          strandbeskyttelse?: boolean;
          terrain_low_point_m?: number | null;
          terrain_slope_pct?: number | null;
          updated_at?: string;
          wastewater_plan_status?: string | null;
          within_building_field?: boolean | null;
          zone_type?: string | null;
        };
        Update: {
          access_road_nearby?: boolean | null;
          address_id?: string;
          bbr_afloebsforhold_kode?: string | null;
          bbr_ombygningsaar?: number | null;
          bbr_sanerings_risiko?: string | null;
          bbr_vandforsyning_kode?: string | null;
          bluespot_risk?: boolean | null;
          bnbo?: boolean | null;
          broadband_fast_traadloes_mbit?: number | null;
          broadband_fiber_mbit?: number | null;
          broadband_kabel_mbit?: number | null;
          broadband_match_type?: string | null;
          broadband_max_fast_mbit?: number | null;
          broadband_mobil_mbit?: number | null;
          broadband_xdsl_mbit?: number | null;
          building_field_source_id?: string | null;
          confidence?: string;
          energimaerke_er_udloebet?: boolean | null;
          energimaerke_gyldig_til?: string | null;
          energimaerke_klasse?: string | null;
          energimaerke_rapport_id?: string | null;
          energimaerke_rapport_url?: string | null;
          energimaerke_rapportdato?: string | null;
          energy_frame_required?: boolean | null;
          extracted_at?: string;
          fire_review_required?: boolean | null;
          fortidsminde?: boolean | null;
          fortidsminde_buffer?: boolean | null;
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
          lca_required?: boolean | null;
          lokalplan_byggefelt_present?: boolean | null;
          max_bebyggelsesprocent?: number | null;
          max_etager?: number | null;
          max_height_m?: number | null;
          min_distance_to_boundary_m?: number | null;
          natura2000?: boolean | null;
          neighbor_building_count_40m?: number | null;
          neighbor_context_confidence?: string | null;
          neighbor_nearest_building_distance_m?: number | null;
          noise_acoustic_review_required?: boolean | null;
          noise_air_lden_db?: number | null;
          noise_air_lnight_db?: number | null;
          noise_coverage_status?: string | null;
          noise_industry_lden_db?: number | null;
          noise_model_year?: number | null;
          noise_rail_lden_db?: number | null;
          noise_rail_lnight_db?: number | null;
          noise_road_lden_db?: number | null;
          noise_road_lnight_db?: number | null;
          omraadeklassificering?: string | null;
          osd?: boolean | null;
          paragraph3_nature?: boolean | null;
          planning_large_livestock_area?: boolean | null;
          planning_noise_area?: boolean | null;
          planning_odor_area?: boolean | null;
          planning_production_noise_consequence_area?: boolean | null;
          planning_surroundings_review_required?: boolean | null;
          planning_technical_facility_consequence_area?: boolean | null;
          protected_dige?: boolean | null;
          raw_material_area?: boolean | null;
          road_nearest_centerline_distance_m?: number | null;
          save_value?: number | null;
          sewer_area_type?: string | null;
          soil_contamination_status?: string | null;
          source_kommuneplan_id?: string | null;
          source_lokalplan_id?: string | null;
          static_review_required?: boolean | null;
          strandbeskyttelse?: boolean;
          terrain_low_point_m?: number | null;
          terrain_slope_pct?: number | null;
          updated_at?: string;
          wastewater_plan_status?: string | null;
          within_building_field?: boolean | null;
          zone_type?: string | null;
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
      analysis_event_errors: {
        Row: {
          address_id: string | null;
          created_at: string | null;
          duration_ms: number | null;
          error_message: string | null;
          event_type: string | null;
          http_status: number | null;
          metadata: Json | null;
          operation: string | null;
          phase: string | null;
          project_id: string | null;
          run_id: string | null;
          run_kind: string | null;
          service: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analysis_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_run_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analysis_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analysis_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      analysis_run_summaries: {
        Row: {
          address_id: string | null;
          api_call_count: number | null;
          api_calls_by_service: Json | null;
          cache_hit_count: number | null;
          cache_read_count: number | null;
          completed_at: string | null;
          db_write_count: number | null;
          duration_ms: number | null;
          error_count: number | null;
          error_message: string | null;
          event_count: number | null;
          id: string | null;
          project_id: string | null;
          run_kind: string | null;
          source: string | null;
          started_at: string | null;
          status: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analysis_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
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
