import { cn } from "@/lib/cn";

/**
 * The Estuary mark — the flowing "E" of three streams (ivory spine,
 * river-blue, seafoam). Renders the brand artwork from /public.
 * Pass a sizing className (height-based, e.g. `h-9 w-auto`); `object-contain`
 * preserves the artwork's aspect ratio inside whatever box you give it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/dashboard_logo.png"
      alt="Estuary"
      className={cn("object-contain", className)}
    />
  );
}
