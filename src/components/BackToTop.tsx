import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Floating "scroll to top" button. Fades in once the page is scrolled past a
 * threshold; centred along the bottom of the screen.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      className={cn(
        "fixed bottom-20 left-1/2 z-30 -translate-x-1/2 p-2 text-ink-300 transition-opacity",
        "drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] hover:text-ink-50 lg:bottom-6",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ChevronUp className="size-8" strokeWidth={2.5} />
    </button>
  );
}
