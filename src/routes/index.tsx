import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cable Car Portfolio — Infrastructure investment modelling" },
      { name: "description", content: "Model, compare and track cable car projects: passenger segments, CAPEX, 30-year forecasts and exit returns." },
      { property: "og:title", content: "Cable Car Portfolio" },
      { property: "og:description", content: "Model, compare and track cable car infrastructure investments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <p className="eyebrow">Cable Car Portfolio</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-primary md:text-6xl">
          Infrastructure returns, modelled line by line.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Passenger segments, CAPEX, 30-year forecasts, financing and exit analysis for every cable car in your portfolio — compared on equal terms.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg"><Link to="/portfolio">Open portfolio</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
        </div>
        <dl className="mt-20 grid grid-cols-2 gap-8 border-t pt-8 md:grid-cols-4">
          {[["30-year", "forecast horizon"], ["NOK m", "reporting unit"], ["Versioned", "scenario history"], ["Org-scoped", "data access"]].map(([a, b]) => (
            <div key={a}><dt className="font-display text-2xl text-primary">{a}</dt><dd className="text-sm text-muted-foreground">{b}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
