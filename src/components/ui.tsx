import {
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { easeStandard, paperSettle, useReducedMotion } from "@/lib/motion";

/** A block of entries ruled onto the leaf. */
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "leaf-panel p-4",
        interactive &&
          "cursor-pointer transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-rule-strong",
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
        "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium",
        "transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        size === "md" ? "h-11 px-4 text-sm" : "h-9 px-3 text-sm",
        // Primary actions are the book's hardware: brass.
        variant === "primary" && "brass-face hover:brightness-110",
        variant === "outline" &&
          "border border-rule-strong text-quill hover:border-brass hover:text-brass-lo",
        variant === "ghost" &&
          "border border-transparent text-quill-soft hover:border-rule hover:text-quill",
        variant === "danger" && "bg-debit text-page hover:brightness-110",
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
    <header className="mb-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1
            className="text-3xl tracking-[0.02em] text-quill"
            style={{ fontVariant: "small-caps" }}
          >
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-quill-soft">{subtitle}</p>}
        </div>
        {action}
      </div>
      <hr className="brass-rule mt-2" />
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
    <div className="flex flex-col items-center justify-center rounded-[2px] border border-dashed border-rule px-6 py-12 text-center">
      {icon && <div className="mb-3 text-quill-faint">{icon}</div>}
      <p className="font-medium text-quill">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-quill-soft">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "size-5 animate-spin rounded-full border-2 border-rule border-t-brass",
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

  // A loose card slid into the book: it comes up, tilts level, and settles.
  // Paper has no rebound, so there is no overshoot on the way in.
  const panelMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, y: 40, rotate: -0.6 },
        animate: { opacity: 1, y: 0, rotate: 0 },
        exit: { opacity: 0, y: 32, rotate: -0.4 },
        transition: paperSettle,
      };

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24 pt-10 lg:items-center lg:py-8">
          <motion.button
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={easeStandard}
          />
          <motion.div
            className="surface-leaf relative max-h-full w-full max-w-md overflow-y-auto rounded-[3px] px-5 pb-5 pt-4 lg:max-w-2xl"
            style={{ boxShadow: "var(--shadow-book)" }}
            {...panelMotion}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2
                className="text-lg tracking-[0.04em] text-quill"
                style={{ fontVariant: "small-caps" }}
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full border border-rule text-quill-soft transition-colors hover:border-rule-strong hover:text-quill"
              >
                <X className="size-4" />
              </button>
            </div>
            <hr className="brass-rule mb-4" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
