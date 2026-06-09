import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ListPlus, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  /** Shown in the mobile bottom bar (which only has room for the core four). */
  primary: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true, primary: true },
  { to: "/transactions", label: "Activity", icon: ListPlus, end: false, primary: true },
  { to: "/accounts", label: "Accounts", icon: Wallet, end: false, primary: true },
  { to: "/settings", label: "Settings", icon: Settings, end: false, primary: true },
];

/**
 * Responsive frame:
 *  - lg+ : sticky top nav bar, wide content area.
 *  - <lg : single mobile column with a fixed bottom tab bar.
 */
export function AppShell() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 hidden border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-lg lg:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-10">
          <div className="flex items-end">
            <Logo className="h-9 w-auto" />
            <span className="-ml-1 font-serif text-[1.9rem] font-medium leading-none tracking-tight text-ink-50">
              stuary
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-teal-500/10 text-teal-300"
                      : "text-ink-400 hover:bg-ink-800/50 hover:text-ink-200",
                  )
                }
              >
                <Icon className="size-4" strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-800/80 bg-ink-950/85 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid w-full max-w-md grid-cols-4">
          {NAV.filter((n) => n.primary).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                  isActive ? "text-teal-400" : "text-ink-500 hover:text-ink-300",
                )
              }
            >
              <Icon className="size-5" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
