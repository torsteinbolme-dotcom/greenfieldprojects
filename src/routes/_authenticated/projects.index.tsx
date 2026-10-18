import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject, deleteProject, duplicateProject, logAudit, useMembership, useProjects, type ProjectRow } from "@/lib/data";
import { projectMountain } from "@/exampleProject";
import { blankAssumptions } from "@/lib/model";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — Cable Car Portfolio" }, { name: "description", content: "Create, duplicate, archive and edit cable car projects." }, { property: "og:title", content: "Projects" }, { property: "og:description", content: "Manage cable car projects." }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const { data: m } = useMembership();
  const { data: projects = [], isLoading } = useProjects();
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rename, setRename] = useState<ProjectRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<ProjectRow | null>(null);
  const canEdit = m?.role !== "viewer";
  const refresh = () => qc.invalidateQueries();

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const list = projects.filter((p) => (showArchived ? true : p.status === "active"));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Projects</p><h1 className="mt-1 text-3xl font-semibold">All projects</h1></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          {canEdit && <Button onClick={() => setCreateOpen(true)}>New project</Button>}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-md border bg-card">
        <table className="fin-table">
          <thead><tr><th>Name</th><th>Location</th><th>Status</th><th>Updated</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-muted-foreground">Loading…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={5} className="text-muted-foreground">No projects yet.</td></tr>}
            {list.map((p) => (
              <tr key={p.id}>
                <td><Link to="/projects/$projectId" params={{ projectId: p.id }} className="font-medium text-primary hover:underline">{p.name}</Link></td>
                <td>{p.location ?? "—"}</td>
                <td><span className={p.status === "archived" ? "text-muted-foreground" : "text-success"}>{p.status}</span></td>
                <td className="num">{new Date(p.updated_at).toLocaleDateString()}</td>
                <td className="text-right">
                  {canEdit && m && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild><Link to="/projects/$projectId" params={{ projectId: p.id }}>Edit</Link></Button>
                      <Button size="sm" variant="ghost" onClick={() => setRename(p)}>Rename</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => duplicateProject(m.organization_id, p), "Project duplicated")}>Duplicate</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(async () => {
                        const status = p.status === "active" ? "archived" : "active";
                        const { error } = await supabase.from("projects").update({ status, updated_at: new Date().toISOString() }).eq("id", p.id);
                        if (error) throw error;
                        await logAudit(m.organization_id, "project", p.id, status);
                      }, p.status === "active" ? "Archived" : "Restored")}>{p.status === "active" ? "Archive" : "Unarchive"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(p)}>Delete</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {m && <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(name, loc, tpl) => run(async () => {
        const a = tpl === "mountain" ? { ...projectMountain, name } : blankAssumptions(name);
        const notes = tpl === "mountain" ? "Copied from the Project Mountain example; illustrative assumptions not from the original workbook must be verified." : null;
        await createProject(m.organization_id, name, loc || null, a, notes ?? undefined);
        setCreateOpen(false);
      }, "Project created")} />}

      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (!name || !rename || !m) return;
            run(async () => {
              const { error } = await supabase.from("projects").update({ name, updated_at: new Date().toISOString() }).eq("id", rename.id);
              if (error) throw error;
              await logAudit(m.organization_id, "project", rename.id, "renamed", { name });
              setRename(null);
            }, "Renamed");
          }}>
            <Input name="name" defaultValue={rename?.name} autoFocus />
            <DialogFooter className="mt-4"><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {confirmDel?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes the project, all scenarios, version history and attached files.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDel && m && run(async () => { await deleteProject(m.organization_id, confirmDel.id); setConfirmDel(null); }, "Deleted")}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string, loc: string, tpl: string) => void }) {
  const [tpl, setTpl] = useState("mountain");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const name = String(f.get("name") ?? "").trim();
          if (name) onCreate(name, String(f.get("loc") ?? ""), tpl);
        }}>
          <div className="space-y-2"><Label>Name</Label><Input name="name" required autoFocus /></div>
          <div className="space-y-2"><Label>Location</Label><Input name="loc" /></div>
          <div className="space-y-2"><Label>Starting assumptions</Label>
            <Select value={tpl} onValueChange={setTpl}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mountain">Copy of Project Mountain example</SelectItem>
                <SelectItem value="blank">Minimal starter (one segment, one CAPEX line)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit">Create</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
