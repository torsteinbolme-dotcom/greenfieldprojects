import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ExternalBudgetDatabase } from "./external-budget-database";
import {
  BudgetConflictError,
  executeBudgetCommand,
  type BudgetCommand,
  type BudgetSaveResult,
  type BudgetStore,
} from "./external-budget-persistence";
import type { Assumptions } from "@/financialEngine";

/** Invoked only from the authenticated server function; actor never comes from request data. */
export async function writeExternalBudget(
  userClient: SupabaseClient<Database>,
  actor: string,
  command: BudgetCommand,
) {
  const read = userClient as unknown as SupabaseClient<ExternalBudgetDatabase>;
  const admin = supabaseAdmin as unknown as SupabaseClient<ExternalBudgetDatabase>;
  const store: BudgetStore = {
    async readCurrent(project, budget) {
      const { data: header, error } = await read
        .from("external_budget")
        .select("current_version_id")
        .eq("project_id", project)
        .eq("id", budget)
        .single();
      if (error) throw error;
      const { data, error: versionError } = await read
        .from("external_budget_versions")
        .select("*")
        .eq("budget_id", budget)
        .eq("project_id", project)
        .eq("id", header.current_version_id)
        .single();
      if (versionError) throw versionError;
      return data;
    },
    async readSource(project, selection) {
      const { data: scenario, error } = await userClient
        .from("scenarios")
        .select("id, project_id, organization_id")
        .eq("id", selection.scenarioId)
        .eq("project_id", project)
        .single();
      if (error) throw error;
      const { data, error: sourceError } = await userClient
        .from("scenario_assumptions")
        .select("*")
        .eq("id", selection.assumptionId)
        .eq("scenario_id", scenario.id)
        .eq("organization_id", scenario.organization_id)
        .single();
      if (sourceError) throw sourceError;
      return {
        id: data.id,
        scenarioId: data.scenario_id,
        version: data.version,
        calculationVersion: data.calculation_version,
        assumptions: data.assumptions as unknown as Assumptions,
      };
    },
    async commit(write) {
      const { data, error } = await admin.rpc("write_external_budget", {
        _actor: write.actor,
        _operation: write.operation,
        _project: write.project,
        // The SQL function accepts NULL for a new budget; generated types mark these non-null.
        _budget: write.budget as string,
        _expected: write.expected as string,
        _payload: write.payload as unknown as Json,
        _capture: write.capture as unknown as Json,
      });
      if (error?.code === "40001") throw new BudgetConflictError();
      if (error) throw error;
      return data as unknown as BudgetSaveResult;
    },
  };
  return executeBudgetCommand(store, actor, command);
}
