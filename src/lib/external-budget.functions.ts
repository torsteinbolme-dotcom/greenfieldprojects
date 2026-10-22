import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseBudgetCommand, type BudgetCommand } from "./external-budget-persistence";

export const externalBudgetMutation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseBudgetCommand)
  .handler(async ({ data, context }) => {
    // Dynamic server import keeps service credentials and privileged writes out of browsers.
    const { writeExternalBudget } = await import("./external-budget.server");
    return writeExternalBudget(context.supabase, context.userId, data);
  });

export const createExternalBudget = (data: Extract<BudgetCommand, { operation: "create" }>) =>
  externalBudgetMutation({ data });
export const saveExternalBudgetVersion = (data: Extract<BudgetCommand, { operation: "save" }>) =>
  externalBudgetMutation({ data });
export const refreshExternalBudgetInheritance = (
  data: Extract<BudgetCommand, { operation: "refresh" }>,
) => externalBudgetMutation({ data });
export const duplicateExternalBudget = (data: Extract<BudgetCommand, { operation: "duplicate" }>) =>
  externalBudgetMutation({ data });
export const archiveExternalBudget = (data: Extract<BudgetCommand, { operation: "archive" }>) =>
  externalBudgetMutation({ data });
export const restoreExternalBudget = (data: Extract<BudgetCommand, { operation: "restore" }>) =>
  externalBudgetMutation({ data });
