import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { Button, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";

type Mode = "signin" | "signup" | "reset";

const inputCls =
  "mt-1.5 h-11 w-full rounded-[2px] border border-rule bg-well px-3 text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

export function Login() {
  const {
    session,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    resetPassword,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "form" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  // A confirmation card replaces the form after a sign-up or reset email is sent.
  const [sent, setSent] = useState<null | { kind: "signup" | "reset"; to: string }>(
    null,
  );

  // Already signed in (e.g. returned here with a live session) → leave /login.
  if (session) return <Navigate to="/" replace />;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    const mail = email.trim();

    if (mode === "reset") {
      const { error } = await resetPassword(mail);
      if (error) setError(error);
      else setSent({ kind: "reset", to: mail });
    } else if (mode === "signup") {
      const { error, needsConfirmation } = await signUpWithPassword(mail, password);
      if (error) setError(error);
      else if (needsConfirmation) setSent({ kind: "signup", to: mail });
      // Otherwise the session arrives via onAuthStateChange and <Navigate> fires.
    } else {
      const { error } = await signInWithPassword(mail, password);
      if (error) setError(error);
    }
    setBusy(null);
  }

  async function onGoogle() {
    setBusy("google");
    setError(null);
    const { error } = await signInWithGoogle();
    // On success the browser redirects to Google, so we only land here on error.
    if (error) {
      setError(error);
      setBusy(null);
    }
  }

  return (
    <div
      className="flex min-h-full flex-col items-center justify-center px-6 py-10"
      style={{
        background:
          "linear-gradient(170deg, var(--color-desk-a), var(--color-desk-b))",
      }}
    >
      <div
        className="surface-leaf w-full max-w-sm rounded-[3px] px-6 py-8"
        style={{ boxShadow: "var(--shadow-book)" }}
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-1 flex items-end justify-center">
            <Logo className="h-16 w-auto" />
            <h1
              className="-ml-1.5 text-5xl leading-none tracking-tight text-quill"
              style={{ fontVariant: "small-caps" }}
            >
              stuary
            </h1>
          </div>
          <p className="mt-1 text-sm italic text-quill-soft">
            From many streams, one flow.
          </p>
          <hr className="brass-rule mt-4 w-full" />
        </div>

        {sent ? (
          <div>
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent/12 text-accent">
                <MailCheck className="size-6" />
              </div>
              <p className="font-medium text-quill">
                {sent.kind === "signup" ? "Confirm your email" : "Check your inbox"}
              </p>
              <p className="mt-1 text-sm text-quill-soft">
                {sent.kind === "signup" ? (
                  <>
                    We sent a verification link to{" "}
                    <span className="text-quill">{sent.to}</span>. Click it to
                    finish creating your account.
                  </>
                ) : (
                  <>
                    If an account exists for{" "}
                    <span className="text-quill">{sent.to}</span>, we've sent a
                    link to set a new password.
                  </>
                )}
              </p>
              {sent.kind === "signup" && (
                <p className="mt-3 text-xs text-quill-faint">
                  After verifying, your access is reviewed before you can sign in.
                </p>
              )}
            </div>
          </div>
        ) : mode === "reset" ? (
          <div>
            <h2 className="text-base font-semibold text-quill">Reset password</h2>
            <p className="mt-1 text-sm text-quill-soft">
              Enter your email and we'll send a link to set a new password.
            </p>
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-quill-soft">
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </label>
              {error && <p className="text-sm text-debit">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy !== null}>
                {busy === "form" ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </div>
        ) : (
          <div>
            {/* Mode toggle */}
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-[2px] border border-rule/60 bg-well p-1">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={cn(
                    "h-9 rounded-[2px] text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-rule text-quill"
                      : "text-quill-soft hover:text-quill",
                  )}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onGoogle}
              disabled={busy !== null}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[2px] border border-rule-strong bg-well text-sm font-medium text-quill transition-colors hover:border-brass disabled:opacity-60"
            >
              {busy === "google" ? (
                <Spinner className="size-4" />
              ) : (
                <GoogleGlyph />
              )}
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-quill-faint">
              <span className="h-px flex-1 bg-rule" />
              or
              <span className="h-px flex-1 bg-rule" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-quill-soft">
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </label>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-medium text-quill-soft">
                    Password
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="text-xs font-medium text-accent hover:text-quill"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                  className={inputCls}
                />
              </div>
              {error && <p className="text-sm text-debit">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy !== null}>
                {busy === "form"
                  ? mode === "signup"
                    ? "Creating account…"
                    : "Signing in…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </form>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-quill-faint">
          {sent ? (
            "Didn't get it? Check spam, or try again in a minute."
          ) : mode === "reset" ? (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-accent hover:text-quill"
            >
              ← Back to sign in
            </button>
          ) : mode === "signup" ? (
            "New accounts are reviewed before access is granted."
          ) : (
            "Use the email and password you signed up with."
          )}
        </p>
      </div>
    </div>
  );
}

/** Google's multicolour "G". */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
