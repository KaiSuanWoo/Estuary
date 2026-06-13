import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { appScrollEl } from "@/lib/scroll";

/**
 * Floating "scroll to top" button. Fades/slides in from the top once the page
 * is scrolled past a threshold; centred at the top of the screen (clearing the
 * sticky header on desktop), so it never collides with bottom content.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = appScrollEl();
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > 1200);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => appScrollEl()?.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      style={{ top: "calc(env(safe-area-inset-top) + 0.9rem)" }}
      className={cn(
        "fixed left-1/2 z-40 flex size-10 -translate-x-1/2 items-center justify-center rounded-full",
        "border border-ink-700/60 bg-ink-950/70 text-ink-200 backdrop-blur-xl",
        "shadow-[var(--shadow-float)] transition-all duration-200 hover:text-ink-50",
        // Desktop: sit just below the sticky top nav bar (h-16).
        "lg:!top-20",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0",
      )}
    >
      <ChevronUp className="size-5" strokeWidth={2.5} />
    </button>
  );
}
