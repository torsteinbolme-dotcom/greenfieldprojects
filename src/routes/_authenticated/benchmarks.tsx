import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/benchmarks")({
  head: () => ({ meta: [{ title: "Benchmarks — Cable Car Portfolio" }, { name: "description", content: "Industry benchmarks for cable car projects (coming soon)." }, { property: "og:title", content: "Benchmarks" }, { property: "og:description", content: "Coming soon." }] }),
  component: () => (
    <div className="max-w-xl">
      <p className="eyebrow">Coming soon</p>
      <h1 className="mt-2 text-3xl font-semibold">Benchmarks</h1>
      <p className="mt-4 text-muted-foreground">
        Reference data for ticket prices, passenger volumes, OPEX per passenger and CAPEX per metre from comparable installations is planned for a later phase. Nothing on this page is calculated yet.
      </p>
    </div>
  ),
});
