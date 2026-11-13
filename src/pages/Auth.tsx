import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CircleAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ContentLoading } from "@/components/ContentLoading";
import { useViewerSession } from "@/hooks/use-viewer-session";
import { needsOnboarding, ONBOARDING_KEY } from "@/lib/onboarding";
import "./auth.css";

const isPreview = import.meta.env.MODE === "mobile-preview";
// Email links open in a browser outside the native app.
const authOrigin = import.meta.env.MODE === "native" ? "https://cinegeek.lovable.app" : window.location.origin;

type Feedback = {
  kind: "error" | "info";
  place: "email" | "password" | "form";
  text: string;
};

function authError(error: unknown, fallback: string): Feedback {
  const failure = error as { code?: string; status?: number; name?: string } | null;
  if (failure?.code === "invalid_credentials") {
    return { kind: "error", place: "form", text: "That email and password don’t match. Check both and try again." };
  }
  if (failure?.code === "email_not_confirmed") {
    return { kind: "error", place: "form", text: "Open the confirmation email we sent you, then sign in." };
  }
  if (failure?.code === "weak_password") {
    return { kind: "error", place: "password", text: "Choose a stronger password with a mix of letters, numbers and symbols." };
  }
  if (failure?.status === 429) {
    return { kind: "error", place: "form", text: "Too many attempts. Wait a moment and try again." };
  }
  if (!navigator.onLine || failure?.name === "AuthRetryableFetchError" || error instanceof TypeError) {
    return { kind: "error", place: "form", text: "We couldn’t reach CineGeek. Check your connection and try again." };
  }
  return { kind: "error", place: "form", text: fallback };
}

function AuthNotice({ feedback }: { feedback: Feedback }) {
  const Icon = feedback.kind === "error" ? CircleAlert : Mail;
  return <p id="auth-notice" className="auth-notice" data-kind={feedback.kind}
    role={feedback.kind === "error" ? "alert" : "status"}>
    <Icon size={17} aria-hidden="true" />{feedback.text}
  </p>;
}

function AuthForm({ isLogin, email, setEmail }: {
  isLogin: boolean; email: string; setEmail: (value: string) => void;
}) {
  const navigate = useNavigate();
  const [password, setPassword] = useState(isPreview ? "sample-only" : "");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"submit" | "reset" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const address = email.trim();
  const invalid = (field: "email" | "password") => feedback?.kind === "error" && feedback.place === field;

  function fieldError(place: "email" | "password", text: string) {
    setFeedback({ kind: "error", place, text });
    (place === "email" ? emailInput : passwordInput).current?.focus();
  }
  function validEmail() {
    if (address && !emailInput.current?.validity.typeMismatch) return true;
    fieldError("email", address ? "Enter a valid email address." : "Enter your email address.");
    return false;
  }
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validEmail()) return;
    if (!password) { fieldError("password", "Enter your password."); return; }
    if (!isLogin && password.length < 6) { fieldError("password", "Use at least 6 characters."); return; }
    setFeedback(null);
    setBusy("submit");
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
        navigate("/dashboard", { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: address, password, options: { emailRedirectTo: `${authOrigin}/dashboard`, data: { [ONBOARDING_KEY]: 0 } },
        });
        if (error) throw error;
        if (data.session) navigate("/onboarding", { replace: true });
        else setConfirmation(address);
      }
    } catch (error) {
      setFeedback(authError(error, isLogin ? "Couldn’t sign in. Please try again." : "Couldn’t create your account. Please try again."));
    } finally { setBusy(null); }
  }

  async function sendReset() {
    if (busy || !validEmail()) return;
    setFeedback(null);
    setBusy("reset");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${authOrigin}/auth` });
      if (error) throw error;
      setFeedback({ kind: "info", place: "form", text: `If there’s an account for ${address}, check your inbox for a password reset link.` });
    } catch (error) {
      setFeedback(authError(error, "Couldn’t send the reset email. Please try again."));
    } finally { setBusy(null); }
  }

  const heading = isLogin ? "Sign in" : "Create an account";
  return <main className="auth-screen">
    <Card className="auth-card">
      <CardHeader>
        <CardTitle className="text-2xl">{confirmation ? "Check your email" : heading}</CardTitle>
        <CardDescription>{confirmation
          ? `Open the confirmation link sent to ${confirmation} to finish signing up.${import.meta.env.MODE === "native" ? " Then return to CineGeek and sign in." : ""}`
          : isPreview ? "This preview uses the sample account below." : "Your CineGeek account"}</CardDescription>
      </CardHeader>
      <CardContent>
        {confirmation ? <Link className="auth-link" to="/auth">Back to sign in</Link> : <>
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input ref={emailInput} id="email" type="email" autoComplete="email" placeholder="you@example.com"
                required readOnly={isPreview || !!busy} value={email} aria-invalid={invalid("email")} aria-describedby={invalid("email") ? "auth-notice" : undefined}
                onChange={event => { setEmail(event.target.value); setFeedback(null); }} />
              {feedback?.place === "email" && <AuthNotice feedback={feedback} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input ref={passwordInput} id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"}
                required readOnly={isPreview || !!busy} value={password} aria-invalid={invalid("password")} aria-describedby={invalid("password") ? "auth-notice" : undefined}
                onChange={event => { setPassword(event.target.value); setFeedback(null); }} />
              {feedback?.place === "password" && <AuthNotice feedback={feedback} />}
            </div>
            {feedback?.place === "form" && <AuthNotice feedback={feedback} />}
            <div className="flex gap-2">
              <Button type="button" className="flex-1" variant="outline" onClick={() => navigate("/")}>Back</Button>
              <Button type="submit" className="flex-1" disabled={!!busy}>{busy === "submit" ? (isLogin ? "Signing in…" : "Creating…") : heading}</Button>
            </div>
          </form>
          <div className="auth-links">
            {isLogin && !isPreview && <button type="button" disabled={!!busy} onClick={sendReset}>
              {busy === "reset" ? "Sending email…" : "Forgot password?"}
            </button>}
            <Link to={isLogin ? "/auth?mode=signup" : "/auth"}>
              {isLogin ? "Create an account" : "Already have an account? Sign in"}
            </Link>
          </div>
        </>}
      </CardContent>
    </Card>
  </main>;
}

export default function Auth() {
  const [params] = useSearchParams();
  const viewer = useViewerSession();
  const [email, setEmail] = useState(isPreview ? "filmgeek@example.com" : "");
  const isLogin = params.get("mode") !== "signup";
  if (viewer === undefined) return <ContentLoading />;
  if (viewer) return <Navigate to={needsOnboarding(viewer) ? "/onboarding" : "/dashboard"} replace />;
  return <AuthForm key={isLogin ? "login" : "signup"} isLogin={isLogin} email={email} setEmail={setEmail} />;
}
