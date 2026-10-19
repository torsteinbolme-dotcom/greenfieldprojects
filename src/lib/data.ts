import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assumptions } from "@/financialEngine";
import { CALCULATION_VERSION } from "./model";
import { withLinkedTicketPrices } from "./ticket-pricing";
import { COVER_BUCKET, coverPath } from "./covers";

export type Role = "admin" | "editor" | "viewer";
export type Membership = { organization_id: string; role: Role; user_id: string; email: string | null; org_name: string };

export function useMembership() {
  return useQuery({
    queryKey: ["membership"],
    queryFn: async (): Promise<Membership> => {
      const { data: sess } = await supabase.auth.getSession();
      const u = { user: sess.session?.user };
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, user_id, email, organizations(name)")
        .eq("user_id", u.user.id)
        .limit(1)
        .single();
      if (error) throw error;
      return {
        organization_id: data.organization_id,
        role: data.role as Role,
        user_id: data.user_id,
        email: data.email,
        org_name: (data.organizations as { name: string } | null)?.name ?? "Organization",
      };
    },
  });
}

export type ProjectRow = {
  id: string; organization_id: string; name: string; location: string | null; description: string | null;
  status: string; assumption_notes: string | null; benchmark_config?: unknown; created_at: string; updated_at: string;
  cover_image_url: string | null;
};
export type ScenarioRow = { id: string; project_id: string; organization_id: string; name: string; kind: string; created_at: string };

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at");
      if (error) throw error;
      return data as ProjectRow[];
    },
  });
}

export function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("scenarios").select("*").order("created_at");
      if (error) throw error;
      return data as ScenarioRow[];
    },
  });
}

export function useLatestAssumptions() {
  return useQuery({
    queryKey: ["latest-assumptions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("latest_scenario_assumptions").select("scenario_id, version, assumptions");
      if (error) throw error;
      const map = new Map<string, { version: number; assumptions: Assumptions }>();
      for (const r of data ?? []) map.set(r.scenario_id!, { version: r.version!, assumptions: r.assumptions as unknown as Assumptions });
      return map;
    },
  });
}

export async function logAudit(orgId: string, entity_type: string, entity_id: string | null, action: string, details?: object) {
  const u = { user: (await supabase.auth.getSession()).data.session?.user };
  const { error } = await supabase.from("audit_events").insert({
    organization_id: orgId, actor_id: (u.user?.id ?? null), entity_type, entity_id, action, details: (details ?? null) as never,
  });
  if (error) throw error;
}

export async function saveAssumptionVersion(orgId: string, scenarioId: string, a: Assumptions, note?: string) {
  const u = { user: (await supabase.auth.getSession()).data.session?.user };
  // Other tabs/users may append between the read and insert. Retry only a unique-version collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error: readError } = await supabase
      .from("scenario_assumptions").select("version").eq("scenario_id", scenarioId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (readError) throw readError;
    const version = (last?.version ?? 0) + 1;
    const { error } = await supabase.from("scenario_assumptions").insert({
      organization_id: orgId, scenario_id: scenarioId, version, assumptions: withLinkedTicketPrices(a) as never,
      calculation_version: CALCULATION_VERSION, note: note ?? null, created_by: (u.user?.id ?? null),
    });
    if (error?.code === "23505" && attempt < 2) continue;
    if (error) throw error;
    await logAudit(orgId, "scenario", scenarioId, "assumptions_saved", { version });
    return version;
  }
  throw new Error("Could not allocate a new scenario version");
}

export async function createScenario(orgId: string, projectId: string, name: string, kind: string, a: Assumptions) {
  const { data, error } = await supabase.from("scenarios")
    .insert({ organization_id: orgId, project_id: projectId, name, kind }).select().single();
  if (error) throw error;
  await saveAssumptionVersion(orgId, data.id, a, `Created from copy`);
  return data as ScenarioRow;
}

export async function createProject(orgId: string, name: string, location: string | null, a: Assumptions, notes?: string) {
  const u = { user: (await supabase.auth.getSession()).data.session?.user };
  const { data, error } = await supabase.from("projects")
    .insert({ organization_id: orgId, name, location, assumption_notes: notes ?? null, created_by: (u.user?.id ?? null) })
    .select().single();
  if (error) throw error;
  await createScenario(orgId, data.id, "Base", "base", { maintenanceCapexPct: 0.01, ...a, name });
  await logAudit(orgId, "project", data.id, "created");
  return data as ProjectRow;
}

export async function duplicateProject(orgId: string, p: ProjectRow) {
  const u = { user: (await supabase.auth.getSession()).data.session?.user };
  const { data: np, error } = await supabase.from("projects").insert({
    organization_id: orgId, name: `${p.name} (copy)`, location: p.location, description: p.description,
    assumption_notes: p.assumption_notes, created_by: (u.user?.id ?? null),
  }).select().single();
  if (error) throw error;
  const { data: scens } = await supabase.from("scenarios").select("*").eq("project_id", p.id);
  for (const s of scens ?? []) {
    const { data: latest } = await supabase.from("latest_scenario_assumptions").select("assumptions").eq("scenario_id", s.id).maybeSingle();
    if (!latest) continue;
    await createScenario(orgId, np.id, s.name, s.kind, latest.assumptions as unknown as Assumptions);
  }
  if (p.cover_image_url) {
    const { data: photo } = await supabase.storage.from(COVER_BUCKET).download(p.cover_image_url);
    if (photo) {
      const to = coverPath(orgId, np.id, p.cover_image_url);
      const { error: up } = await supabase.storage.from(COVER_BUCKET).upload(to, photo, { upsert: true, contentType: photo.type || "image/jpeg" });
      if (!up) await supabase.from("projects").update({ cover_image_url: to }).eq("id", np.id);
    }
  }
  await logAudit(orgId, "project", np.id, "duplicated", { from: p.id });
  return np;
}

// Soft delete: hides the project from everyone but keeps all data, files and photo so it can be restored.
export async function deleteProject(orgId: string, projectId: string) {
  const { error } = await supabase.rpc("soft_delete_project", { _project: projectId });
  if (error) throw error;
  await logAudit(orgId, "project", projectId, "deleted");
}
