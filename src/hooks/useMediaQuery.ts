import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Used to branch the Activity list between the
 * mobile (infinite-scroll) and desktop (paged) presentations at the `lg`
 * breakpoint, matching the Tailwind layout switch in AppShell.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
