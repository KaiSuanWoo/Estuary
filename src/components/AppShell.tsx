import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { pressDown, useReducedMotion } from "@/lib/motion";
import { LeafScrollProvider } from "@/components/leaf-scroll";
import { BackToTop } from "@/components/BackToTop";

interface NavItem {
  to: string;
  label: string;
  end: boolean;
}

/**
 * The five stiff dividers down the fore-edge. A bound ledger labels its tabs
 * rather than picturing them, so there are no icons here — the words are the
 * navigation.
 */
const NAV: NavItem[] = [
  { to: "/", label: "Home", end: true },
  { to: "/analytics", label: "Analytics", end: false },
  { to: "/transactions", label: "Activity", end: false },
  { to: "/accounts", label: "Accounts", end: false },
  { to: "/settings", label: "Settings", end: false },
];

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
            {/* max-w-5xl on a spread: two pages need the width one didn't. */}
            {/* max-w-5xl on a spread: two pages need the width one didn't.
                The deep bottom padding is clearance for the add button, which
                is always present on a phone and would otherwise sit on top of
                the last entry. */}
            <div className="mx-auto w-full max-w-md pb-24 pl-9 pr-4 pt-6 lg:max-w-5xl lg:py-7 lg:pl-16 lg:pr-10">
              <Outlet />
            </div>
          </main>

          <BackToTop />
        </LeafScrollProvider>

        {/* Fore-edge tabs */}
        <nav
          aria-label="Primary"
          className="relative z-20 ml-1.5 flex w-10 shrink-0 flex-col gap-1.5 lg:w-11"
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
                      : "bg-page-edge text-quill-soft group-hover:text-quill",
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
