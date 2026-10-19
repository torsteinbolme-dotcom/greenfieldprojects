import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Admin adds a user: records the organization invite, then emails a sign-up invitation.
// Existing accounts get no email but join through the pending invite on next sign-in.
export const addOrgUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      email: z.string().trim().toLowerCase().email().max(255),
      role: z.enum(["admin", "editor", "viewer"]),
      origin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { _org: data.organizationId, _user: userId });
    if (!isAdmin) throw new Error("Only admins can add users");
    const { data: inv, error } = await supabase
      .from("organization_invites")
      .insert({ organization_id: data.organizationId, email: data.email, role: data.role, invited_by: userId })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: mailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { invite_token: inv.token },
      redirectTo: `${data.origin}/reset-password`,
    });
    if (mailError) {
      if (/already/i.test(mailError.message)) return { emailed: false, existing: true };
      throw new Error(mailError.message);
    }
    return { emailed: true, existing: false };
  });
