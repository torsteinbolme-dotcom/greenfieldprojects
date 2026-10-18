import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { BarChart3, Briefcase, FolderKanban, LogOut, Ruler, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMembership } from "@/lib/data";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

const nav = [
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/comparison", label: "Comparison", icon: BarChart3 },
  { to: "/benchmarks", label: "Benchmarks", icon: Ruler, soon: true },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Shell() {
  const { data: m } = useMembership();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-6">
          <p className="font-display text-lg text-sidebar-accent-foreground">Cable Car</p>
          <p className="eyebrow text-sidebar-primary">Portfolio</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {"soon" in n && <span className="rounded bg-sidebar-border px-1.5 text-[10px] uppercase">Soon</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-5 py-4 text-xs">
          <p className="truncate text-sidebar-accent-foreground">{m?.org_name}</p>
          <p className="truncate opacity-70">{m?.email} · {m?.role}</p>
          <button onClick={() => supabase.auth.signOut()} className="mt-3 flex items-center gap-2 opacity-80 hover:opacity-100">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="rounded px-3 py-1.5 text-sm text-sidebar-foreground" activeProps={{ className: "bg-sidebar-accent" }}>{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto max-w-[1400px] px-6 py-8"><Outlet /></main>
      </div>
    </div>
  );
}
