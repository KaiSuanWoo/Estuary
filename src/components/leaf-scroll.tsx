import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

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

/** Returns a function that sends the leaf back to its head. */
export function useLeafTop(): (behavior?: ScrollBehavior) => void {
  const leafRef = useContext(LeafScrollCtx);
  return useCallback(
    (behavior: ScrollBehavior = "smooth") =>
      leafRef?.current?.scrollTo({ top: 0, behavior }),
    [leafRef],
  );
}
