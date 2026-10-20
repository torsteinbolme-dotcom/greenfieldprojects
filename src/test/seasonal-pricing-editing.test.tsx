import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapacitySection } from "@/components/editor/capacity";
import { TicketPricingSection } from "@/components/editor/ticket-pricing";
import { initializeSeasonalPricing } from "@/lib/seasonal-pricing";
import { calculate, type Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
vi.mock("@/components/editor/sections", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/lib/seasonality", () => ({ useSeasonalityProfiles: () => ({ data: [] }) }));
afterEach(cleanup);

describe("seasonal settings and saved distribution interaction", () => {
  it("initializes current fares without changing forecast inputs", () => {
    const set = vi.fn(); render(<TicketPricingSection a={projectMountain} r={calculate(projectMountain)} ro={false} set={set} />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable Seasonal Ticket Pricing" }));
    expect(set).toHaveBeenCalledExactlyOnceWith({ seasonalPricing: initializeSeasonalPricing(projectMountain) });
  });
  it("changes annual revenue only after explicitly saving distribution and preserves seasonal settings", () => {
    const a = { ...projectMountain, initialPassengers: 1000, segments: [{ name: "Adult", share: 1, grossPrice: 100, vatRate: 0, commission: 0, boardingsPerGuest: 2 }], passengerGrowth: [0], priceGrowth: [0] };
    const p = initializeSeasonalPricing(a); p.months[0] = "high"; p.prices[0] = { segmentName: "Adult", low: 100, high: 200 };
    const values: Assumptions[] = [];
    function Harness() {
      const [value, update] = useState<Assumptions>({ ...a, seasonalPricing: p, capacity: { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: [0.6, 0.4, ...Array(10).fill(0)] } } as Assumptions);
      const set = (patch: Partial<Assumptions>) => { const next = { ...value, ...patch }; values.push(next); update(next); };
      return <><CapacitySection a={value} r={calculate(value)} ro={false} set={set} /><TicketPricingSection a={value} r={calculate(value)} ro={false} set={set} /></>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "January allocation" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("textbox", { name: "February allocation" }), { target: { value: "80" } });
    expect(values).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save Distribution" }));
    const saved = values[0]; if (!saved) throw Error("Missing save");
    expect(saved.seasonalPricing).toEqual(p); expect(calculate(saved).rows[0]?.ticketRevenue).toBeCloseTo(120000, 8);
    fireEvent.click(screen.getByRole("button", { name: "February high season" }));
    const changed = values.at(-1); if (!changed) throw Error("Missing edit");
    expect(calculate(changed).rows[0]?.ticketRevenue).toBeCloseTo(200000, 8);
  });
  it("prevents viewers from editing seasonal settings", () => {
    const set = vi.fn(); render(<TicketPricingSection a={projectMountain} r={null} ro set={set} />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable Seasonal Ticket Pricing" })); expect(set).not.toHaveBeenCalled();
  });
});