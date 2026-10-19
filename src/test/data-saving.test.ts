import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectMountain } from "@/exampleProject";

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