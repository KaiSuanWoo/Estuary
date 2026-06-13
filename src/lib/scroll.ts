/**
 * The app shell's internal scroll container (`<main id="app-scroll">` in
 * AppShell). The content scrolls here rather than on the document so the mobile
 * browser toolbar stays stable and the floating dock doesn't jump. Components
 * that watch or drive scrolling target this element instead of `window`.
 */
export function appScrollEl(): HTMLElement | null {
  return typeof document !== "undefined"
    ? document.getElementById("app-scroll")
    : null;
}
