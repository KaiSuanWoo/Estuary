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
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-end justify-center">
          <Logo className="h-12 w-auto" />
          <span className="-ml-1 font-serif text-4xl font-medium leading-none tracking-tight text-ink-50">
            stuary
          </span>
        </div>

        <Card>
          <h1 className="text-lg font-semibold text-ink-50">Set your password</h1>
          <p className="mt-1 text-sm text-ink-400">
            Choose a password to finish securing your account.
          </p>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-ink-300">
              New password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mt-1.5 h-11 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
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
