import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ExternalBudgetDatabase } from "./external-budget-database";
import type { BudgetHeader, BudgetVersion } from "./external-budget-persistence";

/** All browser reads retain caller JWT/RLS. Never import the admin client here. */
export function externalBudgetReader(client = supabase) {
  const db = client as unknown as SupabaseClient<ExternalBudgetDatabase>;
  return {
    async list(projectId: string, includeArchived = false): Promise<BudgetHeader[]> {
      let query = db
        .from("external_budget")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async history(projectId: string, budgetId: string): Promise<BudgetVersion[]> {
      const { data, error } = await db
        .from("external_budget_versions")
        .select("*")
        .eq("project_id", projectId)
        .eq("budget_id", budgetId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
    async version(projectId: string, budgetId: string, versionId: string): Promise<BudgetVersion> {
      const { data, error } = await db
        .from("external_budget_versions")
        .select("*")
        .eq("project_id", projectId)
        .eq("budget_id", budgetId)
        .eq("id", versionId)
        .single();
      if (error) throw error;
      return data;
    },
  };
}
