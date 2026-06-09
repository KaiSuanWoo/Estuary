import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";

export function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await signInWithEmail(email.trim());
    if (error) {
      setError(error);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-1 flex items-end justify-center">
            <Logo className="h-16 w-auto" />
            <h1 className="-ml-1.5 font-serif text-5xl font-medium leading-none tracking-tight text-ink-50">
              stuary
            </h1>
          </div>
          <p className="mt-1 text-sm text-ink-400">
            From many streams, one flow.
          </p>
        </div>

        <Card>
          {status === "sent" ? (
            <div className="py-4 text-center">
              <p className="font-medium text-ink-100">Check your inbox</p>
              <p className="mt-1 text-sm text-ink-400">
                We sent a magic link to{" "}
                <span className="text-ink-200">{email}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-ink-300">
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none"
                />
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-ink-600">
          No password needed — we'll email you a sign-in link.
        </p>
      </div>
    </div>
  );
}
