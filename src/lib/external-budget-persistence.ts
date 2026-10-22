import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { captureInheritance, calculateExternalBudget } from "./financial-input";
import {
  FINANCIAL_INPUT_VERSION,
  validateInheritanceShape,
  type ExternalBudgetDraft,
  type ExternalBudgetInput,
} from "./external-budget-contract";
import type { Assumptions } from "@/financialEngine";

export const BUDGET_SCHEMA_VERSION = "external-budget-document-v1" as const;
const amount = z.number().finite().nonnegative();
const row = z
  .object({
    year: z.number().int().min(1).max(10),
    passengers: amount,
    ticketNetPrice: amount,
    fbRevenue: amount,
    fbOpex: amount,
    cableOpex: amount,
  })
  .strict();
const confirmations = z
  .object({
    ticketAlreadyNet: z.literal(true),
    cableExcludesSeparateCosts: z.literal(true),
    opexExcludesFinancingTaxDepreciation: z.literal(true),
    replacementCapexNotDoubleCounted: z.literal(true),
    capexIncludesContingency: z.literal(true),
  })
  .strict();
const common = { version: z.literal(FINANCIAL_INPUT_VERSION), mode: z.literal("externalBudget") };
// No inheritance field in write requests: the trusted server captures or pins it.
export const editableBudgetInput = z.discriminatedUnion("status", [
  z
    .object({
      ...common,
      status: z.literal("draft"),
      initialCapex: amount.optional(),
      annual: z.array(row.partial()).max(10).optional(),
      accounting: confirmations.partial().optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      status: z.literal("complete"),
      initialCapex: amount,
      annual: z.array(row).length(10),
      accounting: confirmations,
    })
    .strict(),
]);
export const budgetDocumentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.trim().length > 0, "Budget name is required"),
    description: z.string().max(4000).nullable(),
    sourceInfo: z
      .object({
        label: z.string().max(500).optional(),
        url: z.string().url().max(2000).optional(),
        notes: z.string().max(4000).optional(),
      })
      .strict(),
    input: editableBudgetInput,
  })
  .strict();
const source = z
  .object({ scenarioId: z.string().uuid(), assumptionId: z.string().uuid() })
  .strict();
const identity = {
  projectId: z.string().uuid(),
  budgetId: z.string().uuid(),
  expectedVersionId: z.string().uuid(),
};
export const budgetCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      projectId: z.string().uuid(),
      document: budgetDocumentSchema,
      source: source.optional(),
    })
    .strict(),
  z.object({ operation: z.literal("save"), ...identity, document: budgetDocumentSchema }).strict(),
  z
    .object({
      operation: z.literal("refresh"),
      ...identity,
      document: budgetDocumentSchema,
      source,
    })
    .strict(),
  z
    .object({
      operation: z.literal("duplicate"),
      ...identity,
      name: z
        .string()
        .min(1)
        .max(200)
        .refine((value) => !!value.trim()),
    })
    .strict(),
  z.object({ operation: z.literal("archive"), ...identity }).strict(),
  z.object({ operation: z.literal("restore"), ...identity }).strict(),
]);
export type BudgetCommand = z.infer<typeof budgetCommandSchema>;
export type BudgetDocument = z.infer<typeof budgetDocumentSchema>;
export type BudgetInput = ExternalBudgetInput | ExternalBudgetDraft;
export type BudgetHeader = {
  id: string;
  organization_id: string;
  project_id: string;
  current_version_id: string;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};
