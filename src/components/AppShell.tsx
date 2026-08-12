import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { BarChart3, LayoutDashboard, ListPlus, Settings, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { paperSettle, paperTurn, pressDown, useReducedMotion } from "@/lib/motion";
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

/**
 * Each dock cell is size-12 (3rem) with gap-1 (0.25rem) → a 3.25rem stride.
 * Expressed in rem, not px, so it still lands under the icons when the text
 * scale grows the dock.
 */
const PILL_STRIDE = 3.25;

/**
 * The bookmarks hang off the fore-edge, out over the desk. A tab is 56px long;
 * these say how much of it is tucked back under the cover, so the number you
 * see clearing the leather is `TAB_LENGTH` minus the tuck.
 *
 * Retracted leaves 20px proud — enough to read as a stack of five bookmarks,
 * not enough to fit a word. The one you're on is never tucked that far: it
 * stands out of the stack so your place is legible without reaching for it.
 */
const TAB_LENGTH = 56;
const TAB_TUCK = TAB_LENGTH - 20;
const TAB_TUCK_ACTIVE = TAB_LENGTH - 34;
/**
 * Even fully out, a tab keeps its root under the leather. Pulling one clear of
 * the cover would read as a loose card lying beside the book rather than a
 * divider bound into it — so every state below leaves some tuck.
 */
const TAB_TUCK_OPEN = 14;
/**
 * The extra a tab gives when your pointer is on *it* rather than merely on the
 * stack. Reaching for the fore-edge fans all five out; touching one picks it
 * out of the fan.
 */
const TAB_REACH = 10;
/**
 * How tall a tab is, taken from the type rather than from the space available.
 * The longest label — "Analytics", set vertically at 12px with 0.16em — needs
 * 74px, so 96px gives it that plus room to breathe at either end.
 *
 * Dividing the whole fore-edge between five tabs made each 153px: tall, thin,
 * and reading as a hanging file in a cabinet drawer rather than a divider bound
 * into a book. Grouping them at the head of the edge and leaving the foot clear
 * is what makes them bookmarks. It is a maximum, not a fixed height — on a
 * short window the tabs share what there is instead of running off the cover.
 */
const TAB_HEIGHT = "6rem";

/**
 * The book.
 *
 * One bound volume lying on a desk: leather cover, a ribbon in the gutter,
 * brass at the corners, and the leaf you actually read. The leaf is the only
 * thing that scrolls — cover and tabs never move — which is both how a book
 * behaves and what lets a page turn cleanly.
 *
 * On a phone the book fills the screen; on a large display it sits on the desk
 * with room around it.
 */
export function AppShell() {
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const leafRef = useRef<HTMLElement | null>(null);
  const [tabsOpen, setTabsOpen] = useState(false);

  // Turning to a new section always starts at the head of the leaf.
  useEffect(() => {
    leafRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // The dock's pill is driven by the active tab's index rather than a shared
  // layout animation, so it can only ever move horizontally.
  const activeIndex = NAV.findIndex((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );

  // The leaf turns when you change *section*, not when a filter changes the
  // query string — so the key is the first path segment alone.
  const section = pathname.split("/")[1] ?? "";

  return (
    <div
      // Extra room on the right is the desk the bookmarks hang over. Without
      // it they'd run off a 1024px display.
      className="flex h-full flex-col lg:p-6 lg:pr-24"
      style={{
        background:
          "linear-gradient(170deg, var(--color-desk-a), var(--color-desk-b))",
      }}
    >
      {/* The book: the cover, and the bookmarks bound into it. This wrapper is
          only the coordinate space they share — it draws nothing. */}
      <div className="relative flex min-h-0 flex-1 lg:mx-auto lg:w-full lg:max-w-5xl">
        {/* Fore-edge bookmarks — desktop only; a thumb can't reach a screen
            edge. They sit *behind* the cover (z-0 against its z-10) and start
            at its outer edge, so retracting slides them back under the leather
            and extending pulls them out over the desk. The strip is the full
            tab length whatever the tabs are doing, so there's always something
            to reach for. */}
        <nav
          aria-label="Sections"
          onPointerEnter={() => setTabsOpen(true)}
          onPointerLeave={() => setTabsOpen(false)}
          onFocus={() => setTabsOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setTabsOpen(false);
          }}
          className="absolute inset-y-8 left-full z-0 hidden flex-col justify-start gap-1.5 lg:flex"
          style={{ width: TAB_LENGTH }}
        >
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="group block min-h-0 flex-1"
              style={{ maxHeight: TAB_HEIGHT }}
            >
              {({ isActive }) => {
                // Where this tab sits when nothing is touching it: fanned out
                // with the rest, standing proud because it's the section
                // you're on, or tucked back in the stack.
                const rest = tabsOpen || reduce
                  ? -TAB_TUCK_OPEN
                  : isActive
                    ? -TAB_TUCK_ACTIVE
                    : -TAB_TUCK;
                return (
                  <motion.span
                    initial={false}
                    animate={{
                      x: rest,
                      boxShadow: "2px 2px 7px rgb(0 0 0 / 0.5)",
                    }}
                    // Your pointer on *this* tab picks it out of the fan: it
                    // comes further than its neighbours and its shadow deepens
                    // and throws further, as a thing lifting off the desk does.
                    whileHover={
                      reduce
                        ? undefined
                        : {
                            x: rest + TAB_REACH,
                            boxShadow: "6px 3px 15px rgb(0 0 0 / 0.62)",
                            transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
                          }
                    }
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    transition={paperSettle}
                    className={cn(
                      "flex h-full items-center justify-end rounded-r-[4px] pr-2 transition-colors",
                      isActive
                        ? "brass-face"
                        : "bg-page-edge text-quill/75 group-hover:text-quill",
                    )}
                  >
                    <motion.span
                      initial={false}
                      // The name only exists once the fan is open. Which tab
                      // your pointer is on is carried by `group-hover` on the
                      // face above — driving it from here would only respond
                      // to the pointer being on the glyphs themselves.
                      // The section you're on keeps its name showing at all
                      // times — the colour alone said "this one" without ever
                      // saying which one.
                      animate={{ opacity: tabsOpen || reduce || isActive ? 1 : 0 }}
                      transition={{ duration: 0.16 }}
                      className="text-[0.68rem] tracking-[0.16em] lg:text-xs"
                      style={{ writingMode: "vertical-rl", fontVariant: "small-caps" }}
                    >
                      {label}
                    </motion.span>
                  </motion.span>
                );
              }}
            </NavLink>
          ))}
        </nav>

        {/* The cover. It encloses the page and nothing else. */}
        <div
          className={cn(
            "surface-hide stitched relative z-10 flex min-h-0 flex-1 overflow-hidden p-2",
            "lg:rounded-[6px_10px_10px_6px] lg:p-3",
          )}
        >
        <LeafScrollProvider leafRef={leafRef}>
          {/* The leaf. Its paper grain and the shadow falling from the gutter
              live on this element, which never scrolls — hung on the scroll
              container itself they were one screen tall and slid away, so the
              texture stopped dead a screenful down. */}
          <div className="surface-leaf relative min-h-0 flex-1 rounded-[2px]">
          <main
            ref={leafRef}
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            style={{ perspective: "1400px" }}
          >
            {/* max-w-5xl on a spread: two pages need the width one didn't.
                The deep bottom padding is clearance for the dock and the add
                button, which would otherwise sit on top of the last entry. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={section}
                // The leaf is hinged at the gutter, so it swings from its left
                // edge — a rigid page turning, not a card crossfading.
                //
                // The dock floats over the leaf and is itself pushed up by the
                // home indicator, so the clearance beneath the last entry has
                // to carry that inset too — a fixed `pb-32` left the cashflow
                // plate sitting under the dock on a notched phone.
                style={{
                  transformOrigin: "left center",
                  paddingBottom: "calc(9rem + env(safe-area-inset-bottom))",
                }}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, rotateY: -9, x: -14 }
                }
                animate={{ opacity: 1, rotateY: 0, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, rotateY: 4, x: 10 }}
                transition={
                  reduce ? { duration: 0.12 } : { ...paperTurn, duration: 0.3 }
                }
                className="mx-auto w-full max-w-md pl-9 pr-4 pt-6 lg:max-w-5xl lg:py-6 lg:pl-16 lg:pr-10"
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          </main>
          </div>

          <BackToTop />
        </LeafScrollProvider>

        {/* Binding shadow down the spine */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-2.5"
          style={{
            background:
              "linear-gradient(90deg, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.12) 60%, transparent)",
          }}
        />

        {/* Silk ribbon, lying in the gutter. It swings a little as the leaf
            turns — the one thing in the book that isn't pinned down. */}
        <motion.span
          aria-hidden
          key={`ribbon-${section}`}
          initial={reduce ? false : { rotate: -1.4, y: -6 }}
          animate={{ rotate: 0, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="pointer-events-none absolute top-0 z-20 h-2/3 w-2.5"
          style={{
            left: "1.15rem",
            transformOrigin: "top center",
            background:
              "linear-gradient(90deg, var(--color-silk-lo), var(--color-silk) 35%, var(--color-silk-hi) 50%, var(--color-silk) 70%, var(--color-silk-lo))",
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
                animate={{ x: `${activeIndex * PILL_STRIDE}rem` }}
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
                    {/* The pill slides to the section you chose; the icon it
                        lands on rises to meet it. Without this the pill moves
                        under a row of glyphs that never acknowledge it. */}
                    <motion.span
                      initial={false}
                      animate={
                        reduce
                          ? { scale: 1, y: 0 }
                          : { scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }
                      }
                      transition={paperSettle}
                      className="flex items-center justify-center"
                    >
                      <Icon
                        className={cn(
                          "size-[21px] shrink-0 transition-colors duration-300",
                          isActive ? "text-[#24170a]" : "text-page-edge/70",
                        )}
                        strokeWidth={isActive ? 2.3 : 2}
                      />
                    </motion.span>
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
    </div>
  );
}
