import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLeafScroll, useLeafTop } from "@/components/leaf-scroll";

/**
 * Back to the head of the leaf. Appears once you've read a long way down and
 * sits centred at the top, clear of everything else.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);
  const toTop = useLeafTop();

  // Roughly a screenful. The old 1200 was tuned for a scrolling window; a leaf
  // is only ever as tall as its own content and often never reaches that.
  useLeafScroll((y) => setShow(y > 600));

  return (
    <button
      type="button"
      onClick={() => toTop()}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      className={cn(
        "absolute left-1/2 top-4 z-30 flex size-9 -translate-x-1/2 items-center justify-center",
        "rounded-full border border-rule bg-page text-quill-soft",
        "shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-all duration-200 hover:text-quill",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0",
      )}
    >
      <ChevronUp className="size-5" strokeWidth={2.5} />
    </button>
  );
}
