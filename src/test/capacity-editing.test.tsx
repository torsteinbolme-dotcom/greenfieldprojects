import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapacitySection } from "@/components/editor/capacity";
import { projectMountain } from "@/exampleProject";
import { EQUAL_ALLOCATION, type WithCapacity } from "@/lib/capacity";
import type { Assumptions } from "@/financialEngine";

vi.mock("@/components/editor/sections", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/lib/seasonality", () => ({ useSeasonalityProfiles: () => ({ data: [] }), profileValid: () => true }));
afterEach(cleanup);
const saved: Assumptions = { ...projectMountain, capacity: { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: Array.from({ length: 12 }, (_, i) => i === 0 ? 0.45 : 0.05) } } as Assumptions;

describe("explicit distribution editing", () => {
  it("allows invalid drafts and cancel restores saved amounts without saving", () => {
    const set = vi.fn();
    render(<CapacitySection a={saved} r={null} ro={false} set={set} />);
    fireEvent.change(screen.getByRole("textbox", { name: "January allocation" }), { target: { value: "50" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "January allocation" }));
    expect(set).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Distribution" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel Changes" }));
    expect(screen.getByRole("textbox", { name: "January allocation" })).toHaveValue("45");
    expect(set).not.toHaveBeenCalled();
  });

  it("saves valid replacements only on confirmation and preserves other capacity inputs", () => {
    const set = vi.fn();
    render(<CapacitySection a={saved} r={null} ro={false} set={set} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset to equal distribution" }));
    expect(set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Distribution" }));
    expect(set).toHaveBeenCalledExactlyOnceWith({ capacity: { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION } });
  });

  it("manual edits preserve frozen benchmark attribution", () => {
    const source = { benchmark: "Fjellheisen", profile: "2025 Growth-Adjusted", year: 2025, normalizationStatus: "normalized" as const, method: "Normalized estimate" };
    const a: WithCapacity = { ...saved, capacity: { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: Array.from({ length: 12 }, (_, i) => i === 0 ? 0.45 : 0.05), seasonalitySource: source } };
    const set = vi.fn();
    render(<CapacitySection a={a} r={null} ro={false} set={set} />);
    for (const [month, value] of [["January", "44"], ["February", "6"]]) {
      const input = screen.getByRole("textbox", { name: `${month} allocation` });
      fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
    }
    fireEvent.click(screen.getByRole("button", { name: "Save Distribution" }));
    expect(set).toHaveBeenCalledWith({ capacity: expect.objectContaining({ seasonalitySource: source, monthlyAllocation: [0.44, 0.06, ...Array.from({ length: 10 }, () => 0.05)] }) });
  });

  it("cancel restores attribution after reset; explicit reset saves as manual", () => {
    const source = { benchmark: "Fjellheisen", profile: "2025 Growth-Adjusted", year: 2025, normalizationStatus: "normalized" as const, method: null };
    const a: WithCapacity = { ...saved, capacity: { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION, seasonalitySource: source } };
    const set = vi.fn();
    render(<CapacitySection a={a} r={null} ro={false} set={set} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset to equal distribution" }));
    expect(screen.getByRole("button", { name: "Save Distribution" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel Changes" }));
    expect(screen.getByRole("button", { name: "Save Distribution" })).toBeDisabled();
    expect(set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset to equal distribution" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Distribution" }));
    expect(set).toHaveBeenCalledExactlyOnceWith({ capacity: { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION, seasonalitySource: null } });
  });
});