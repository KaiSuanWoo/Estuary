import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** A surface card with the app's signature dark, slightly-translucent panel. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-800/80 bg-ink-900/60 p-4 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "md" | "sm";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-11 px-4 text-sm" : "h-9 px-3 text-sm",
        variant === "primary" && "bg-teal-500 text-ink-950 hover:bg-teal-400",
        // outline = "Add"-style action: same teal family as primary "New", but
        // hollow so the two are instantly distinguishable.
        variant === "outline" &&
          "border border-teal-500/40 text-teal-300 hover:border-teal-400/70 hover:bg-teal-500/10",
        variant === "ghost" &&
          "bg-ink-800/60 text-ink-100 hover:bg-ink-700/60",
        variant === "danger" && "bg-red-500/90 text-white hover:bg-red-500",
        className,
      )}
      {...props}
    />
  );
}

/** Page header with a title and optional trailing action. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700/70 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-500">{icon}</div>}
      <p className="font-medium text-ink-200">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "size-5 animate-spin rounded-full border-2 border-ink-600 border-t-teal-400",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * Shared modal for every add/edit form. Floats above the content (constrained to
 * the same width as the page content — max-w-md on mobile, max-w-2xl on desktop),
 * anchored to the bottom on small screens and centred on large ones.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24 pt-10 lg:items-center lg:py-8">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
      />
      <div className="relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-ink-800 bg-ink-900 px-5 pb-5 pt-4 shadow-2xl shadow-ink-950/40 lg:max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
