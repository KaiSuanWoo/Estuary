import type { Transition, Variants } from "motion/react";
import { useReducedMotion } from "motion/react";

/**
 * Shared motion presets so every surface eases identically.
 *
 * Apple-feel motion is *spring-based*, not duration-based: things settle with a
 * little weight rather than easing on a fixed clock. Keep these few and reuse
 * them everywhere (nav pill, sheets, presses) for a coherent system.
 */

/** Snappy spring — nav pill, button press, small UI that should feel immediate. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 0.8,
};

/** Soft spring — sheets / larger surfaces sliding in. A touch more travel. */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 34,
  mass: 0.9,
};

/** Plain tween for pure fades (backdrops, opacity-only transitions). */
export const easeStandard: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

/** Re-export so callers import motion helpers from one place. */
export { useReducedMotion };

/**
 * Collapse a variants object to opacity-only when the user prefers reduced
 * motion: strip transforms (x/y/scale) and swap springs for an instant fade.
 * Pass the result straight to a `<motion.*>` `variants` prop.
 */
export function withReducedMotion(
  variants: Variants,
  reduced: boolean | null,
): Variants {
  if (!reduced) return variants;
  const out: Variants = {};
  for (const [key, value] of Object.entries(variants)) {
    if (value && typeof value === "object") {
      const opacity = (value as { opacity?: number }).opacity ?? 1;
      out[key] = { opacity, transition: { duration: 0.12 } };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Standard list-item entrance (used with a staggered parent). */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: springSoft },
};

/** Staggered container for list reveals. */
export const listContainerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
