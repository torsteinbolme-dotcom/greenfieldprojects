import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { phase1Case } from "./fixtures/phase1";
const state = vi.hoisted(() => ({
  role: "editor",
  list: vi.fn(),
  history: vi.fn(),
  version: vi.fn(),
  mutation: vi.fn(),
  from: vi.fn(),
  session: vi.fn(),
}));
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useBlocker: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  useMembership: () => ({ data: { organization_id: id(2), user_id: id(3), role: state.role } }),
  useProjects: () => ({
    data: [
      { id: id(1), name: "Own project", organization_id: id(2) },
      { id: id(9), name: "Other organization project", organization_id: id(8) },
    ],
  }),
  useScenarios: () => ({
    data: [{ id: id(4), name: "Saved Base", organization_id: id(2), project_id: id(1) }],
  }),
}));
vi.mock("@/lib/external-budget-data", () => ({
  externalBudgetReader: () => ({
    list: state.list,
    history: state.history,
    version: state.version,
  }),
}));
vi.mock("@/lib/external-budget.functions", () => ({ externalBudgetMutation: state.mutation }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: state.from, auth: { getSession: state.session } },
}));
import { ExternalBudgetsPage } from "@/routes/_authenticated/comparison.external-budgets";
let queries: { table: string; filters: unknown[][] }[] = [];
beforeEach(() => {
  state.role = "editor";
  queries = [];
  state.list.mockReset().mockResolvedValue([]);
  state.history.mockReset().mockResolvedValue([]);
  state.version.mockReset();
  state.mutation.mockReset();
  state.session
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "local-test-only" } } });
  state.from.mockImplementation((table: string) => {
    const filters: unknown[][] = [];
    queries.push({ table, filters });
    const q = {
      select: () => q,
      eq: (...args: unknown[]) => {
        filters.push(args);
        return q;
      },
      order: () =>
        Promise.resolve({
          data: [
            {
              id: id(6),
              scenario_id: id(4),
              version: 2,
              calculation_version: "mountain-v5-volume",
              assumptions: phase1Case(),
            },
            {
              id: id(5),
              scenario_id: id(4),
              version: 1,
              calculation_version: "mountain-v5-volume",
              assumptions: phase1Case({ years: 3, exitYear: 3 }),
            },
          ],
          error: null,
        }),
    };
    return q;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ExternalBudgetsPage />
    </QueryClientProvider>,
  );
  return client;
}
async function selectProject() {
  fireEvent.change(screen.getByLabelText("Greenfields project"), { target: { value: id(1) } });
  await screen.findByLabelText("Budget name");
}
it("scopes projects to the active membership and source versions to the selected organization and scenario", async () => {
  mount();
  expect(screen.queryByText("Other organization project")).toBeNull();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
  expect(queries[0]).toEqual({
    table: "scenario_assumptions",
    filters: [
      ["organization_id", id(2)],
      ["scenario_id", id(4)],
    ],
  });
});
it("selects exact historical internal versions without mutating assumptions or requesting an internal save", async () => {
  mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
  fireEvent.change(screen.getByLabelText("Internal saved version"), { target: { value: id(5) } });
  expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(5));
  expect(screen.getByText(/Year 8 is outside/)).toBeTruthy();
  expect(state.mutation).not.toHaveBeenCalled();
});
it("passes the authenticated bearer token and exact source selection to the approved mutation endpoint", async () => {
  state.mutation.mockRejectedValue(new Error("Synthetic server rejection"));
  mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Draft A" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(state.mutation.mock.calls[0]![0]).toMatchObject({
    data: {
      operation: "create",
      projectId: id(1),
      source: { scenarioId: id(4), assumptionId: id(6) },
    },
    headers: { Authorization: "Bearer local-test-only" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic server rejection");
});
it("allows unlinked incomplete drafts but never sends unauthenticated writes", async () => {
  state.session.mockResolvedValue({ data: { session: null } });
  mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Unlinked draft" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sign in again"));
  expect(state.mutation).not.toHaveBeenCalled();
});
it("does not show write controls to a viewer", async () => {
  state.role = "viewer";
  mount();
  await selectProject();
  expect(screen.getByText("Viewer access · read only.")).toBeTruthy();
  expect(screen.queryByText("Save draft")).toBeNull();
});
it("shows missing persistence infrastructure as an error instead of running a migration or displaying an empty success", async () => {
  state.list.mockRejectedValue({ message: "relation external_budget does not exist" });
  mount();
  fireEvent.change(screen.getByLabelText("Greenfields project"), { target: { value: id(1) } });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("separately approved Stage 2 migration"),
  );
  expect(screen.queryByLabelText("Budget name")).toBeNull();
  expect(state.mutation).not.toHaveBeenCalled();
});
it("resolves named budgets from their exact current version and selects historical external versions", async () => {
  const header = { id: id(10), current_version_id: id(11), archived_at: null };
  const v = {
    id: id(11),
    budget_id: id(10),
    version: 2,
    name: "Budget named by operator",
    description: null,
    source_info: {},
    input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
    action: "save",
    source_scenario_id: null,
    source_assumption_id: null,
  };
  state.list.mockResolvedValue([header]);
  state.version.mockResolvedValue(v);
  state.history.mockResolvedValue([v, { ...v, id: id(12), version: 1 }]);
  mount();
  await selectProject();
  expect(state.version).toHaveBeenCalledWith(id(1), id(10), id(11));
  fireEvent.change(screen.getByLabelText("Named external budget"), { target: { value: id(10) } });
  await waitFor(() => expect(screen.getByLabelText("External saved version")).toHaveValue(id(11)));
  fireEvent.change(screen.getByLabelText("External saved version"), { target: { value: id(12) } });
  expect(screen.getByLabelText("Budget name")).toBeDisabled();
});

it("pins the selected version during background header refresh and retains unsaved edits", async () => {
  const h = { id: id(10), current_version_id: id(11), archived_at: null };
  const v = {
    id: id(11),
    budget_id: id(10),
    version: 1,
    name: "Original budget",
    description: null,
    source_info: {},
    input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
    action: "create",
    source_scenario_id: null,
    source_assumption_id: null,
  };
  state.list.mockResolvedValue([h]);
  state.version.mockResolvedValue(v);
  state.history.mockResolvedValue([v]);
  const client = mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Named external budget"), { target: { value: id(10) } });
  await waitFor(() => expect(screen.getByLabelText("Budget name")).toHaveValue("Original budget"));
  fireEvent.change(screen.getByLabelText("Budget name"), {
    target: { value: "Keep my unsaved edit" },
  });
  client.setQueryData(["external-budget-list", id(3), id(2), id(1)], {
    headers: [{ ...h, current_version_id: id(12) }],
    names: { [id(10)]: "Newer name" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Budget name")).toHaveValue("Keep my unsaved edit"),
  );
  expect(screen.getByLabelText("External saved version")).toHaveValue(id(11));
  expect(state.mutation).not.toHaveBeenCalled();
});
it("prevents changing project and source selection while a save is in flight", async () => {
  let rejectSave: (e: Error) => void = () => {};
  state.mutation.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "In flight" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Greenfields project")).toBeDisabled();
  expect(screen.getByLabelText("Internal saved scenario")).toBeDisabled();
  rejectSave(new Error("Synthetic failure"));
  await waitFor(() => expect(screen.getByLabelText("Greenfields project")).not.toBeDisabled());
  expect(screen.getByLabelText("Budget name")).toHaveValue("In flight");
});
