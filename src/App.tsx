import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";
import { AppShell } from "@/components/AppShell";
import { Login } from "@/routes/Login";
import { AuthCallback } from "@/routes/AuthCallback";
import { Dashboard } from "@/routes/Dashboard";
import { Transactions } from "@/routes/Transactions";
import { Accounts } from "@/routes/Accounts";
import { Categories } from "@/routes/Categories";
import { Settings } from "@/routes/Settings";
import { Import } from "@/routes/Import";
import { Rules } from "@/routes/Rules";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="categories" element={<Categories />} />
            <Route path="rules" element={<Rules />} />
            <Route path="settings" element={<Settings />} />
            <Route path="import" element={<Import />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Gate: wait for the session check, then redirect to /login if signed out. */
function RequireAuth() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  // Children render via the nested <AppShell /> <Outlet />.
  return <Outlet />;
}
