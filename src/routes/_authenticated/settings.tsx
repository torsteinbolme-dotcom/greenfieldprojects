import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAutosave } from "@/hooks/use-autosave";
import { SaveControls } from "@/components/editor/save-controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/editor/sections";
import { useMembership, type Membership } from "@/lib/data";
import { addOrgUser } from "@/lib/invites.functions";

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
      </Card>
      {admin && <InviteCard m={m} />}
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

function InviteCard({ m }: { m: Membership }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const invites = useQuery({
    queryKey: ["invites", m.organization_id],
    queryFn: async () => (await supabase.from("organization_invites").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await addOrgUser({ data: { organizationId: m.organization_id, email: email.trim(), role, origin: window.location.origin } });
      toast.success(res.emailed ? `Invitation emailed to ${email.trim()}.` : `${email.trim()} already has an account — they join this organization next time they sign in.`);
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setBusy(false);
    }
  }

  const pending = invites.data?.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date()) ?? [];
  return (
    <Card title="Add a user">
      <form onSubmit={createInvite} className="flex max-w-lg flex-wrap items-center gap-2">
        <Input className="min-w-48 flex-1" type="email" required placeholder="colleague@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
        </select>
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add user"}</Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">An invitation is emailed automatically. The person chooses a password from the email and joins this organization directly. Invitations expire after 14 days.</p>
      {pending.length > 0 && (
        <table className="fin-table mt-4">
          <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
          <tbody>{pending.map((i) => (
            <tr key={i.id}><td>{i.email}</td><td>
              <select className="h-8 rounded-md border bg-background px-2 text-sm" defaultValue={i.role} onChange={async (e) => {
                const { error } = await supabase.from("organization_invites").update({ role: e.target.value }).eq("id", i.id);
                if (error) toast.error(error.message); else { toast.success("Role updated"); void qc.invalidateQueries({ queryKey: ["invites"] }); }
              }}><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select>
            </td><td>{new Date(i.expires_at).toLocaleDateString()}</td><td>
              <button className="text-sm text-accent hover:underline" onClick={async () => {
                const { error } = await supabase.from("organization_invites").delete().eq("id", i.id);
                if (error) toast.error(error.message); else { toast.success("Invite revoked"); void qc.invalidateQueries({ queryKey: ["invites"] }); }
              }}>Revoke</button>
            </td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
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
