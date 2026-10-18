import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAutosave } from "@/hooks/use-autosave";
import { SaveControls } from "@/components/editor/save-controls";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/editor/sections";
import { useMembership, type Membership } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Cable Car Portfolio" }, { name: "description", content: "Organization, members and activity log." }, { property: "og:title", content: "Settings — Cable Car Portfolio" }, { property: "og:description", content: "Organization settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: m } = useMembership();
  const members = useQuery({ enabled: !!m, queryKey: ["members"], queryFn: async () => (await supabase.from("organization_members").select("*").order("created_at")).data ?? [] });
  const audit = useQuery({ enabled: !!m, queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [] });
  if (!m) return null;
  const admin = m.role === "admin";
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Settings</p><h1 className="mt-1 text-3xl font-semibold">Organization</h1></div>
      <Card title="Organization name">
        <OrganizationName m={m} />
      </Card>
      <Card title="Members">
        <table className="fin-table">
          <thead><tr><th>Email</th><th>Role</th></tr></thead>
          <tbody>{members.data?.map((x) => (
            <tr key={x.user_id}><td>{x.email}</td><td>
              {admin && x.user_id !== m.user_id ? (
                <select className="h-8 rounded-md border bg-background px-2 text-sm" defaultValue={x.role} onChange={async (e) => {
                  const { error } = await supabase.from("organization_members").update({ role: e.target.value as "admin" | "editor" | "viewer" }).eq("organization_id", x.organization_id).eq("user_id", x.user_id);
                  if (error) toast.error(error.message); else toast.success("Role updated");
                }}><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select>
              ) : x.role}
            </td></tr>
          ))}</tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">Each new account gets its own organization. Inviting colleagues into an existing organization is not yet available.</p>
      </Card>
      <Card title="Activity log (latest 50)">
        <table className="fin-table">
          <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{audit.data?.map((a) => (
            <tr key={a.id}><td>{new Date(a.created_at).toLocaleString()}</td><td>{a.entity_type}</td><td>{a.action}</td><td className="text-xs text-muted-foreground">{a.details ? JSON.stringify(a.details) : ""}</td></tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function OrganizationName({ m }: { m: Membership }) {
  const qc = useQueryClient();
  const { controller, state } = useAutosave(m.organization_id, m.org_name, async (name) => {
    if (!name.trim()) throw new Error("Organization name cannot be empty");
    const { error } = await supabase.from("organizations").update({ name: name.trim() }).eq("id", m.organization_id);
    if (error) throw error;
    void qc.invalidateQueries({ queryKey: ["membership"] });
  });
  if (!controller || !state) return null;
  return <div className="flex max-w-lg flex-wrap items-center gap-2">
    <Input className="min-w-48 flex-1" name="name" value={state.value} disabled={m.role !== "admin"} onChange={(e) => controller.edit(e.target.value, "name")} />
    {m.role === "admin" && <SaveControls state={state} undo={controller.undo} retry={() => { void controller.flush(); }} />}
  </div>;
}
