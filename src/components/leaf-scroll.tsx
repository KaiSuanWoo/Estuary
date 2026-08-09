import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/**
 * The leaf scrolls, not the window.
 *
 * A bound book keeps its cover and tabs still while the page moves under your
 * eye, so the shell owns a single scrolling element and everything that used to
 * watch `window.scrollY` subscribes here instead. It's also what makes the
 * page-turn possible later — you can't cleanly turn a window-scrolled document.
 */

type LeafRef = RefObject<HTMLElement | null>;

const LeafScrollCtx = createContext<LeafRef | null>(null);

export function LeafScrollProvider({
  leafRef,
  children,
}: {
  leafRef: LeafRef;
  children: ReactNode;
}) {
  return <LeafScrollCtx.Provider value={leafRef}>{children}</LeafScrollCtx.Provider>;
}

/**
 * Call `onScroll` with the leaf's scroll offset, now and on every scroll.
 * The callback is held in a ref so callers can pass an inline closure without
 * re-subscribing on every render.
 */
export function useLeafScroll(onScroll: (y: number) => void): void {
  const leafRef = useContext(LeafScrollCtx);
  const cb = useRef(onScroll);
  cb.current = onScroll;

  useEffect(() => {
    const el = leafRef?.current;
    if (!el) return;
    const handle = () => cb.current(el.scrollTop);
    handle(); // report the current position immediately
    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }, [leafRef]);
}

/**
 * Renders into `document.body`, outside the book entirely.
 *
 * The leaf carries `perspective` so the page can turn, and a perspective makes
 * an element a containing block for `position: fixed` descendants — so anything
 * fixed that a route renders would anchor to the leaf rather than the window,
 * landing sheets inside the page area and the floating buttons a cover's worth
 * off the bottom of the screen. Overlays and floating chrome go through here so
 * no ancestor can capture them.
 */
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

/**
 * Hold the leaf still while something is open on top of it.
 *
 * Locks the leaf (which is what actually scrolls) and the document, and
 * restores whatever was there before — a second sheet opening over the first
 * must not clear the first one's lock when it closes.
 */
export function useScrollLock(active: boolean): void {
  const leafRef = useContext(LeafScrollCtx);
  useEffect(() => {
    if (!active) return;
    const leaf = leafRef?.current;
    const prevLeaf = leaf?.style.overflow ?? "";
    const prevBody = document.body.style.overflow;
    if (leaf) leaf.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (leaf) leaf.style.overflow = prevLeaf;
      document.body.style.overflow = prevBody;
    };
  }, [active, leafRef]);
}

/** Returns a function that sends the leaf back to its head. */
export function useLeafTop(): (behavior?: ScrollBehavior) => void {
  const leafRef = useContext(LeafScrollCtx);
  return useCallback(
    (behavior: ScrollBehavior = "smooth") =>
      leafRef?.current?.scrollTo({ top: 0, behavior }),
    [leafRef],
  );
}
