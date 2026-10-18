import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastSection } from "@/components/editor/sections";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";

describe("forecast input readiness", () => {
  it("does not crash before assumptions arrive and resumes rendering when supplied", () => {
    const result = calculate(projectMountain);
    let view: ReturnType<typeof render> | undefined;
    expect(() => {
      view = render(<ForecastSection r={result} a={undefined} />);
    }).not.toThrow();
    if (!view) throw new Error("Forecast did not mount");
    expect(() => view?.rerender(<ForecastSection r={result} a={projectMountain} />)).not.toThrow();
    view.unmount();
  });
});