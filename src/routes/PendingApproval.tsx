import { Clock, ShieldX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";
import type { ProfileStatus } from "@/lib/database.types";

/**
 * Holding screen for users who are authenticated but not yet approved for the
 * beta. Shown by the `RequireApproval` gate; an admin flips their status from
 * the /admin queue, after which a reload lets them through.
 */
export function PendingApproval({ status }: { status: ProfileStatus }) {
  const { user, signOut } = useAuth();
  const rejected = status === "rejected";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-end justify-center">
          <Logo className="h-12 w-auto" />
          <span className="-ml-1 font-serif text-4xl font-medium leading-none tracking-tight text-ink-50">
            stuary
          </span>
        </div>

        <Card>
          <div className="flex flex-col items-center py-4">
            <div
              className={
                rejected
                  ? "mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-300"
                  : "mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-300"
              }
            >
              {rejected ? (
                <ShieldX className="size-7" />
              ) : (
                <Clock className="size-7" />
              )}
            </div>
            <h1 className="text-lg font-semibold text-ink-50">
              {rejected ? "Access not granted" : "Waiting for approval"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              {rejected
                ? "Your request for access wasn't approved. If you think this is a mistake, reach out to whoever invited you."
                : "Thanks for signing up! Your account is being reviewed. You'll be able to jump in as soon as you're approved — try again shortly."}
            </p>
            {user?.email && (
              <p className="mt-4 text-xs text-ink-600">
                Signed in as {user.email}
              </p>
            )}
          </div>
        </Card>

        <Button
          variant="ghost"
          className="mt-4 w-full"
          onClick={() => signOut()}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
