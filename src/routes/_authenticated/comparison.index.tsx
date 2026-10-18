import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/comparison/")({
  validateSearch: z.object({ ids: z.string().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/comparison/projects", search: search.ids ? { ids: search.ids } : {} });
  },
});
