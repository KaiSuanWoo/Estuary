import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import {
  useBudgets,
  useBudgetLinks,
  useBudgetTransactionLinks,
} from "@/hooks/useBudgets";
import { goalFunding, groupLinks, groupTxnLinks, periodLabel } from "@/lib/budgets";
import { budgetMetrics, type BudgetMetrics } from "@/lib/budget-metrics";
import { readBudgetDensity, writeBudgetDensity, type Density } from "@/lib/ledger";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui";
import {
  LeadFigure,
  MarginLink,
  Register,
  Statement,
} from "@/components/ledger";

/** A percentage, written the way a ledger writes one. */
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** A deviation, always signed, so its direction reads before its size. */
const signedPct = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 100))}%`;

/**
 * Budgets, read rather than described.
 *
 * Every judgement on this page is a figure or a mark: how much of the
 * allocation is used, how much of the period is gone, and the gap between
 * them. Nothing is narrated — "running hot" is only `deviation > 0` said in
 * a sentence, and the sentence is the part that doesn't scale to eight
 * budgets at a glance.
 */
export function BudgetsBoard() {
  const base = useBaseCurrency();
  const rates = useRateMap();
  const { data: txns = [], isLoading } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const { data: budgetTxnLinks = [] } = useBudgetTransactionLinks();
  const reimbursed = useReimbursedAmountMap();

  const [density, setDensity] = useState<Density>(readBudgetDensity);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const view = useMemo(() => {
    const links = groupLinks(budgetLinks);
    const txnLinks = groupTxnLinks(budgetTxnLinks);

    const spending = budgets.filter(
      (b) => b.type !== "goal" && b.direction !== "saving",
    );
    const rows = spending.map((b) =>
      budgetMetrics(
        b,
        links.get(b.id) ?? new Set<string>(),
        categories,
        txns,
        base,
        rates,
        reimbursed,
      ),
    );

    const allocated = rows.reduce((s, r) => s + r.allocated, 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);
    // The tightest window still running is what "left" has to last.
    const daysLeft = rows.reduce<number | null>((min, r) => {
      if (r.daysLeft == null) return min;
      return min == null ? r.daysLeft : Math.min(min, r.daysLeft);
    }, null);

    // Pace is only measured over budgets that actually accrue. Fold a fixed
    // cost into the aggregate and one rent payment on the 3rd makes the whole
    // page look 70 points ahead of the month.
    const pacing = rows.filter((r) => r.paces && r.elapsed != null);
    const elapsed = pacing.length
      ? Math.max(...pacing.map((r) => r.elapsed!))
      : null;
    const pacingAllocated = pacing.reduce((s, r) => s + r.allocated, 0);
    const pacingSpent = pacing.reduce((s, r) => s + r.spent, 0);
    const pacingUsed = pacingAllocated > 0 ? pacingSpent / pacingAllocated : null;

    const saving = budgets
      .filter((b) => b.type !== "goal" && b.direction === "saving")
      .map((b) =>
        budgetMetrics(
          b,
          links.get(b.id) ?? new Set<string>(),
          categories,
          txns,
          base,
          rates,
          reimbursed,
        ),
      );

    const goals = budgets
      .filter((b) => b.type === "goal")
      .map((b) => ({
        b,
        funding: goalFunding(
          b,
          txnLinks.get(b.id) ?? new Set<string>(),
          txns,
          base,
          rates,
          reimbursed,
        ),
      }));

    return { rows, saving, goals, allocated, spent, daysLeft, elapsed, pacingUsed };
  }, [budgets, budgetLinks, budgetTxnLinks, txns, categories, base, rates, reimbursed]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (view.rows.length === 0 && view.saving.length === 0 && view.goals.length === 0) {
    return (
      <div className="border border-dashed border-rule px-6 py-14 text-center">
        <p className="text-quill">No budgets set.</p>
        <Link to="/budgets" className="mt-4 inline-block">
          <MarginLink>set a budget</MarginLink>
        </Link>
      </div>
    );
  }

  const used = view.allocated > 0 ? view.spent / view.allocated : 0;
  const left = view.allocated - view.spent;
  const deviation =
    view.elapsed == null || view.pacingUsed == null ? null : view.pacingUsed - view.elapsed;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <LeadFigure
        label={left >= 0 ? "Left to spend" : "Over"}
        value={formatMoney(Math.abs(left), base)}
        tone={left >= 0 ? undefined : "debit"}
      />

      <Statement
        rows={[
          { label: "Allocated", value: formatMoney(view.allocated, base) },
          { label: "Spent", value: formatMoney(view.spent, base), tone: "debit" },
          { label: "Used", value: pct(used) },
          ...(view.elapsed != null
            ? [{ label: "Period elapsed", value: pct(view.elapsed) }]
            : []),
          ...(deviation != null
            ? [
                {
                  label: "Deviation",
                  value: signedPct(deviation),
                  tone: (deviation > 0.02 ? "debit" : "credit") as "debit" | "credit",
                },
              ]
            : []),
          ...(view.daysLeft != null
            ? [{ label: "Days left", value: String(view.daysLeft) }]
            : []),
        ]}
        total={{
          label: left >= 0 ? "Remaining" : "Overspent",
          value: formatMoney(Math.abs(left), base),
          tone: left >= 0 ? "credit" : "debit",
        }}
      />

      {view.rows.length > 0 && (
        <Register
          title="Allocations"
          action={
            <span className="flex items-center gap-3">
              <span className="inline-flex overflow-hidden rounded-[2px] border border-rule text-[0.7rem]">
                {(["compact", "detailed"] as Density[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDensity(d);
                      writeBudgetDensity(d);
                      setOpen(new Set());
                    }}
                    aria-pressed={density === d}
                    className={cn(
                      "tap px-2 py-1 capitalize transition-colors",
                      density === d ? "brass-face" : "text-quill-soft hover:text-quill",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </span>
              <Link to="/budgets">
                <MarginLink>edit</MarginLink>
              </Link>
            </span>
          }
        >
          <div>
            {view.rows.map((m) => (
              <AllocationRow
                key={m.budget.id}
                m={m}
                base={base}
                density={density}
                open={density === "detailed" || open.has(m.budget.id)}
                onToggle={() => toggle(m.budget.id)}
              />
            ))}
          </div>
        </Register>
      )}

      {view.saving.length > 0 && (
        <Register title="Put aside">
          <div>
            {view.saving.map((m) => (
              <AllocationRow
                key={m.budget.id}
                m={m}
                base={base}
                density={density}
                tone="credit"
                open={density === "detailed" || open.has(m.budget.id)}
                onToggle={() => toggle(m.budget.id)}
              />
            ))}
          </div>
        </Register>
      )}

      {view.goals.length > 0 && (
        <Register
          title="Goals"
          action={
            <Link to="/budgets">
              <MarginLink>manage</MarginLink>
            </Link>
          }
        >
          {view.goals.map(({ b, funding }) => {
            const ratio = b.amount > 0 ? funding.saved / b.amount : 0;
            return (
              <div key={b.id} className="border-b border-rule py-2.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-quill">{b.name}</span>
                  <span className="tnum shrink-0 text-sm text-quill-soft">
                    {formatMoney(funding.saved, base)}
                    <span className="text-quill-faint">
                      {" "}
                      / {formatMoney(b.amount, base)}
                    </span>
                    <span className="ml-2 text-quill">{pct(ratio)}</span>
                  </span>
                </div>
                <Meter segments={[{ frac: ratio, className: "bg-credit" }]} />
              </div>
            );
          })}
        </Register>
      )}
    </>
  );
}

/**
 * One allocation. The bar is built from the budget's own categories, so a
 * bundle shows its composition without being opened — and opening it puts
 * numbers against the segments you can already see.
 */
function AllocationRow({
  m,
  base,
  density,
  tone,
  open,
  onToggle,
}: {
  m: BudgetMetrics;
  base: string;
  density: Density;
  tone?: "credit";
  open: boolean;
  onToggle: () => void;
}) {
  const over = m.used > 1;
  const many = m.breakdown.length > 1;

  // Over the limit the bar stops describing composition and starts describing
  // the overspend, because that is the thing worth seeing at a glance.
  const segments = over
    ? [
        { frac: 1 / m.used, className: "bg-head-3" },
        { frac: 1 - 1 / m.used, className: "bg-debit" },
      ]
    : tone === "credit"
      ? [{ frac: m.used, className: "bg-credit" }]
      : m.breakdown.map((c, i) => ({
          frac: c.shareOfAllocated,
          color: c.color,
          key: c.id,
          className: i % 2 ? "opacity-90" : undefined,
        }));

  return (
    <div className="border-b border-rule py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={many ? onToggle : undefined}
        aria-expanded={many ? open : undefined}
        className={cn("flex w-full items-baseline justify-between gap-3 text-left", !many && "cursor-default")}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          {many && (
            <ChevronRight
              className={cn(
                "size-3 shrink-0 text-quill-faint transition-transform",
                open && "rotate-90",
              )}
            />
          )}
          <span className="truncate text-quill">{m.budget.name}</span>
          <span className="shrink-0 text-xs italic text-quill-faint">
            {periodLabel(m.budget)}
          </span>
        </span>
        <span className="tnum shrink-0 text-sm text-quill-soft">
          {formatMoney(m.spent, base)}
          <span className="text-quill-faint"> / {formatMoney(m.allocated, base)}</span>
        </span>
      </button>

      <Meter segments={segments} elapsed={tone ? null : m.elapsed} />

      {/* The figures the bar can only approximate. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
        <Figure label="used" value={pct(m.used)} tone={over ? "debit" : undefined} />
        {m.elapsed != null && <Figure label="elapsed" value={pct(m.elapsed)} />}
        {m.deviation != null && (
          <Figure
            label="dev"
            value={signedPct(m.deviation)}
            tone={m.deviation > 0.02 ? "debit" : m.deviation < -0.02 ? "credit" : undefined}
          />
        )}
        <Figure
          label={m.left >= 0 ? "left" : "over"}
          value={formatMoney(Math.abs(m.left), base)}
          tone={m.left >= 0 ? undefined : "debit"}
        />
        {m.projected != null && (
          <Figure
            label="proj"
            value={formatMoney(m.projected, base)}
            tone={m.projected > m.allocated ? "debit" : undefined}
          />
        )}
        {m.perDay != null && (
          <Figure label="per day" value={formatMoney(m.perDay, base)} />
        )}
      </div>

      {open && many && (
        <div className="mt-2 border-l border-rule pl-3">
          {m.breakdown.map((c) => (
            <div key={c.id} className="py-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate text-sm text-quill-soft">{c.name}</span>
                </span>
                <span className="tnum shrink-0 text-xs text-quill-soft">
                  {formatMoney(c.spent, base)}
                  <span className="ml-2 text-quill-faint">{pct(c.shareOfSpent)}</span>
                </span>
              </div>
              <Meter
                thin
                segments={[{ frac: c.shareOfAllocated, color: c.color }]}
              />
            </div>
          ))}
        </div>
      )}

      {open && density === "detailed" && m.history.length > 1 && (
        <CycleStrip m={m} base={base} />
      )}
    </div>
  );
}

/** A label and its figure, set as one small unit. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "credit" | "debit";
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-quill-faint">{label} </span>
      <span
        className={cn(
          "tnum",
          tone === "debit" ? "text-debit" : tone === "credit" ? "text-credit" : "text-quill",
        )}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * The bar. Segments are drawn in order and clipped at the track, so a bundle
 * reads as its parts; the tick is where an even pace would have reached.
 */
function Meter({
  segments,
  elapsed,
  thin,
}: {
  segments: { frac: number; color?: string; className?: string; key?: string }[];
  elapsed?: number | null;
  thin?: boolean;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.frac), 0);
  const showTick = elapsed != null && elapsed > 0.02 && elapsed < 0.98;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, total) * 100)}
      className={cn(
        "relative mt-1.5 flex overflow-hidden bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]",
        thin ? "h-1" : "h-1.5",
      )}
    >
      {segments.map((s, i) => (
        <div
          key={s.key ?? i}
          className={cn("h-full", s.className)}
          style={{
            width: `${Math.max(0, Math.min(100, s.frac * 100))}%`,
            backgroundColor: s.color,
          }}
        />
      ))}
      {showTick && (
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-quill/70"
          style={{ left: `${elapsed! * 100}%` }}
        />
      )}
    </div>
  );
}

/** The last several windows, each against its own allocation. */
function CycleStrip({ m, base }: { m: BudgetMetrics; base: string }) {
  const max = Math.max(m.allocated, ...m.history.map((h) => h.spent)) || 1;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs text-quill-faint">By cycle</p>
      {/* The row must stretch, not align to its baseline: `items-end` sizes each
          column to its label and the bars then have no height to be a
          percentage of. */}
      <div className="flex gap-1.5" style={{ height: 52 }}>
        {m.history.map((h) => (
          <div key={h.label} className="flex h-full flex-1 flex-col items-center gap-1">
            <div className="relative flex min-h-0 w-full flex-1 items-end">
              {/* The line the bar was trying to stay under. */}
              <span
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-rule-strong"
                style={{ bottom: `${(m.allocated / max) * 100}%` }}
              />
              <div
                title={`${h.label}: ${formatMoney(h.spent, base)} of ${formatMoney(h.allocated, base)}`}
                className={cn("w-full", h.used > 1 ? "bg-debit" : "bg-head-1")}
                style={{ height: `${(h.spent / max) * 100}%` }}
              />
            </div>
            <span className="text-[0.65rem] text-quill-faint">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
