import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject, deleteProject, duplicateProject, logAudit, useMembership, useProjects, type ProjectRow } from "@/lib/data";
import { coverSrc } from "@/lib/covers";
import { uploadCover, useCoverUrls } from "@/lib/covers-client";
import { projectMountain } from "@/exampleProject";
import { blankAssumptions, withDefaultProjectSegments } from "@/lib/model";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — Cable Car Portfolio" }, { name: "description", content: "Create, duplicate, archive and edit cable car projects." }, { property: "og:title", content: "Projects — Cable Car Portfolio" }, { property: "og:description", content: "Manage cable car projects." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const { data: m } = useMembership();
  const { data: projects = [], isLoading } = useProjects();
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ProjectRow | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const canEdit = m?.role !== "viewer";
  const refresh = () => qc.invalidateQueries();

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const list = projects.filter((p) => (showArchived ? true : p.status === "active"));
  const { data: signed = {} } = useCoverUrls(list.map((p) => p.cover_image_url));

  const setPhoto = async (p: ProjectRow, file: File) => {
    if (!m) return;
    setUploading(p.id);
    try {
      await uploadCover(m.organization_id, p.id, file);
      toast.success("Photo updated");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the photo");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Projects</p><h1 className="mt-1 text-3xl font-semibold">All projects</h1></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          {canEdit && <Button onClick={() => setCreateOpen(true)}>New project</Button>}
        </div>
      </div>

      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {!isLoading && list.length === 0 && <p className="mt-6 text-muted-foreground">No projects yet.</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <article key={p.id} className="group overflow-hidden rounded-md border bg-card shadow-sm transition hover:shadow-md">
            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
              <Link
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                aria-label={`Open ${p.name}`}
                className="absolute inset-0 block"
              >
                <img
                  src={coverSrc(p, signed)}
                  alt={`${p.name} photo`}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </Link>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/25 to-transparent" />
              <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-card/85 px-2.5 py-1 text-xs font-medium text-card-foreground">{p.location ?? "No location"}</span>
                <span className={p.status === "archived" ? "rounded-full bg-card/85 px-2.5 py-1 text-xs font-medium text-muted-foreground" : "rounded-full bg-card/85 px-2.5 py-1 text-xs font-medium text-success"}>{p.status}</span>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium text-card-foreground opacity-0 shadow-sm transition duration-200 group-hover:opacity-100">Open project</span>
              </div>
              {canEdit && (
                <div className="absolute right-3 top-3 z-10">
                  <Button size="icon" variant="ghost" className="h-8 w-8 bg-card/85 text-card-foreground hover:bg-card"
                    aria-label={`${p.cover_image_url ? "Change" : "Add"} photo for ${p.name}`}
                    title={uploading === p.id ? "Saving photo…" : p.cover_image_url ? "Change photo" : "Add photo"}
                    disabled={uploading === p.id}
                    onClick={() => document.getElementById(`project-photo-${p.id}`)?.click()}>
                    {uploading === p.id ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <MoreHorizontal className="h-5 w-5" />}
                  </Button>
                  <input id={`project-photo-${p.id}`}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading === p.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void setPhoto(p, f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="pointer-events-auto text-lg font-semibold text-primary-foreground hover:underline">
                  {p.name}
                </Link>
                <p className="text-xs text-primary-foreground/80">Updated {new Date(p.updated_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-end p-2">
              {canEdit && m && (
                <div className="flex flex-nowrap items-center justify-end gap-0 overflow-x-auto">
                  <Button size="sm" variant="ghost" className="px-2 text-xs" asChild><Link to="/projects/$projectId" params={{ projectId: p.id }}>Open</Link></Button>
                  <Button size="sm" variant="ghost" className="px-2 text-xs" onClick={() => run(() => duplicateProject(m.organization_id, p), "Project duplicated")}>Duplicate</Button>
                  <Button size="sm" variant="ghost" className="px-2 text-xs" onClick={() => run(async () => {
                    const status = p.status === "active" ? "archived" : "active";
                    const { error } = await supabase.from("projects").update({ status, updated_at: new Date().toISOString() }).eq("id", p.id);
                    if (error) throw error;
                    await logAudit(m.organization_id, "project", p.id, status);
                  }, p.status === "active" ? "Archived" : "Restored")}>{p.status === "active" ? "Archive" : "Unarchive"}</Button>
                  <Button size="sm" variant="ghost" className="px-2 text-xs text-destructive" onClick={() => setConfirmDel(p)}>Delete</Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {m && <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(name, loc, tpl) => run(async () => {
        const a = tpl === "mountain" ? withDefaultProjectSegments({ ...projectMountain, name }) : blankAssumptions(name);
        const notes = tpl === "mountain" ? "Copied from the Project Mountain example; illustrative assumptions not from the original workbook must be verified." : null;
        await createProject(m.organization_id, name, loc || null, a, notes ?? undefined);
        setCreateOpen(false);
      }, "Project created")} />}

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {confirmDel?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The project, its scenarios and photo will disappear for everyone in your organization. Contact your administrator if it needs to be restored.</p>
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
                <SelectItem value="blank">Minimal starter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit">Create</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
