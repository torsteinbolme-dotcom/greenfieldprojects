import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Cable Car Portfolio" },
      { name: "description", content: "Sign in to your organization's cable car project portfolio." },
      { property: "og:title", content: "Sign in — Cable Car Portfolio" },
      { property: "og:description", content: "Access your organization's cable car portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("invite");
    if (urlToken) { sessionStorage.setItem("invite_token", urlToken); setMode("signup"); }
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      const token = sessionStorage.getItem("invite_token");
      if (token) {
        sessionStorage.removeItem("invite_token");
        void supabase.rpc("accept_invite", { _token: token }).then(({ data }) => {
          if (data === "ok") toast.success("You have joined the organization you were invited to.");
          else if (data === "email_mismatch") toast.error("This invite was sent to a different email address.");
          else if (data === "invalid") toast.error("This invite link has expired or was already used.");
        });
      }
      navigate({ to: "/portfolio" });
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (s && (e === "SIGNED_IN" || e === "INITIAL_SESSION")) go(); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const inviteToken = sessionStorage.getItem("invite_token");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/portfolio", data: inviteToken ? { invite_token: inviteToken } : undefined } });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error(r.error.message ?? "Google sign-in failed"); return; }
    if (r.redirected) return;
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
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h2>
          <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
          <div className="text-center text-xs text-muted-foreground">or with email</div>
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</Button>
          <button type="button" className="w-full text-sm text-accent hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
