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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_assets: {
        Row: {
          business_type: string
          created_at: string
          id: string
          location: string | null
          name: string
          organization_id: string
          parent_asset_id: string | null
        }
        Insert: {
          business_type: string
          created_at?: string
          id?: string
          location?: string | null
          name: string
          organization_id: string
          parent_asset_id?: string | null
        }
        Update: {
          business_type?: string
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          organization_id?: string
          parent_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "benchmark_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_records: {
        Row: {
          asset_id: string
          comparability_notes: string | null
          created_at: string
          currency: string
          data_status: string
          ebitda: number | null
          financial_year: number
          id: string
          opex: number | null
          organization_id: string
          passengers: number | null
          revenue: number | null
          source: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          comparability_notes?: string | null
          created_at?: string
          currency?: string
          data_status?: string
          ebitda?: number | null
          financial_year: number
          id?: string
          opex?: number | null
          organization_id: string
          passengers?: number | null
          revenue?: number | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          comparability_notes?: string | null
          created_at?: string
          currency?: string
          data_status?: string
          ebitda?: number | null
          financial_year?: number
          id?: string
          opex?: number | null
          organization_id?: string
          passengers?: number | null
          revenue?: number | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "benchmark_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_budget: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          current_version_id: string
          id: string
          organization_id: string
          project_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          current_version_id: string
          id?: string
          organization_id: string
          project_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_budget_current_version_fk"
            columns: [
              "current_version_id",
              "id",
              "organization_id",
              "project_id",
            ]
            isOneToOne: false
            referencedRelation: "external_budget_versions"
            referencedColumns: [
              "id",
              "budget_id",
              "organization_id",
              "project_id",
            ]
          },
          {
            foreignKeyName: "external_budget_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      external_budget_versions: {
        Row: {
          action: string
          budget_id: string
          created_at: string
          created_by: string
          description: string | null
          duplicated_from_budget_id: string | null
          duplicated_from_version_id: string | null
          financial_contract_version: string
          id: string
          input: Json
          name: string
          organization_id: string
          project_id: string
          schema_version: string
          source_assumption_id: string | null
          source_assumption_version: number | null
          source_assumptions: Json | null
          source_calculation_version: string | null
          source_info: Json
          source_scenario_id: string | null
          version: number
        }
        Insert: {
          action: string
          budget_id: string
          created_at?: string
          created_by: string
          description?: string | null
          duplicated_from_budget_id?: string | null
          duplicated_from_version_id?: string | null
          financial_contract_version: string
          id?: string
          input: Json
          name: string
          organization_id: string
          project_id: string
          schema_version: string
          source_assumption_id?: string | null
          source_assumption_version?: number | null
          source_assumptions?: Json | null
          source_calculation_version?: string | null
          source_info?: Json
          source_scenario_id?: string | null
          version: number
        }
        Update: {
          action?: string
          budget_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          duplicated_from_budget_id?: string | null
          duplicated_from_version_id?: string | null
          financial_contract_version?: string
          id?: string
          input?: Json
          name?: string
          organization_id?: string
          project_id?: string
          schema_version?: string
          source_assumption_id?: string | null
          source_assumption_version?: number | null
          source_assumptions?: Json | null
          source_calculation_version?: string | null
          source_info?: Json
          source_scenario_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "external_budget_versions_budget_id_organization_id_project_fkey"
            columns: ["budget_id", "organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "external_budget"
            referencedColumns: ["id", "organization_id", "project_id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          email: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          organization_id: string
          project_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          organization_id: string
          project_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          organization_id?: string
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          assumption_notes: string | null
          benchmark_config: Json
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assumption_notes?: string | null
          benchmark_config?: Json
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assumption_notes?: string | null
          benchmark_config?: Json
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_assumptions: {
        Row: {
          assumptions: Json
          calculation_version: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          organization_id: string
          scenario_id: string
          version: number
        }
        Insert: {
          assumptions: Json
          calculation_version?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          organization_id: string
          scenario_id: string
          version: number
        }
        Update: {
          assumptions?: Json
          calculation_version?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          scenario_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_assumptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonality_profiles: {
        Row: {
          allocation_pct: number
          benchmark_name: string
          created_at: string
          historical_passengers: number | null
          id: string
          method: string | null
          month: number
          organization_id: string
          profile_name: string
        }
        Insert: {
          allocation_pct: number
          benchmark_name: string
          created_at?: string
          historical_passengers?: number | null
          id?: string
          method?: string | null
          month: number
          organization_id: string
          profile_name: string
        }
        Update: {
          allocation_pct?: number
          benchmark_name?: string
          created_at?: string
          historical_passengers?: number | null
          id?: string
          method?: string | null
          month?: number
          organization_id?: string
          profile_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonality_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      latest_scenario_assumptions: {
        Row: {
          assumptions: Json | null
          calculation_version: string | null
          created_at: string | null
          id: string | null
          organization_id: string | null
          scenario_id: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scenario_assumptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: string }
      can_edit_org: { Args: { _org: string; _user: string }; Returns: boolean }
      import_seasonality_profiles: {
        Args: { p_organization_id: string; p_replace?: boolean; p_rows: Json }
        Returns: undefined
      }
      is_org_admin: { Args: { _org: string; _user: string }; Returns: boolean }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      soft_delete_project: { Args: { _project: string }; Returns: undefined }
      write_external_budget: {
        Args: {
          _actor: string
          _budget: string
          _capture?: Json
          _expected: string
          _operation: string
          _payload: Json
          _project: string
        }
        Returns: Json
      }
    }
    Enums: {
      org_role: "admin" | "editor" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      org_role: ["admin", "editor", "viewer"],
    },
  },
} as const
