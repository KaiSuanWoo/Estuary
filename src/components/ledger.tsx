import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Structural pieces of a ledger page.
 *
 * These exist to replace the dashboard vocabulary — stat tiles, widget cards, a
 * uniform grid — with the one bookkeeping actually uses: a spread of two facing
 * pages, a running head, a set statement closed by a double rule, registers of
 * ruled entries, and plates tipped in among them. Nothing here is a box.
 */

/**
 * The book lies open. The verso (left) holds your **position** — what you have.
 * The recto (right) holds the **movement** — what happened. That division is a
 * real accounting one, not a convenient way to fill two columns.
 *
 * A phone gets the recto alone. Stacking both pages buried the month you're
 * living in under a screenful of balances, and those balances are one tap away
 * under Accounts — so the verso is simply the page you gain when there's room
 * for it, the way a second page appears only when a book is open flat.
 */
export function Spread({ verso, recto }: { verso: ReactNode; recto: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[1fr_3rem_1fr]">
      <section className="hidden min-w-0 lg:block">{verso}</section>

      {/* The fold. Both pages curve down into the binding. */}
      <div aria-hidden className="relative hidden lg:block">
        <span
          className="absolute inset-y-0 left-0 w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgb(0 0 0 / 0.07) 38%, rgb(0 0 0 / 0.14) 50%, rgb(0 0 0 / 0.07) 62%, transparent)",
          }}
        />
      </div>

      <section className="min-w-0">{recto}</section>
    </div>
  );
}

/**
 * The figure a page is *about* — set large enough to lead everything under it.
 * Without one, a page of evenly-sized statements has no first thing to read,
 * which is what left the verso feeling empty rather than composed.
 */
export function LeadFigure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "credit" | "debit";
}) {
  return (
    <div className="pb-1">
      <p
        className="text-xs tracking-[0.16em] text-quill-soft"
        style={{ fontVariant: "small-caps" }}
      >
        {label}
      </p>
      <p
        className={cn(
          "tnum mt-0.5 text-[2.6rem] leading-[1.05] tracking-[-0.01em] lg:text-[3.1rem]",
          tone === "credit" ? "text-credit" : tone === "debit" ? "text-debit" : "text-quill",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * The running head of a page: what this page is, and what it's about, closed
 * with a brass rule.
 */
export function PageHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="min-w-0 whitespace-nowrap text-lg tracking-[0.08em] text-quill lg:text-xl"
          style={{ fontVariant: "small-caps" }}
        >
          {title}
        </h2>
        {action && <span className="min-w-0 shrink">{action}</span>}
      </div>
      {note && <p className="mt-0.5 text-xs italic text-quill-faint">{note}</p>}
      <hr className="brass-rule mt-1.5" />
    </header>
  );
}

export interface StatementRow {
  label: ReactNode;
  value: string;
  /** Direction, when the row is a movement rather than a position. */
  tone?: "credit" | "debit";
  note?: string;
}

/**
 * A set statement: labels on the left, figures aligned on the right, leader
 * dots carrying the eye between them, and the total closed with the double rule
 * that ends an account. This replaces a row of stat tiles — same numbers, real
 * hierarchy.
 */
export function Statement({
  rows,
  total,
}: {
  rows: StatementRow[];
  total?: StatementRow;
}) {
  const toneClass = (t?: StatementRow["tone"]) =>
    t === "credit" ? "text-credit" : t === "debit" ? "text-debit" : "text-quill";

  return (
    <div className="text-[0.94rem]">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline gap-2 py-[0.3rem]">
          <span className="shrink-0 text-quill-soft">{r.label}</span>
          <span
            aria-hidden
            className="min-w-3 flex-1 translate-y-[-0.3em] border-b border-dotted border-rule"
          />
          <span className={cn("tnum shrink-0", toneClass(r.tone))}>{r.value}</span>
        </div>
      ))}

      {total && (
        <div
          className="mt-1 flex items-baseline gap-2 pt-2"
          style={{
            borderTop: "1px solid var(--color-rule-strong)",
            borderBottom: "3px double var(--color-rule-strong)",
            paddingBottom: "0.45rem",
          }}
        >
          <span
            className="shrink-0 tracking-[0.05em] text-quill"
            style={{ fontVariant: "small-caps" }}
          >
            {total.label}
          </span>
          <span aria-hidden className="min-w-3 flex-1" />
          <span
            className={cn("tnum shrink-0 text-lg", toneClass(total.tone))}
          >
            {total.value}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A run of entries under a heading. Ruled off above, so sections are separated
 * by a line and a little air rather than by a border on four sides.
 */
export function Register({
  title,
  note,
  action,
  children,
  className,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-6", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1">
        <h3
          className="text-sm tracking-[0.14em] text-quill-soft"
          style={{ fontVariant: "small-caps" }}
        >
          {title}
        </h3>
        {action}
      </div>
      {note && <p className="mt-1 text-xs italic text-quill-faint">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A figure tipped into the page — captioned above, ruled off, and given room.
 * Deliberately not a card: an engraving interrupts the text, it doesn't float
 * beside it.
 */
export function Plate({
  caption,
  note,
  action,
  children,
}: {
  caption: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="mt-6">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-rule pb-1">
        <span
          className="text-sm tracking-[0.14em] text-quill-soft"
          style={{ fontVariant: "small-caps" }}
        >
          {caption}
        </span>
        {action}
      </figcaption>
      {note && <p className="mt-1 text-xs italic text-quill-faint">{note}</p>}
      <div className="mt-3">{children}</div>
    </figure>
  );
}

/** An action written in the margin rather than drawn as a button. */
export function MarginLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs italic text-quill-faint underline decoration-rule underline-offset-4 transition-colors hover:text-quill">
      {children}
    </span>
  );
}

/**
 * The ink a head is written in, by rank. Five inks exist; everything past them
 * shares the sixth, which is why category charts fold their tail into "Other".
 * Rank rather than stored colour, so a head keeps one ink across every chart.
 */
export function headInk(rank: number, ink: Ink): string {
  const scale = [
    ink["--color-head-1"],
    ink["--color-head-2"],
    ink["--color-head-3"],
    ink["--color-head-4"],
    ink["--color-head-5"],
  ];
  return scale[rank] ?? ink["--color-head-other"];
}

const INK_VARS = [
  "--color-quill",
  "--color-quill-soft",
  "--color-quill-faint",
  "--color-rule",
  "--color-rule-strong",
  "--color-page",
  "--color-credit",
  "--color-debit",
  "--color-head-1",
  "--color-head-2",
  "--color-head-3",
  "--color-head-4",
  "--color-head-5",
  "--color-head-other",
] as const;

export type Ink = Record<(typeof INK_VARS)[number], string>;

function readInk(): Ink {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    INK_VARS.map((v) => [v, cs.getPropertyValue(v).trim()]),
  ) as Ink;
}

/**
 * Resolved ink values for charts.
 *
 * SVG presentation attributes can't read `var()`, and charting libraries set
 * `fill` as an attribute — so the tokens have to be resolved in JS. Re-reads
 * whenever the lamp changes, by either route.
 */
export function useLedgerInk(): Ink {
  const [ink, setInk] = useState<Ink>(readInk);

  useEffect(() => {
    const refresh = () => setInk(readInk());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lamp", "data-hide"],
    });
    return () => {
      mq.removeEventListener("change", refresh);
      observer.disconnect();
    };
  }, []);

  return ink;
}
