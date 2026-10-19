import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GrowthList } from "@/components/editor/inputs";

const inputFor = (label: string) => {
  const span = screen.getByText(label);
  const input = span.parentElement?.querySelector("input");
  if (!input) throw new Error(`No input for ${label}`);
  return input;
};

describe("growth list year fields", () => {
  it("pads saved three-value lists to Year 2–5 plus a Year 6+ field", () => {
    render(<GrowthList values={[0.2, 0.15, 0.03]} onChange={() => {}} />);
    for (const label of ["Year 2", "Year 3", "Year 4", "Year 5", "Year 6+"]) {
      expect(inputFor(label)).toBeTruthy();
    }
  });

  it("stores a Year 5 edit in the fifth entry and keeps Year 6+ at the prior value", () => {
    const onChange = vi.fn();
    render(<GrowthList values={[0.2, 0.15, 0.03]} onChange={onChange} />);
    fireEvent.change(inputFor("Year 5"), { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith([0.2, 0.15, 0.03, 0.05, 0.03]);
  });

  it("does not shrink below the five base years with − year", () => {
    render(<GrowthList values={[0.2, 0.15, 0.03]} onChange={() => {}} />);
    expect(screen.queryByText("− year")).toBeNull();
  });
});
