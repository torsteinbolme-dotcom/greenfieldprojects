// Read-only cross-runtime diagnostic. Never regenerates approved fixtures.
import type { Assumptions } from "../src/financialEngine";
import { safeCalculate } from "../src/lib/model";
import { irrAtYear, moicAtYear } from "../src/lib/portfolio";
import { projectReturns } from "../src/lib/year3";
import saved from "../src/test/fixtures/saved-scenarios-baseline.json";
import investments from "../src/test/fixtures/production-investments.json";
import { createHash } from "node:crypto";
const cases = [
  ...saved.map((x, i) => ({ id: `saved-${i}`, a: x.assumptions })),
  ...Object.entries(investments).map(([id, a]) => ({ id: `investment-${id}`, a })),
];
const bits = (x: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(x);
  return b.toString("hex");
};
type NumericLeaves = Record<string, { value: number; bits: string }>;
const leaves = (v: unknown, path = "", out: NumericLeaves = {}): NumericLeaves => {
  if (typeof v === "number") out[path] = { value: v, bits: bits(v) };
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, out);
  return out;
};
console.log(
  JSON.stringify({
    runtime: { version: process.version, versions: process.versions },
    probes: [1.025, 1.03, 1.1].flatMap((x) =>
      [2, 3, 8, 14].map((n) => ({ x, n, value: Math.pow(x, n), bits: bits(Math.pow(x, n)) })),
    ),
    cases: cases.map(({ id, a }) => {
      const { result: r, error } = safeCalculate(a as unknown as Assumptions);
      if (!r) throw Error(error!);
      const value = {
        engine: r,
        y8irr: irrAtYear(a as unknown as Assumptions, r),
        y8moic: moicAtYear(a as unknown as Assumptions, r),
        project: projectReturns(a as unknown as Assumptions, r),
      };
      return {
        id,
        engineSha256: createHash("sha256").update(JSON.stringify(r)).digest("hex"),
        leaves: leaves(value),
      };
    }),
  }),
);
