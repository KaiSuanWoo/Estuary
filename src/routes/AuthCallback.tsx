import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

/**
 * Landing page for the magic-link redirect. `detectSessionInUrl` (set on the
 * Supabase client) parses the token; we just wait for the session then bounce
 * home. Kept under /auth so the PWA navigation fallback ignores it.
 */
export function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) navigate(session ? "/" : "/login", { replace: true });
  }, [session, loading, navigate]);

  return (
    <div className="flex min-h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
