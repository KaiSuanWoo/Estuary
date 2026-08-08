import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, subMonths } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import {
  useBudgets,
  useBudgetLinks,
  useBudgetTransactionLinks,
} from "@/hooks/useBudgets";
import {
  budgetPacing,
  goalFunding,
  groupLinks,
  groupTxnLinks,
  periodLabel,
  spendForBudget,
} from "@/lib/budgets";
import { breakdownByCategory, monthBounds } from "@/lib/analytics";
import { formatMoney, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui";
import {
  LeadFigure,
  MarginLink,
  Plate,
  Register,
  Statement,
  useLedgerInk,
} from "@/components/ledger";
import type { Budget } from "@/lib/types";

/**
 * How much of a budget lands in one month, whatever period it is kept over.
 * Custom windows have no natural monthly figure, so they are left out of any
 * month-by-month comparison rather than guessed at.
 */
function monthlyEquivalent(b: Budget): number | null {
  switch (b.period) {
    case "weekly":
      return (b.amount * 52) / 12;
    case "yearly":
      return b.amount / 12;
    case "monthly":
      return b.amount;
    default:
      return null;
  }
}

/**
 * Budgets, kept where the analysis is.
 *
 * This is not the budget editor — that stays at /budgets. This page answers
 * three questions a list of limits can't: am I on pace, do I habitually run
 * over, and what am I spending on that no budget is watching.
 */
export function BudgetsBoard() {
  const base = useBaseCurrency();
  const rates = useRateMap();
  const ink = useLedgerInk();
  const { data: txns = [], isLoading } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const { data: budgetTxnLinks = [] } = useBudgetTransactionLinks();
  const reimbursed = useReimbursedAmountMap();

  const view = useMemo(() => {
    const links = groupLinks(budgetLinks);
    const txnLinks = groupTxnLinks(budgetTxnLinks);
    const now = new Date();

    // Entries dated ahead of today are already committed but haven't happened
    // yet, so they must not be fed into a run-rate — a rent payment booked for
    // the 28th would otherwise imply you spend that much every day.
    const today = todayISO();
    const booked = txns.filter((t) => t.date <= today);

    const spending = budgets.filter(
      (b) => b.type !== "goal" && b.direction !== "saving",
    );
    const rows = spending
      .map((b) => {
        const catIds = links.get(b.id) ?? new Set<string>();
        const spent = spendForBudget(b, catIds, txns, base, rates, reimbursed);
        const toDate = spendForBudget(b, catIds, booked, base, rates, reimbursed);
        const pacing = budgetPacing(b, spent);
        // Extrapolate the rate you've actually spent at, then add what's
        // already on the books for the rest of the period.
        const projected =
          pacing.elapsedRatio && pacing.elapsedRatio > 0.02
            ? toDate / pacing.elapsedRatio + (spent - toDate)
            : null;
        return { b, catIds, spent, pacing: { ...pacing, projected } };
      })
      .sort((x, y) => y.spent / (y.b.amount || 1) - x.spent / (x.b.amount || 1));

    const budgeted = rows.reduce((s, r) => s + r.b.amount, 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);

    // Days left in the shortest window still running — what "left to spend"
    // has to last. Budgets on different periods make one number a fiction, so
    // the tightest one wins.
    const daysLeft = rows.reduce<number | null>((min, r) => {
      const d = r.pacing.daysLeft;
      if (d == null) return min;
      return min == null ? d : Math.min(min, d);
    }, null);

    // Running hot: projected to finish over the limit, worst overshoot first.
    const hot = rows
      .filter((r) => r.pacing.projected != null && r.pacing.projected > r.b.amount)
      .map((r) => ({ ...r, over: r.pacing.projected! - r.b.amount }))
      .sort((x, y) => y.over - x.over);

    // Unwatched: heads with real spend this month that no budget covers. The
    // point of the page — a budget you never set is invisible everywhere else.
    const watched = new Set<string>();
    for (const s of links.values()) for (const id of s) watched.add(id);
    const { from, to } = monthBounds(now);
    const unwatched = breakdownByCategory(
      txns,
      categories,
      base,
      rates,
      from,
      to,
      "expense",
      "net",
      txns,
    )
      .filter((c) => !watched.has(c.id) && c.value > 0)
      .slice(0, 6);
    const unwatchedTotal = unwatched.reduce((s, c) => s + c.value, 0);

    // Six months of actual spend on budgeted heads, against what was allowed.
    const allowance = spending.reduce((s, b) => s + (monthlyEquivalent(b) ?? 0), 0);
    const history = Array.from({ length: 6 }, (_, i) => {
      const when = subMonths(now, 5 - i);
      const actual = spending.reduce(
        (s, b) =>
          s +
          spendForBudget(
            b,
            links.get(b.id) ?? new Set<string>(),
            txns,
            base,
            rates,
            reimbursed,
            when,
          ),
        0,
      );
      return { label: format(when, "MMM"), actual, allowance };
    });

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

    const savings = budgets
      .filter((b) => b.type !== "goal" && b.direction === "saving")
      .map((b) => ({
        b,
        put: spendForBudget(
          b,
          links.get(b.id) ?? new Set<string>(),
          txns,
          base,
          rates,
          reimbursed,
        ),
      }));

    return {
      rows,
      budgeted,
      spent,
      daysLeft,
      hot,
      unwatched,
      unwatchedTotal,
      history,
      allowance,
      goals,
      savings,
    };
  }, [budgets, budgetLinks, budgetTxnLinks, txns, categories, base, rates, reimbursed]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (view.rows.length === 0 && view.goals.length === 0 && view.savings.length === 0) {
    return (
      <div className="border border-dashed border-rule px-6 py-14 text-center">
        <p className="text-quill">No budgets kept yet.</p>
        <p className="mx-auto mt-1 max-w-xs text-sm italic text-quill-faint">
          Set a limit against a head and this page will tell you whether you're
          on pace to hold it.
        </p>
        <Link to="/budgets" className="mt-4 inline-block">
          <MarginLink>set a budget</MarginLink>
        </Link>
      </div>
    );
  }

  const left = view.budgeted - view.spent;
  const overall = view.budgeted > 0 ? view.spent / view.budgeted : 0;

  return (
    <>
      <LeadFigure
        label={left >= 0 ? "Left to spend" : "Over budget"}
        value={formatMoney(Math.abs(left), base)}
        tone={left >= 0 ? undefined : "debit"}
      />
      <p className="-mt-1 text-xs italic text-quill-faint">
        {view.daysLeft != null
          ? `${view.daysLeft} day${view.daysLeft === 1 ? "" : "s"} left in the period`
          : "Across every budget you keep"}
        {left > 0 && view.daysLeft ? (
          <> · {formatMoney(left / view.daysLeft, base)} a day</>
        ) : null}
      </p>

      <div className="mt-4">
        <Statement
          rows={[
            { label: "Budgeted", value: formatMoney(view.budgeted, base) },
            { label: "Spent", value: formatMoney(view.spent, base), tone: "debit" },
          ]}
          total={{
            label: left >= 0 ? "Remaining" : "Overspent",
            value: formatMoney(Math.abs(left), base),
            tone: left >= 0 ? "credit" : "debit",
          }}
        />
      </div>

      {view.rows.length > 0 && (
        <Register
          title="Against budget"
          note={`${Math.round(overall * 100)}% of everything budgeted, spent`}
          action={
            <Link to="/budgets">
              <MarginLink>edit budgets</MarginLink>
            </Link>
          }
        >
          <div>
            {view.rows.map((r) => (
              <BudgetLine
                key={r.b.id}
                budget={r.b}
                spent={r.spent}
                pacing={r.pacing}
                base={base}
              />
            ))}
          </div>
        </Register>
      )}

      {view.allowance > 0 && (
        <Plate
          caption="Held, or not"
          note="Six months of spend on budgeted heads against the allowance"
        >
          <ResponsiveContainer width="100%" height={172}>
            <BarChart
              data={view.history}
              margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
            >
              <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }}
              />
              {/* The allowance has to sit inside the domain or the line that
                  marks it is discarded, so the axis is told about it. */}
              <YAxis
                hide
                domain={[0, (max: number) => Math.max(max, view.allowance) * 1.08]}
              />
              <Tooltip
                cursor={{ fill: "rgb(0 0 0 / 0.04)" }}
                contentStyle={{
                  background: ink["--color-page"],
                  border: `1px solid ${ink["--color-rule-strong"]}`,
                  borderRadius: 2,
                  fontSize: 12,
                  color: ink["--color-quill"],
                }}
                itemStyle={{ color: ink["--color-quill"] }}
                labelStyle={{ color: ink["--color-quill-soft"] }}
                formatter={(v: number) => formatMoney(Number(v), base)}
              />
              {/* The line you were trying to stay under. */}
              <ReferenceLine
                y={view.allowance}
                stroke={ink["--color-rule-strong"]}
                strokeDasharray="4 3"
              />
              <Bar dataKey="actual" name="Spent" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {view.history.map((h, i) => (
                  <Cell
                    key={i}
                    fill={
                      h.actual > view.allowance
                        ? ink["--color-debit"]
                        : ink["--color-head-1"]
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs italic text-quill-faint">
            Allowance {formatMoney(view.allowance, base)} a month · a red month
            went over it.
          </p>
        </Plate>
      )}

      {(view.hot.length > 0 || view.unwatched.length > 0) && (
        <Register
          title="Areas of focus"
          note="Where the month is most likely to get away from you"
        >
          {view.hot.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-xs italic text-quill-soft">
                Running hot — projected to finish over
              </p>
              {view.hot.map((r) => (
                <div
                  key={r.b.id}
                  className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-quill">{r.b.name}</span>
                  <span className="tnum shrink-0 text-sm text-debit">
                    {formatMoney(r.pacing.projected!, base)}
                    <span className="text-quill-faint">
                      {" "}
                      vs {formatMoney(r.b.amount, base)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {view.unwatched.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs italic text-quill-soft">
                Unwatched — spent this month under no budget at all (
                {formatMoney(view.unwatchedTotal, base)})
              </p>
              {view.unwatched.map((c) => (
                <div
                  key={c.id}
                  className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-quill">{c.name}</span>
                  <span className="tnum shrink-0 text-sm text-quill-soft">
                    {formatMoney(c.value, base)}
                  </span>
                </div>
              ))}
              <Link to="/budgets" className="mt-2 inline-block">
                <MarginLink>put a limit on one</MarginLink>
              </Link>
            </div>
          )}
        </Register>
      )}

      {view.savings.length > 0 && (
        <Register title="Put aside" note="Savings budgets — more is better">
          {view.savings.map(({ b, put }) => (
            <div
              key={b.id}
              className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0"
            >
              <span className="min-w-0 truncate text-quill">
                {b.name}
                <span className="ml-2 text-xs italic text-quill-faint">
                  {periodLabel(b)}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm text-credit">
                {formatMoney(put, base)}
                <span className="text-quill-faint">
                  {" "}
                  of {formatMoney(b.amount, base)}
                </span>
              </span>
            </div>
          ))}
        </Register>
      )}

      {view.goals.length > 0 && (
        <Register
          title="Goals"
          note="Funded by the entries you assign to them"
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
                      of {formatMoney(b.amount, base)}
                    </span>
                  </span>
                </div>
                <Bar2 ratio={ratio} tone="credit" />
              </div>
            );
          })}
        </Register>
      )}
    </>
  );
}

/** One budget, with its pacing read out in words as well as drawn. */
function BudgetLine({
  budget,
  spent,
  pacing,
  base,
}: {
  budget: Budget;
  spent: number;
  pacing: ReturnType<typeof budgetPacing>;
  base: string;
}) {
  const ratio = budget.amount > 0 ? spent / budget.amount : 0;
  const left = budget.amount - spent;

  // The verdict, in the order it matters: already over, projected over, or fine.
  const verdict =
    left < 0
      ? { text: `over by ${formatMoney(-left, base)}`, tone: "text-debit" }
      : pacing.projected != null && pacing.projected > budget.amount
        ? {
            text: `on track for ${formatMoney(pacing.projected, base)}`,
            tone: "text-head-3",
          }
        : pacing.perDayLeft != null
          ? {
              text: `${formatMoney(pacing.perDayLeft, base)} a day left`,
              tone: "text-quill-faint",
            }
          : { text: `${formatMoney(left, base)} left`, tone: "text-quill-faint" };

  return (
    <div className="border-b border-rule py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-quill">
          {budget.name}
          <span className="ml-2 text-xs italic text-quill-faint">
            {periodLabel(budget)}
          </span>
        </span>
        <span className="tnum shrink-0 text-sm text-quill-soft">
          {formatMoney(spent, base)}
          <span className="text-quill-faint"> / {formatMoney(budget.amount, base)}</span>
        </span>
      </div>
      <Bar2 ratio={ratio} elapsed={pacing.elapsedRatio} />
      <p className={cn("mt-1 text-xs italic", verdict.tone)}>{verdict.text}</p>
    </div>
  );
}

/**
 * The pacing bar. The tick is where an even spend would have reached by now —
 * the bar being past it is the whole signal, so it is drawn, not described.
 */
function Bar2({
  ratio,
  elapsed,
  tone,
}: {
  ratio: number;
  elapsed?: number | null;
  tone?: "credit";
}) {
  const over = ratio > 1;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const showTick = elapsed != null && elapsed > 0.02 && elapsed < 0.98;

  if (over && !tone) {
    const withinFrac = (1 / ratio) * 100;
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
        aria-label={`${Math.round(ratio * 100)}% of budget`}
        className="mt-2 flex h-1.5 overflow-hidden bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]"
      >
        <div className="h-full bg-head-3" style={{ width: `${withinFrac}%` }} />
        <div className="h-full bg-debit" style={{ width: `${100 - withinFrac}%` }} />
      </div>
    );
  }

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`${Math.round(ratio * 100)}% of ${tone ? "target" : "budget"}`}
      className="relative mt-2 h-1.5 overflow-hidden bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]"
    >
      <div
        className={cn(
          "h-full transition-[width] duration-500",
          tone === "credit" ? "bg-credit" : ratio > 0.85 ? "bg-head-3" : "bg-head-1",
        )}
        style={{ width: `${pct}%` }}
      />
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
