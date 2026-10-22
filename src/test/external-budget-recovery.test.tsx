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
it("acceptance: keeps unsaved draft after background list failure and recovery", async () => {
  const { act } = await import("@testing-library/react");
  const client = mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Budget name"), {
    target: { value: "Do not lose this draft" },
  });
  state.list.mockRejectedValue(new Error("Synthetic temporary network failure"));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["external-budget-list", id(3), id(2), id(1)] });
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Synthetic temporary network failure"),
  );
  state.list.mockResolvedValue([]);
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["external-budget-list", id(3), id(2), id(1)] });
  });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByLabelText("Budget name")).toHaveValue("Do not lose this draft");
});
it("acceptance: does not change selected source version when a newer source arrives in background", async () => {
  const { act } = await import("@testing-library/react");
  const client = mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
  fireEvent.change(screen.getByLabelText("Budget name"), {
    target: { value: "Prepared with version 2" },
  });
  const old = client.getQueryData<unknown[]>(["budget-source", id(3), id(2), id(1), id(4)])!;
  await act(async () => {
    client.setQueryData(
      ["budget-source", id(3), id(2), id(1), id(4)],
      [
        {
          id: id(7),
          scenario_id: id(4),
          version: 3,
          calculation_version: "mountain-v5-volume",
          assumptions: phase1Case({ debtShare: 0.2 }),
        },
        ...old,
      ],
    );
  });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: new RegExp("Version 3") })).toBeTruthy(),
  );
  expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6));
});

function prepareSavedBudget() {
  const h = { id: id(10), current_version_id: id(11), archived_at: null };
  const v = {
    id: id(11),
    budget_id: id(10),
    version: 2,
    name: "Saved budget",
    description: null,
    source_info: {},
    input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
    action: "save",
    source_scenario_id: id(4),
    source_assumption_id: id(6),
  };
  state.list.mockResolvedValue([h]);
  state.version.mockResolvedValue(v);
  state.history.mockResolvedValue([v]);
  return { h, v };
}
async function chooseSavedBudget() {
  await selectProject();
  fireEvent.change(screen.getByLabelText("Named external budget"), { target: { value: id(10) } });
  await waitFor(() => expect(screen.getByLabelText("External saved version")).toHaveValue(id(11)));
}

