import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, RotateCcw, X } from "lucide-react";
import { useAllProfiles, useSetProfileStatus } from "@/hooks/useProfile";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import type { Profile } from "@/lib/types";

/**
 * Admin-only beta approvals queue. Route access is gated to admins in App.tsx,
 * and RLS independently rejects these writes for anyone who isn't an admin.
 */
export function Admin() {
  const { data = [], isLoading } = useAllProfiles(true);
  const setStatus = useSetProfileStatus();

  const { pending, approved, rejected } = useMemo(() => {
    return {
      pending: data.filter((p) => p.status === "pending"),
      approved: data.filter((p) => p.status === "approved"),
      rejected: data.filter((p) => p.status === "rejected"),
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-2">
        <Link
          to="/settings"
          className="flex size-8 items-center justify-center rounded-lg text-quill-soft hover:text-quill"
          aria-label="Back to settings"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-quill">
            Approvals
          </h1>
          <p className="text-sm text-quill-soft">Review who can access the beta</p>
        </div>
      </header>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : (
        <div className="space-y-5">
          <section>
            <SectionLabel>
              Pending {pending.length > 0 && `· ${pending.length}`}
            </SectionLabel>
            {pending.length === 0 ? (
              <EmptyState title="No one waiting" hint="New sign-ups show up here." />
            ) : (
              <ul className="space-y-2">
                {pending.map((p) => (
                  <Row key={p.id} profile={p}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({ id: p.id, status: "rejected" })
                      }
                    >
                      <X className="size-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({ id: p.id, status: "approved" })
                      }
                    >
                      <Check className="size-4" /> Approve
                    </Button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          {approved.length > 0 && (
            <section>
              <SectionLabel>Approved · {approved.length}</SectionLabel>
              <ul className="space-y-2">
                {approved.map((p) => (
                  <Row key={p.id} profile={p}>
                    {p.is_admin ? (
                      <span className="rounded-full bg-teal-500/12 px-2.5 py-1 text-xs font-medium text-teal-300">
                        Admin
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({ id: p.id, status: "rejected" })
                        }
                      >
                        <X className="size-4" /> Revoke
                      </Button>
                    )}
                  </Row>
                ))}
              </ul>
            </section>
          )}

          {rejected.length > 0 && (
            <section>
              <SectionLabel>Rejected · {rejected.length}</SectionLabel>
              <ul className="space-y-2">
                {rejected.map((p) => (
                  <Row key={p.id} profile={p}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({ id: p.id, status: "approved" })
                      }
                    >
                      <RotateCcw className="size-4" /> Approve
                    </Button>
                  </Row>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-quill-faint">
      {children}
    </h2>
  );
}

function Row({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Card className={cn("flex items-center justify-between gap-3 p-3.5")}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-quill">
            {profile.email ?? "—"}
          </p>
          <p className="text-xs text-quill-faint">
            Joined{" "}
            {new Date(profile.created_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </Card>
    </li>
  );
}
