import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ListPlus, Settings, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { springSnappy, useReducedMotion } from "@/lib/motion";
import { Logo } from "@/components/Logo";
import { BackToTop } from "@/components/BackToTop";

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
 *  - <lg : single mobile column with a floating bottom dock.
 *
 * Both nav surfaces share an animated "pill" that springs to the active tab
 * via motion's shared-layout animation (a constant `layoutId`).
 */
export function AppShell() {
  const reduce = useReducedMotion();
  const pillTransition = reduce ? { duration: 0 } : springSnappy;

  return (
    <div className="min-h-full">
      {/* ---------------------------------------------------------------- */}
      {/* Desktop: sticky glass top bar                                     */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-20 hidden border-b border-ink-800/60 bg-ink-950/70 backdrop-blur-xl lg:block">
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
                className="relative rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-400/60"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="navPillDesktop"
                        transition={pillTransition}
                        className="absolute inset-0 -z-10 rounded-xl bg-teal-500/12 ring-1 ring-inset ring-teal-400/20"
                      />
                    )}
                    <span
                      className={cn(
                        "flex items-center gap-2 transition-colors",
                        isActive
                          ? "text-teal-300"
                          : "text-ink-400 hover:text-ink-200",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={2} />
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                          */}
      {/* ---------------------------------------------------------------- */}
      <main className="mx-auto w-full max-w-md px-4 pb-32 pt-6 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      <BackToTop />

      {/* ---------------------------------------------------------------- */}
      {/* Mobile: floating glass dock with a sliding pill                  */}
      {/* ---------------------------------------------------------------- */}
      <nav
        className="fixed inset-x-0 z-30 flex justify-center px-4 lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.6rem)" }}
        aria-label="Primary"
      >
        <div
          className="flex items-center gap-1 rounded-[26px] border border-ink-800/60 bg-ink-950/70 p-1.5 backdrop-blur-xl"
          style={{ boxShadow: "var(--shadow-float)" }}
        >
          {NAV.filter((n) => n.primary).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} aria-label={label}>
              {({ isActive }) => (
                <motion.span
                  whileTap={reduce ? undefined : { scale: 0.88 }}
                  transition={pillTransition}
                  className="relative flex h-12 items-center rounded-[20px] px-4"
                >
                  {isActive && (
                    <motion.span
                      layoutId="navPillMobile"
                      transition={pillTransition}
                      className="absolute inset-0 -z-10 rounded-[20px] bg-teal-500/15 ring-1 ring-inset ring-teal-400/25"
                    />
                  )}
                  <Icon
                    className={cn(
                      "size-[22px] shrink-0 transition-colors",
                      isActive ? "text-teal-300" : "text-ink-400",
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.span
                        key="label"
                        initial={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
                        animate={
                          reduce
                            ? { opacity: 1 }
                            : { width: "auto", opacity: 1 }
                        }
                        exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
                        transition={pillTransition}
                        className="overflow-hidden whitespace-nowrap text-sm font-semibold text-teal-200"
                      >
                        <span className="pl-2">{label}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
