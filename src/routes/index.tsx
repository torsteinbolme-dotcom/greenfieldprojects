import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logoDark from "@/assets/brand/logo-dark.svg";

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
  const navigate = useNavigate();
  useEffect(() => {
    // Returning from Google sign-in lands here; send signed-in users straight to their projects.
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/projects" }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (s && e === "SIGNED_IN") navigate({ to: "/projects" }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-16">
        <div className="flex flex-1 flex-col justify-center">
        <img src={logoDark} alt="Norwegian Travel" className="h-auto w-64 md:w-80" />
        <p className="eyebrow mt-10">Cable Car Portfolio</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-primary md:text-6xl">
          Infrastructure returns, modelled line by line.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Passenger segments, CAPEX, 30-year forecasts, financing and exit analysis for every cable car in your portfolio — compared on equal terms.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Sign in</Link></Button>
        </div>
        <p className="mt-6 max-w-xl border-l-2 border-accent pl-4 text-sm italic text-muted-foreground">
          “You shall not pass!” — the gatekeeper at the bottom station, to anyone without a login. (Ticket holders ride straight up.)
        </p>
        </div>
        <footer className="mt-16 border-t border-border pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            This site contains confidential and proprietary information and is the exclusive property of Norwegian Travel Company. The site and its contents may be shared with third parties or outsiders only with explicit authorisation and should otherwise be treated as confidential information intended for internal distribution within The Norwegian Travel Company.
          </p>
        </footer>
      </div>
    </div>
  );
}
