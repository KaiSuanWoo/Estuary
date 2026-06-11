import {
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { easeStandard, springSoft, useReducedMotion } from "@/lib/motion";

/** A surface card with the app's signature dark, slightly-translucent panel. */
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-800/80 bg-ink-900/60 p-4 backdrop-blur",
        interactive &&
          "cursor-pointer transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-ink-700 hover:shadow-[var(--shadow-float)]",
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
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium",
        "transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
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
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
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

/** A shimmering placeholder block. Compose with width/height/rounded classes. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("skeleton rounded-md", className)}
      aria-hidden="true"
    />
  );
}

/** Placeholder sized to a transaction list row (icon · label/sub · amount). */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-1 py-3" aria-hidden="true">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/**
 * Shared modal for every add/edit form. Floats above the content (constrained to
 * the same width as the page content — max-w-md on mobile, max-w-2xl on desktop),
 * anchored to the bottom on small screens and centred on large ones.
 *
 * Animation is fully self-contained: the component keeps an internal `open`
 * state so backdrop/close-button dismissals can play an exit transition before
 * the real `onClose` fires (via AnimatePresence's onExitComplete). Call sites
 * keep the simple `{cond && <Sheet onClose=… />}` pattern — no changes needed.
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
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);

  const panelMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, y: 24, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 24, scale: 0.98 },
        transition: springSoft,
      };

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24 pt-10 lg:items-center lg:py-8">
          <motion.button
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={easeStandard}
          />
          <motion.div
            className="relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-ink-800 bg-ink-900 px-5 pb-5 pt-4 lg:max-w-2xl"
            style={{ boxShadow: "var(--shadow-sheet)" }}
            {...panelMotion}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-50">{title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100"
              >
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
