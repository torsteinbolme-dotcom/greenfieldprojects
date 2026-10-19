import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapacitySection } from "@/components/editor/capacity";
import { projectMountain } from "@/exampleProject";
import { EQUAL_ALLOCATION } from "@/lib/capacity";
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
});