import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, LayoutDashboard, ListPlus, Settings, Wallet } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
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
  // Analytics lives in the desktop top-nav only (the mobile dock keeps its core
  // four); mobile reaches it via a Settings entry.
  { to: "/analytics", label: "Analytics", icon: BarChart3, end: false, primary: false },
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
  const { pathname } = useLocation();

  // Pulse the whole dock each time the active tab changes.
  const dockPulse = useAnimationControls();
  useEffect(() => {
    if (reduce) return;
    dockPulse.start({
      scale: [1, 1.06, 1],
      transition: { duration: 0.34, ease: "easeOut" },
    });
  }, [pathname, reduce, dockPulse]);

  // Shrink the dock while scrolling down; restore near the top or on scroll up.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 60) setCompact(false);
      else if (y > last + 6) setCompact(true);
      else if (y < last - 6) setCompact(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile pill is driven by the active tab's *index*, not motion's shared
  // layout. A single element that only animates `x` can never drift vertically —
  // it's immune to scroll position, route remounts, and the dock's pulse, which
  // is what caused the pill to fly up from the bottom after scrolling.
  const primaryNav = NAV.filter((n) => n.primary);
  const activeIndex = primaryNav.findIndex((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );
  // Each cell is size-12 (48px) with a gap-1 (4px) → 52px stride; p-1.5 (6px) inset.
  const PILL_STRIDE = 52;

  return (
    // Full-height flex column so the content area always fills the screen. On a
    // short page (e.g. few accounts) this keeps the document bottom at the
    // viewport bottom, so the fixed dock can't drift up — iOS otherwise anchors
    // a fixed-bottom element to the (short) content on non-scrollable pages.
    <div className="flex min-h-[100dvh] flex-col">
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
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-32 pt-6 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-8">
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
        {/* Outer layer shrinks on scroll (anchored bottom-centre so it never
            drifts); inner layer pulses on tab change. */}
        <motion.div
          animate={{ scale: compact ? 0.86 : 1 }}
          transition={pillTransition}
          style={{ transformOrigin: "bottom center" }}
        >
          <motion.div
            animate={dockPulse}
            className="relative flex items-center gap-1 rounded-[26px] border border-ink-800/60 bg-ink-950/70 p-1.5 backdrop-blur-xl"
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            {/* Sliding pill — a single element that only translates horizontally. */}
            {activeIndex >= 0 && (
              <motion.span
                aria-hidden
                className="absolute left-1.5 top-1.5 size-12 rounded-[20px] bg-teal-500/15 ring-1 ring-inset ring-teal-400/25"
                initial={false}
                animate={{ x: activeIndex * PILL_STRIDE }}
                transition={pillTransition}
              />
            )}
            {primaryNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} aria-label={label} className="block">
                {({ isActive }) => (
                  <motion.span
                    whileTap={reduce ? undefined : { scale: 0.88 }}
                    transition={pillTransition}
                    className="relative flex size-12 items-center justify-center rounded-[20px]"
                  >
                    <Icon
                      className={cn(
                        "size-[22px] shrink-0 transition-colors",
                        isActive ? "text-teal-300" : "text-ink-400",
                      )}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  </motion.span>
                )}
              </NavLink>
            ))}
          </motion.div>
        </motion.div>
      </nav>
    </div>
  );
}