it.each(["list", "history"] as const)(
  "keeps the entire editor mounted through a failed background %s refresh and explicit retry",
  async (kind) => {
    const { act } = await import("@testing-library/react");
    prepareSavedBudget();
    const client = mount();
    await chooseSavedBudget();
    fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Unsaved name" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Unsaved description" },
    });
    fireEvent.change(screen.getByLabelText("All-in initial CAPEX (NOK)"), {
      target: { value: "1234,56789" },
    });
    fireEvent.change(screen.getByLabelText("Year 3 Passengers"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Year 4 Realized net ticket"), {
      target: { value: "21,98765" },
    });
    fireEvent.click(screen.getByText("Advanced · source references and accounting scope"));
    fireEvent.change(screen.getByLabelText("Source notes"), {
      target: { value: "Unsaved provenance" },
    });
    const confirmation = screen.getByLabelText("Initial CAPEX is all-in, including contingency.");
    fireEvent.click(confirmation);
    const nameInput = screen.getByLabelText("Budget name");
    state[kind].mockRejectedValue(new Error("Synthetic background outage"));
    const queryKey =
      kind === "list"
        ? ["external-budget-list", id(3), id(2), id(1)]
        : ["external-budget-history", id(3), id(2), id(1), id(10)];
    await act(async () => {
      await client.invalidateQueries({ queryKey });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Background refresh failed"),
    );
    const assertPreserved = () => {
      expect(screen.getByLabelText("Budget name")).toBe(nameInput);
      expect(nameInput).toHaveValue("Unsaved name");
      expect(screen.getByLabelText("Description")).toHaveValue("Unsaved description");
      expect(screen.getByLabelText("All-in initial CAPEX (NOK)")).toHaveValue("1234,56789");
      expect(screen.getByLabelText("Year 3 Passengers")).toHaveValue("0");
      expect(screen.getByLabelText("Year 4 Realized net ticket")).toHaveValue("21,98765");
      expect(screen.getByLabelText("Source notes")).toHaveValue("Unsaved provenance");
      expect(confirmation).toBeChecked();
      expect(confirmation.closest("details")).toHaveAttribute("open");
      expect(screen.getByLabelText("External saved version")).toHaveValue(id(11));
    };
    assertPreserved();
    const { h, v } = prepareSavedBudget();
    state[kind].mockResolvedValue(kind === "list" ? [h] : [v]);
    fireEvent.click(
      screen.getByRole("button", {
        name: kind === "list" ? "Retry external budget list" : "Retry external budget history",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    assertPreserved();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Named external budget"), { target: { value: "" } });
    expect(screen.getByLabelText("External saved version")).toHaveValue(id(11));
    expect(nameInput).toHaveValue("Unsaved name");
    expect(state.mutation).not.toHaveBeenCalled();
  },
);
it.each(["list", "history"] as const)(
  "distinguishes initial %s failure and retries without inventing an editor",
  async (kind) => {
    prepareSavedBudget();
    if (kind === "list") state.list.mockRejectedValue(new Error("Synthetic initial outage"));
    else state.history.mockRejectedValue(new Error("Synthetic initial outage"));
    mount();
    fireEvent.change(screen.getByLabelText("Greenfields project"), { target: { value: id(1) } });
    if (kind === "history") {
      await screen.findByLabelText("Named external budget");
      fireEvent.change(screen.getByLabelText("Named external budget"), {
        target: { value: id(10) },
      });
    }
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Initial loading failed"),
    );
    expect(screen.queryByLabelText("Budget name")).toBeNull();
    const { h, v } = prepareSavedBudget();
    state[kind].mockResolvedValue(kind === "list" ? [h] : [v]);
    fireEvent.click(
      screen.getByRole("button", {
        name: kind === "list" ? "Retry external budget list" : "Retry external budget history",
      }),
    );
    await screen.findByLabelText("Budget name");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state.mutation).not.toHaveBeenCalled();
  },
);
async function chooseSource() {
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
}
async function addSourceVersion(client: QueryClient) {
  const { act } = await import("@testing-library/react");
  const key = ["budget-source", id(3), id(2), id(1), id(4)];
  const old = client.getQueryData<unknown[]>(key)!;
  await act(async () => {
    client.setQueryData(key, [
      {
        id: id(7),
        scenario_id: id(4),
        version: 3,
        calculation_version: "mountain-v5-volume",
        assumptions: phase1Case({ debtShare: 0.2 }),
      },
      ...old,
    ]);
  });
  await waitFor(() => expect(screen.getByRole("option", { name: /Version 3/ })).toBeTruthy());
}
it("creates against the pinned source after a new version arrives and changes only on deliberate selection", async () => {
  state.mutation.mockRejectedValue(new Error("Synthetic server rejection"));
  const client = mount();
  await selectProject();
  await chooseSource();
  await addSourceVersion(client);
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Pinned draft" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(state.mutation.mock.calls[0]![0].data.source).toEqual({
    scenarioId: id(4),
    assumptionId: id(6),
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.change(screen.getByLabelText("Internal saved version"), { target: { value: id(7) } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(2));
  expect(state.mutation.mock.calls[1]![0].data.source).toEqual({
    scenarioId: id(4),
    assumptionId: id(7),
  });
});
it("uses the same pinned UUID for explicit inheritance refresh despite a newer source", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  prepareSavedBudget();
  state.mutation.mockRejectedValue(new Error("Synthetic server rejection"));
  const client = mount();
  await chooseSavedBudget();
  await chooseSource();
  await addSourceVersion(client);
  fireEvent.click(screen.getByText("Refresh inheritance explicitly"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(state.mutation.mock.calls[0]![0].data).toMatchObject({
    operation: "refresh",
    source: { scenarioId: id(4), assumptionId: id(6) },
  });
});
it("reports an unavailable pin, keeps its identity and blocks accidental unlinked creation until deliberate replacement", async () => {
  const { act } = await import("@testing-library/react");
  const client = mount();
  await selectProject();
  await chooseSource();
  await act(async () => {
    client.setQueryData(
      ["budget-source", id(3), id(2), id(1), id(4)],
      [
        {
          id: id(7),
          scenario_id: id(4),
          version: 3,
          calculation_version: "mountain-v5-volume",
          assumptions: phase1Case(),
        },
      ],
    );
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Pinned internal assumption version"),
  );
  expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6));
  expect(screen.getByText("Save complete budget")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Still my draft" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("alert")
        .some((e) => e.textContent?.includes("before creating or refreshing")),
    ).toBe(true),
  );
  expect(state.mutation).not.toHaveBeenCalled();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  state.mutation.mockRejectedValue(new Error("Synthetic server rejection"));
  fireEvent.change(screen.getByLabelText("Internal saved version"), { target: { value: id(7) } });
  expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(7));
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(state.mutation.mock.calls[0]![0].data.source.assumptionId).toBe(id(7));
});
it("allows a saved budget to retain pinned inheritance when the internal source becomes unavailable", async () => {
  const { act } = await import("@testing-library/react");
  prepareSavedBudget();
  const client = mount();
  await chooseSavedBudget();
  await chooseSource();
  await act(async () => {
    client.setQueryData(["budget-source", id(3), id(2), id(1), id(4)], []);
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Pinned internal assumption version"),
  );
  expect(screen.getByText("Refresh inheritance explicitly")).toBeDisabled();
  state.mutation.mockRejectedValue(new Error("Synthetic server rejection"));
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(state.mutation).toHaveBeenCalledTimes(1));
  expect(state.mutation.mock.calls[0]![0].data.operation).toBe("save");
  expect(state.mutation.mock.calls[0]![0].data).not.toHaveProperty("source");
});
it("pins only after an initial source retry succeeds, then retains that UUID", async () => {
  state.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => Promise.resolve({ data: null, error: new Error("Synthetic source outage") }),
    };
    return q;
  });
  const client = mount();
  await selectProject();
  fireEvent.change(screen.getByLabelText("Internal saved scenario"), { target: { value: id(4) } });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Initial loading failed"),
  );
  expect(screen.getByLabelText("Internal saved version")).toHaveValue("");
  state.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
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
          ],
          error: null,
        }),
    };
    return q;
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry internal versions" }));
  await waitFor(() => expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6)));
  await addSourceVersion(client);
  expect(screen.getByLabelText("Internal saved version")).toHaveValue(id(6));
});
