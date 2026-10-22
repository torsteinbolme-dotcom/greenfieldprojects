import type { Database, Json } from "@/integrations/supabase/types";
import type { BudgetHeader, BudgetVersion } from "./external-budget-persistence";
/** Additive local schema typing; generated legacy Supabase types are left untouched. */
export type ExternalBudgetDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      external_budget: { Row: BudgetHeader; Insert: never; Update: never; Relationships: [] };
      external_budget_versions: {
        Row: BudgetVersion;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      write_external_budget: {
        Args: {
          _actor: string;
          _operation: string;
          _project: string;
          _budget: string | null;
          _expected: string | null;
          _payload: Json;
          _capture: Json;
        };
        Returns: Json;
      };
    };
  };
};
