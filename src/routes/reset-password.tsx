import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRecoveryVisit, RECOVERY_FLAG } from "@/lib/recovery";


export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Cable Car Portfolio" },
      { name: "description", content: "Set a new password for your cable car portfolio account." },
      { property: "og:title", content: "Choose a new password — Cable Car Portfolio" },
      { property: "og:description", content: "Set a new password for your cable car portfolio account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type Stage = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The flag lets a reload keep the form open after the client strips the link from the address bar.
    const isRecovery = isRecoveryVisit(window.location.search, window.location.hash);
    if (isRecovery) sessionStorage.setItem(RECOVERY_FLAG, "1");
    const allowed = isRecovery || sessionStorage.getItem(RECOVERY_FLAG) === "1";


    let settled = false;
    const finish = (next: Stage) => {
      if (settled) return;
      settled = true;
      setStage(next);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && allowed && (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION")) {
        finish("ready");
      }
    });

    void supabase.auth.getSession().then(({ data: got }) => {
      if (got.session && allowed) finish("ready");
      else if (!allowed) finish("invalid");
    });

    // A link that never becomes a session was expired or already used.
    const timer = setTimeout(() => finish("invalid"), 5000);
    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      // A recovery session is exempt from the current-password requirement, so none is collected here.
      const { data: upd, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Invited users join the inviting organization (no-op if already a member or no invite).
      const inviteToken = upd.user?.user_metadata?.invite_token;
      if (typeof inviteToken === "string") await supabase.rpc("accept_invite", { _token: inviteToken });
      sessionStorage.removeItem(RECOVERY_FLAG);
      toast.success("Your new password is active.");
      await navigate({ to: "/projects" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground md:flex">
        <p className="eyebrow text-sidebar-primary">Cable Car Portfolio</p>
        <div>
          <h1 className="text-4xl font-semibold text-sidebar-accent-foreground">One model. Every project. Comparable returns.</h1>
          <p className="mt-4 text-sidebar-foreground/70">Your data is visible only to members of your organization.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-semibold">Choose a new password</h2>
          {stage === "checking" && (
            <p className="text-sm text-muted-foreground">Checking your reset link…</p>
          )}
          {stage === "invalid" && (
            <>
              <p className="text-sm text-muted-foreground">
                This reset link has expired or was already used. Request a new one to choose a password again.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </>
          )}
          {stage === "ready" && (
            <form onSubmit={save} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Repeat new password</Label>
                <Input id="pw2" type="password" required minLength={6} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Save new password</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