export type BudgetVersion = {
  id: string;
  budget_id: string;
  organization_id: string;
  project_id: string;
  version: number;
  action: BudgetCommand["operation"];
  name: string;
  description: string | null;
  source_info: BudgetDocument["sourceInfo"];
  input: BudgetInput;
  schema_version: typeof BUDGET_SCHEMA_VERSION;
  financial_contract_version: typeof FINANCIAL_INPUT_VERSION;
  source_scenario_id: string | null;
  source_assumption_id: string | null;
  source_assumption_version: number | null;
  source_calculation_version: string | null;
  source_assumptions: Json;
  duplicated_from_budget_id: string | null;
  duplicated_from_version_id: string | null;
  created_by: string;
  created_at: string;
};
export type BudgetSaveResult = { budget: BudgetHeader; version: BudgetVersion };
export type CapturedSource = {
  id: string;
  scenarioId: string;
  version: number;
  calculationVersion: string;
  assumptions: Assumptions;
};
export type BudgetWrite = {
  actor: string;
  operation: BudgetCommand["operation"];
  project: string;
  budget: string | null;
  expected: string | null;
  payload: {
    name: string;
    description?: string | null;
    sourceInfo?: BudgetDocument["sourceInfo"];
    input?: BudgetInput;
  } | null;
  capture: CapturedSource | null;
};
export type BudgetStore = {
  readCurrent(project: string, budget: string): Promise<BudgetVersion>;
  readSource(project: string, selection: z.infer<typeof source>): Promise<CapturedSource>;
  commit(write: BudgetWrite): Promise<BudgetSaveResult>;
};
export class BudgetConflictError extends Error {
  constructor() {
    super("External budget changed. Reload and review before saving again.");
    this.name = "BudgetConflictError";
  }
}

/** JSON serialization must not turn undefined/NaN/holes into apparently supplied values. */
export function assertBudgetJson(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertBudgetJson(value[i]);
    return;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    Object.values(value).forEach(assertBudgetJson);
    return;
  }
  throw Error(
    "External budgets require plain, finite JSON values; omit incomplete fields explicitly.",
  );
}
export function parseBudgetCommand(value: unknown): BudgetCommand {
  assertBudgetJson(value);
  return budgetCommandSchema.parse(value);
}

/** No financial calculation for drafts, including a draft with no annual inputs. */
export function prepareBudgetDocument(
  document: BudgetDocument,
  inheritance?: BudgetInput["inheritance"],
) {
  assertBudgetJson(document);
  const parsed = budgetDocumentSchema.parse(document);
  if (inheritance) validateInheritanceShape(inheritance);
  const input = {
    ...structuredClone(parsed.input),
    ...(inheritance ? { inheritance: structuredClone(inheritance) } : {}),
  };
  assertBudgetJson(input);
  if (input.status === "complete") {
    if (!inheritance) throw Error("Completion requires pinned inheritance.");
    calculateExternalBudget(input as ExternalBudgetInput);
  }
  return { ...parsed, input: input as BudgetInput };
}

/** Transport-independent orchestration. Only authenticated server handlers construct the real store. */
export async function executeBudgetCommand(
  store: BudgetStore,
  actor: string,
  raw: unknown,
): Promise<BudgetSaveResult> {
  if (!z.string().uuid().safeParse(actor).success) throw Error("Unauthorized");
  const command = parseBudgetCommand(raw);
  let current: BudgetVersion | undefined;
  if (command.operation !== "create") {
    current = await store.readCurrent(command.projectId, command.budgetId);
    if (current.id !== command.expectedVersionId) throw new BudgetConflictError();
  }
  let capture: CapturedSource | null = null;
  if ((command.operation === "create" && command.source) || command.operation === "refresh") {
    capture = await store.readSource(command.projectId, command.source!);
    if (
      command.operation === "refresh" &&
      current?.source_scenario_id &&
      current.source_scenario_id !== capture.scenarioId
    )
      throw Error("Refresh must use the linked scenario.");
  }
  const payload =
    "document" in command
      ? prepareBudgetDocument(
          command.document,
          capture ? captureInheritance(capture.assumptions) : current?.input.inheritance,
        )
      : command.operation === "duplicate"
        ? { name: command.name }
        : null;
  return store.commit({
    actor,
    operation: command.operation,
    project: command.projectId,
    budget: command.operation === "create" ? null : command.budgetId,
    expected: command.operation === "create" ? null : command.expectedVersionId,
    payload,
    capture,
  });
}
