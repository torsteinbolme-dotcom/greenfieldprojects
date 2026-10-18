import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/comparison")({
  component: ComparisonLayout,
});

function ComparisonLayout() {
  return <Outlet />;
}
