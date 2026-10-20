import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectMountain } from "@/exampleProject";
import { initializeSeasonalPricing } from "@/lib/seasonal-pricing";

const mocks = vi.hoisted(() => ({ read: vi.fn(), insert: vi.fn(), audit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: "actor" } } } }) },
  from: (table: string) => table === "audit_events" ? { insert: mocks.audit } : {
    select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mocks.read }) }) }) }),
    insert: mocks.insert,
  },
} }));
import { logAudit, saveAssumptionVersion } from "@/lib/data";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.audit.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("append-only save failure safeguards", () => {
  it("persists independent methods and inactive values only in the edited scenario", async () => {
    mocks.read.mockResolvedValue({ data: { version: 2 }, error: null });
    const methods = { fb: { revenue: { method: "perPassenger" as const, perPassenger: 125, annualAmount: 10000 }, opex: { method: "fixedVariable" as const, fixedAmount: 5000, variablePerPassenger: 90 } } };
    await saveAssumptionVersion("org", "volume-scenario", { ...projectMountain, volumeMethods: methods });
    await saveAssumptionVersion("org", "base-scenario", projectMountain);
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({ scenario_id: "volume-scenario", version: 3, calculation_version: "mountain-v5-volume", assumptions: { volumeMethods: methods } });
    expect(mocks.insert.mock.calls[1]?.[0].assumptions.volumeMethods).toBeUndefined();
  });
  it("persists scenario-specific seasonal prices and monthly assignments in new versions", async () => {
    mocks.read.mockResolvedValue({ data: { version: 2 }, error: null });
    const pricing = initializeSeasonalPricing(projectMountain); pricing.months[5] = "high";
    pricing.prices[0] = { segmentName: "Roundtrip adult", low: 699, high: 899 };
    await saveAssumptionVersion("org", "seasonal-scenario", { ...projectMountain, seasonalPricing: pricing });
    await saveAssumptionVersion("org", "flat-scenario", projectMountain);
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({ scenario_id: "seasonal-scenario", version: 3, assumptions: { seasonalPricing: pricing } });
    expect(mocks.insert.mock.calls[1]?.[0].assumptions.seasonalPricing).toBeUndefined();
  });
  it("does not insert version 1 when reading history fails", async () => {
    const error = { code: "42501", message: "History unavailable" };
    mocks.read.mockResolvedValue({ data: null, error });
    await expect(saveAssumptionVersion("org", "scenario", projectMountain)).rejects.toEqual(error);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("retries a concurrent version conflict without overwriting either version", async () => {
    mocks.read.mockResolvedValueOnce({ data: { version: 5 }, error: null }).mockResolvedValueOnce({ data: { version: 6 }, error: null });
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505" } }).mockResolvedValueOnce({ error: null });
    await expect(saveAssumptionVersion("org", "scenario", projectMountain)).resolves.toBe(7);
    expect(mocks.insert.mock.calls.map(([row]) => row.version)).toEqual([6, 7]);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("does not retry a denied write", async () => {
    mocks.read.mockResolvedValue({ data: { version: 2 }, error: null });
    mocks.insert.mockResolvedValue({ error: { code: "42501", message: "Denied" } });
    await expect(saveAssumptionVersion("org", "scenario", projectMountain)).rejects.toMatchObject({ code: "42501" });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("stops after three concurrent version collisions and surfaces the error", async () => {
    mocks.read.mockResolvedValue({ data: { version: 2 }, error: null });
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    await expect(saveAssumptionVersion("org", "scenario", projectMountain)).rejects.toMatchObject({ code: "23505" });
    expect(mocks.insert).toHaveBeenCalledTimes(3);
  });
  it("surfaces a failed audit write rather than silently claiming success", async () => {
    mocks.audit.mockResolvedValue({ error: { code: "42501", message: "Audit denied" } });
    await expect(logAudit("org", "scenario", "id", "saved")).rejects.toMatchObject({ code: "42501" });
  });
});