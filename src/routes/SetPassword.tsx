import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";

/**
 * Shown after a user clicks a password-reset / "set your password" email link.
 * The recovery session is already active (handled in the auth context), so we
 * just collect the new password. Routed by `App.tsx` whenever `isRecovery`.
 */
export function SetPassword() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await updatePassword(password);
    if (error) {
      setError(error);
      setBusy(false);
    }
    // On success the recovery flag clears and the normal gates take over.
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
        <div className="mb-8 flex items-end justify-center">
          <Logo className="h-12 w-auto" />
          <span className="-ml-1 font-serif text-4xl font-medium leading-none tracking-tight text-quill">
            stuary
          </span>
        </div>

        <Card>
          <h1 className="text-lg font-semibold text-quill">Set your password</h1>
          <p className="mt-1 text-sm text-quill-soft">
            Choose a password to finish securing your account.
          </p>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-quill-soft">
              New password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mt-1.5 h-11 w-full rounded-[2px] border border-rule bg-well px-3 text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-debit">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        </Card>

        <Button variant="ghost" className="mt-4 w-full" onClick={() => signOut()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
