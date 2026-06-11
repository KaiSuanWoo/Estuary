import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search box) so it only updates
 * downstream — and only triggers a server query — after the user pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
