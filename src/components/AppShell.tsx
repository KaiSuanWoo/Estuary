import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, LayoutDashboard, ListPlus, Settings, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { paperSettle, pressDown, useReducedMotion } from "@/lib/motion";
import { LeafScrollProvider } from "@/components/leaf-scroll";
import { BackToTop } from "@/components/BackToTop";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
}

/**
 * The five sections. On a desktop these are the stiff dividers down the
 * fore-edge, labelled the way a ledger labels its tabs. A phone gets the
 * floating dock instead — thumbs reach the bottom of a screen, not its edge —
 * so the icons are here for it.
 */
const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, end: false },
  { to: "/transactions", label: "Activity", icon: ListPlus, end: false },
  { to: "/accounts", label: "Accounts", icon: Wallet, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

/** Each dock cell is size-12 (48px) with gap-1 (4px) → a 52px stride. */
const PILL_STRIDE = 52;

/**
 * The book.
 *
 * One bound volume lying on a desk: leather cover, a ribbon in the gutter,
 * brass at the corners, and the leaf you actually read. The leaf is the only
 * thing that scrolls — cover and tabs never move — which is both how a book
 * behaves and what lets a page turn cleanly later.
 *
 * On a phone the book fills the screen; on a large display it sits on the desk
 * with room around it.
 */
export function AppShell() {
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const leafRef = useRef<HTMLElement | null>(null);

  // Turning to a new section always starts at the head of the leaf.
  useEffect(() => {
    leafRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // The dock's pill is driven by the active tab's index rather than a shared
  // layout animation, so it can only ever move horizontally.
  const activeIndex = NAV.findIndex((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );

  return (
    <div
      className="flex h-full flex-col lg:p-6"
      style={{
        background:
          "linear-gradient(170deg, var(--color-desk-a), var(--color-desk-b))",
      }}
    >
      <div
        className={cn(
          "surface-hide stitched relative flex min-h-0 flex-1 overflow-hidden p-2",
          "lg:mx-auto lg:w-full lg:max-w-5xl lg:rounded-[6px_10px_10px_6px] lg:p-3",
        )}
      >
        <LeafScrollProvider leafRef={leafRef}>
          {/* The leaf. Extra left padding is the gutter the ribbon lies in. */}
          <main
            ref={leafRef}
            className="surface-leaf relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[2px]"
          >
            {/* max-w-5xl on a spread: two pages need the width one didn't.
                The deep bottom padding is clearance for the dock and the add
                button, which would otherwise sit on top of the last entry. */}
            <div className="mx-auto w-full max-w-md pb-32 pl-9 pr-4 pt-6 lg:max-w-5xl lg:py-7 lg:pl-16 lg:pr-10">
              <Outlet />
            </div>
          </main>

          <BackToTop />
        </LeafScrollProvider>

        {/* Fore-edge tabs — desktop only; a thumb can't reach a screen edge. */}
        <nav
          aria-label="Sections"
          className="relative z-20 ml-1.5 hidden w-10 shrink-0 flex-col gap-1.5 lg:flex lg:w-11"
        >
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className="group block flex-1">
              {({ isActive }) => (
                <motion.span
                  whileTap={reduce ? undefined : { scale: 0.97, x: 2 }}
                  transition={pressDown}
                  className={cn(
                    "flex h-full items-center justify-center rounded-r-[4px]",
                    "shadow-[1px_1px_3px_rgb(0_0_0/0.4)] transition-colors",
                    isActive
                      ? "brass-face"
                      : "bg-page-edge text-quill/75 group-hover:text-quill",
                  )}
                >
                  <span
                    className="text-[0.68rem] tracking-[0.16em] lg:text-xs"
                    style={{ writingMode: "vertical-rl", fontVariant: "small-caps" }}
                  >
                    {label}
                  </span>
                </motion.span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Binding shadow down the spine */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-2.5"
          style={{
            background:
              "linear-gradient(90deg, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.12) 60%, transparent)",
          }}
        />

        {/* Silk ribbon, lying in the gutter. Draggable once months can turn. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 z-20 h-2/3 w-2.5"
          style={{
            left: "1.15rem",
            background:
              "linear-gradient(90deg, #6d1420, #a8283a 35%, #c4485a 50%, #8a1b2a 70%, #5c0f1a)",
            boxShadow: "1px 0 4px rgb(0 0 0 / 0.55)",
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 94%, 0 100%)",
          }}
        />

        {/* Mobile: the dock, in leather and brass. Reachable by thumb, which
            the fore-edge tabs are not. The pill only ever translates on x, so
            it can't drift vertically as the leaf scrolls. */}
        <nav
          aria-label="Primary"
          className="absolute inset-x-0 z-30 flex justify-center px-4 lg:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <div
            className="surface-hide relative flex items-center gap-1 rounded-[24px] p-1.5"
            style={{ boxShadow: "0 10px 26px -8px rgb(0 0 0 / 0.7)" }}
          >
            {activeIndex >= 0 && (
              <motion.span
                aria-hidden
                className="brass-face absolute left-1.5 top-1.5 z-0 size-12 rounded-[18px]"
                initial={false}
                animate={{ x: activeIndex * PILL_STRIDE }}
                transition={reduce ? { duration: 0 } : paperSettle}
              />
            )}
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} aria-label={label} className="relative z-10 block">
                {({ isActive }) => (
                  <motion.span
                    whileTap={reduce ? undefined : { scale: 0.9 }}
                    transition={pressDown}
                    className="flex size-12 items-center justify-center rounded-[18px]"
                  >
                    <Icon
                      className={cn(
                        "size-[21px] shrink-0 transition-colors",
                        isActive ? "text-[#24170a]" : "text-page-edge/70",
                      )}
                      strokeWidth={isActive ? 2.3 : 2}
                    />
                  </motion.span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Brass corner caps */}
        <span
          aria-hidden
          className="brass-face pointer-events-none absolute left-0 top-0 z-20 size-6"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        <span
          aria-hidden
          className="brass-face pointer-events-none absolute bottom-0 left-0 z-20 size-6"
          style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%)" }}
        />
      </div>
    </div>
  );
}
