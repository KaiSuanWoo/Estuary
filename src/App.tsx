import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/hooks/useSettings";
import { useProfile } from "@/hooks/useProfile";
import { isStandalone } from "@/lib/pwa";
import { Spinner } from "@/components/ui";
import { AppShell } from "@/components/AppShell";
import { PendingApproval } from "@/routes/PendingApproval";
import { SetPassword } from "@/routes/SetPassword";

// Route-level code splitting: each screen is its own chunk so the initial load
// (login) doesn't pull in recharts, the import parser, etc. Named exports are
// wrapped to the default-export shape that React.lazy expects.
const Landing = lazy(() => import("@/routes/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("@/routes/Login").then((m) => ({ default: m.Login })));
const AuthCallback = lazy(() => import("@/routes/AuthCallback").then((m) => ({ default: m.AuthCallback })));
const Onboarding = lazy(() => import("@/routes/Onboarding").then((m) => ({ default: m.Onboarding })));
const Admin = lazy(() => import("@/routes/Admin").then((m) => ({ default: m.Admin })));
const Dashboard = lazy(() => import("@/routes/Dashboard").then((m) => ({ default: m.Dashboard })));
const Transactions = lazy(() => import("@/routes/Transactions").then((m) => ({ default: m.Transactions })));
const Accounts = lazy(() => import("@/routes/Accounts").then((m) => ({ default: m.Accounts })));
const Categories = lazy(() => import("@/routes/Categories").then((m) => ({ default: m.Categories })));
const Settings = lazy(() => import("@/routes/Settings").then((m) => ({ default: m.Settings })));
const Budgets = lazy(() => import("@/routes/Budgets").then((m) => ({ default: m.Budgets })));
const Import = lazy(() => import("@/routes/Import").then((m) => ({ default: m.Import })));
const Rules = lazy(() => import("@/routes/Rules").then((m) => ({ default: m.Rules })));
const Analytics = lazy(() => import("@/routes/Analytics").then((m) => ({ default: m.Analytics })));
const Merchants = lazy(() => import("@/routes/Merchants").then((m) => ({ default: m.Merchants })));

function FullScreenSpinner() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Spinner />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/welcome" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireApproval />}>
              <Route path="/onboarding" element={<OnboardingRoute />} />
              <Route element={<RequireSetup />}>
                {/* Inside the shell so every screen keeps the nav frame —
                    /admin used to render bare, which left no way back. */}
                <Route element={<AppShell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="transactions" element={<Transactions />} />
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="budgets" element={<Budgets />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="merchants" element={<Merchants />} />
                  <Route path="rules" element={<Rules />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="import" element={<Import />} />
                  <Route path="admin" element={<AdminRoute />} />
                </Route>
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

/** Gate: wait for the session check, then redirect to /login if signed out. */
function RequireAuth() {
  const { session, loading, isRecovery } = useAuth();

  if (loading) return <FullScreenSpinner />;
  // Logged-out: the installed app goes straight to sign-in (the marketing
  // landing is for browser visitors only); browser visitors get the landing.
  if (!session)
    return <Navigate to={isStandalone() ? "/login" : "/welcome"} replace />;
  // A recovery (password-reset) session must set a new password before anything
  // else — short-circuit the approval/setup gates.
  if (isRecovery) return <SetPassword />;
  return <Outlet />;
}

/**
 * Gate: authenticated but beta-gated. Pending/rejected users get a holding
 * screen; approved users pass through. The profile row is auto-created on
 * sign-up, and existing users were backfilled to `approved`.
 */
function RequireApproval() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) return <FullScreenSpinner />;
  const status = profile?.status ?? "pending";
  if (status !== "approved") return <PendingApproval status={status} />;
  return <Outlet />;
}

/**
 * Gate: hold the app routes until we know whether the user has finished the
 * first-run setup. New users are bounced to /onboarding; everyone else passes.
 */
function RequireSetup() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading || !settings) return <FullScreenSpinner />;
  if (!settings.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** The /onboarding screen — but skip it for users who have already set up. */
function OnboardingRoute() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading || !settings) return <FullScreenSpinner />;
  if (settings.onboarding_completed) return <Navigate to="/" replace />;
  return <Onboarding />;
}

/** The /admin screen — admins only; everyone else is sent home. */
function AdminRoute() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) return <FullScreenSpinner />;
  if (!profile?.is_admin) return <Navigate to="/" replace />;
  return <Admin />;
}
