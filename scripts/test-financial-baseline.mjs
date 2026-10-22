// Canonical test runtime only; no financial calculations or fixture updates.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const expected = "24.19.0";
if (process.versions.bun || process.versions.node !== expected) {
  console.error(
    `Financial baseline requires Node ${expected}; received ${process.versions.bun ? `Bun ${process.versions.bun}` : process.version}. See docs/financial-engine-v1/testing.md.`,
  );
  process.exit(1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
console.log(
  `Financial baseline: Node ${process.versions.node}, V8 ${process.versions.v8}, ${process.platform}/${process.arch}`,
);
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run",
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
