/**
 * True when running as an installed PWA (home-screen / dock app) rather than a
 * regular browser tab. Used to keep the marketing landing page out of the
 * installed app — installed users go straight to the app.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
