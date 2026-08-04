import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLeafScroll } from "@/components/leaf-scroll";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import {
  useBudgets,
  useBudgetLinks,
  useBudgetTransactionLinks,
} from "@/hooks/useBudgets";
import {
  spendForBudget,
  budgetPacing,
  goalFunding,
  groupLinks,
  groupTxnLinks,
} from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import {
  useInvestmentHistory,
  useInvestmentOverrides,
  useInvestmentSnapshot,
} from "@/hooks/useInvestmentSnapshot";
import { investmentTotalInBase } from "@/lib/investments";
import { balancesByCurrency } from "@/lib/balances";
import { readShowHomeBudgets } from "@/lib/ledger";
import { convert, totalInBase, type RateMap } from "@/lib/fx";
import {
  cashflowForRange,
  monthBounds,
  monthlyCashflow,
  monthLabel,
  spendingByCategory,
  type CashflowMode,
  type MonthlyPoint,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui";
import {
  headInk,
  LeadFigure,
  MarginLink,
  PageHead,
  Plate,
  Register,
  Spread,
  Statement,
  useLedgerInk,
  type Ink,
} from "@/components/ledger";
import { HoverDonut } from "@/components/HoverDonut";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import type { Budget, InvestmentHistoryPoint } from "@/lib/types";

export function Dashboard() {
  const [adding, setAdding] = useState(false);
  // monthBack: 0 = current month, 1 = last month, etc.
  const [monthBack, setMonthBack] = useState(0);
  const [cashflowMode, setCashflowMode] = useState<CashflowMode>("net");
  // "" = all accounts; otherwise scope the whole overview to one account.
  const [accountFilter, setAccountFilter] = useState<string>("");

  const accountsQ = useAccounts();
  const allTxnsQ = useTransactions();
  const categoriesQ = useCategories();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  // Budget + goal data (cross-account, so always over the full ledger).
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const { data: budgetTxnLinks = [] } = useBudgetTransactionLinks();
  const reimbursedMap = useReimbursedAmountMap();
  const { data: investSnapshot } = useInvestmentSnapshot();
  const { data: investHistory = [] } = useInvestmentHistory();

  // Must sit with the other hooks: an early return below would otherwise make
  // the hook count differ between the loading and loaded renders.
  const ink = useLedgerInk();
  const showBudgets = readShowHomeBudgets();

  const accounts = accountsQ.data ?? [];
  const txns = allTxnsQ.data ?? [];

  // ── Account scope ──────────────────────────────────────────────────────────
  // When an account is selected, every stat/chart/list below reflects only it.
  const scopedAccounts = accountFilter
    ? accounts.filter((a) => a.id === accountFilter)
    : accounts;
  const scopedTxns = useMemo(
    () =>
      accountFilter
        ? txns.filter((t) => t.account_id === accountFilter)
        : txns,
    [txns, accountFilter],
  );

  // Balances use the FULL txns (so transfers into a scoped account still credit
  // it) but only over the scoped account(s). Zenith-linked investment accounts
  // report Zenith's live valuation via `overrides`, so they fold into net worth
  // exactly once.
  const overrides = useInvestmentOverrides(accounts);
  const byCurrency = balancesByCurrency(scopedAccounts, txns, overrides);
  const { total: netWorth, missing } = totalInBase(byCurrency, baseCurrency, rates);

  // Cash / investments split. A snapshot whose accounts aren't materialised yet
  // (legacy manual import) still adds its total on top, like before the link.
  const investAccounts = scopedAccounts.filter((a) => a.type === "investment");
  const hasLinked = accounts.some((a) => a.external_source === "zenith");
  const legacyInvest =
    !accountFilter && investSnapshot && !hasLinked
      ? investmentTotalInBase(investSnapshot, baseCurrency, rates)
      : 0;
  const linkedInvest = totalInBase(
    balancesByCurrency(investAccounts, txns, overrides),
    baseCurrency,
    rates,
  ).total;
  const investBase = linkedInvest + legacyInvest;
  const showInvest = !accountFilter && (investAccounts.length > 0 || legacyInvest > 0);
  const combinedNetWorth = netWorth + legacyInvest;

  const refDate = useMemo(
    () => (monthBack === 0 ? new Date() : subMonths(new Date(), monthBack)),
    [monthBack],
  );
  const navigate = useNavigate();
  const { from, to } = monthBounds(refDate);
  // Each of these sums a scoped slice but resolves reimbursements against the
  // full ledger (`txns`) — a repayment in another month or account still counts.
  const month = cashflowForRange(scopedTxns, baseCurrency, rates, from, to, cashflowMode, txns);
  // Six months of received-vs-expended; each bar carries its yyyy-MM so a click
  // can open that month in Analytics.
  const trend = useMemo(
    () =>
      monthlyCashflow(scopedTxns, baseCurrency, rates, 6, undefined, cashflowMode, txns).map(
        (p, i) => ({ ...p, monthKey: format(subMonths(new Date(), 5 - i), "yyyy-MM") }),
      ),
    [scopedTxns, txns, baseCurrency, rates, cashflowMode],
  );

  const categorySlices = spendingByCategory(
    scopedTxns,
    categoriesQ.data ?? [],
    baseCurrency,
    rates,
    from,
    to,
    cashflowMode,
    txns,
  );

  // ── Budgets — recurring use a period window; goals are transaction-funded ────
  const { expenseRows, expenseTotals } = useMemo(() => {
    const links = groupLinks(budgetLinks);
    const txnLinks = groupTxnLinks(budgetTxnLinks);
    const recurring = budgets.filter((b) => b.type !== "goal");
    const spentOf = (b: Budget) =>
      spendForBudget(
        b,
        links.get(b.id) ?? new Set<string>(),
        txns,
        baseCurrency,
        rates,
        reimbursedMap,
      );
    const expenseRows = recurring
      .filter((b) => b.direction !== "saving")
      .map((b) => {
        const spent = spentOf(b);
        return { b, spent, pacing: budgetPacing(b, spent) };
      });
    return {
      expenseRows,
      expenseTotals: expenseRows.reduce(
        (acc, { b, spent }) => ({
          spent: acc.spent + spent,
          budget: acc.budget + b.amount,
        }),
        { spent: 0, budget: 0 },
      ),
      savingRows: recurring
        .filter((b) => b.direction === "saving")
        .map((b) => ({ b, spent: spentOf(b) })),
      goalRows: budgets
        .filter((b) => b.type === "goal")
        .map((b) => ({
          b,
          funding: goalFunding(
            b,
            txnLinks.get(b.id) ?? new Set<string>(),
            txns,
            baseCurrency,
            rates,
            reimbursedMap,
          ),
        })),
    };
  }, [budgets, budgetLinks, budgetTxnLinks, txns, baseCurrency, rates, reimbursedMap]);

  if (accountsQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const asAt = format(new Date(), "d MMMM yyyy");
  const periodNote = monthBack === 0 ? "this month" : monthLabel(refDate);

  const cashflowPlate = (
    <Plate caption="Cashflow" note="Last 6 months · tap a month for detail">
      <CashflowBars
        data={trend}
        base={baseCurrency}
        onMonthClick={(mk) => navigate(`/analytics?month=${mk}`)}
      />
    </Plate>
  );

  const verso = (
    <>
      <PageHead
        title="The position"
        note={`As at ${asAt}`}
        action={
          accounts.length > 1 ? (
            <select
              aria-label="Scope the book to one account"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="max-w-[7.5rem] truncate border-0 border-b border-rule bg-transparent pb-0.5 text-xs text-quill-soft focus:border-brass focus:outline-none"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <LeadFigure
        label={accountFilter ? "Balance" : "Net worth"}
        value={formatMoney(combinedNetWorth, baseCurrency)}
      />

      {/* An unconverted currency means the figure above is understated, so the
          caveat belongs with it rather than beside a currency list. */}
      {missing.length > 0 && (
        <p className="-mt-1 mb-1 text-xs italic text-debit">
          {missing.join(", ")} not converted —{" "}
          <Link to="/settings" className="underline">
            set a rate
          </Link>
        </p>
      )}


      {showInvest && (
        <div className="mt-3">
          <Statement
            rows={[
              {
                label: "Held in cash",
                value: formatMoney(combinedNetWorth - investBase, baseCurrency),
              },
              { label: "Held in investments", value: formatMoney(investBase, baseCurrency) },
            ]}
          />
        </div>
      )}

      {showInvest && (
        <Plate caption="Investments" note="Value over time">
          <InvestmentsPlate
            history={investHistory}
            base={baseCurrency}
            rates={rates}
            ink={ink}
          />
        </Plate>
      )}

    </>
  );

  // ── Recto: the movement ───────────────────────────────────────────────────
  const recto = (
    <>
      <PageHead
        title={monthLabel(refDate)}
        note={
          <span className="inline-flex items-center gap-2">
            {(["gross", "net"] as CashflowMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setCashflowMode(m)}
                className={cn(
                  "capitalize transition-colors",
                  cashflowMode === m
                    ? "text-quill underline decoration-brass underline-offset-4"
                    : "text-quill-faint hover:text-quill-soft",
                )}
              >
                {m}
              </button>
            ))}
          </span>
        }
        action={
          <span className="flex items-center gap-1">
            <button
              onClick={() => setMonthBack((m) => m + 1)}
              className="flex size-6 items-center justify-center text-quill-faint transition-colors hover:text-quill"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setMonthBack((m) => Math.max(m - 1, 0))}
              disabled={monthBack === 0}
              className="flex size-6 items-center justify-center text-quill-faint transition-colors hover:text-quill disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </span>
        }
      />

      <Statement
        rows={[
          { label: "Received", value: formatMoney(month.income, baseCurrency), tone: "credit" },
          { label: "Expended", value: formatMoney(month.expense, baseCurrency), tone: "debit" },
        ]}
        total={{
          label: "Net",
          value: formatMoney(month.net, baseCurrency),
          tone: month.net >= 0 ? "credit" : "debit",
        }}
      />


      <Plate
        caption="Expenditure, by head"
        note={periodNote}
        action={
          <Link to={`/analytics?month=${format(refDate, "yyyy-MM")}`}>
            <MarginLink>more detail</MarginLink>
          </Link>
        }
      >
        {categorySlices.length === 0 ? (
          <ChartEmpty label="Nothing expended this month" />
        ) : (
          <HoverDonut
            slices={categorySlices.map((s, i) => ({ ...s, color: headInk(i, ink) }))}
            base={baseCurrency}
            centerLabel="Spent"
            legendCount={5}
            size={124}
          />
        )}
      </Plate>

      {cashflowPlate}

      {showBudgets && (
      <Register
        title="Budgets"
        action={
          <Link to="/budgets">
            <MarginLink>manage</MarginLink>
          </Link>
        }
      >
        {expenseRows.length === 0 ? (
          <p className="text-sm italic text-quill-faint">
            No budgets set. Create one to track spending against a limit.
          </p>
        ) : (
          <BudgetSummaryRow
            spent={expenseTotals.spent}
            budget={expenseTotals.budget}
            base={baseCurrency}
          />
        )}
      </Register>
      )}
    </>
  );

  return (
    <div>
      <Spread verso={verso} recto={recto} />
      <FloatingAdd onClick={() => setAdding(true)} />
      {adding && <AddTransactionSheet onClose={() => setAdding(false)} />}
    </div>
  );
}


// --- building blocks -------------------------------------------------------

/**
 * Slim progress bar for the Budget/Goals widgets. Colour signals within vs over
 * budget (teal → amber → rose); the optional `elapsed` tick marks an even pace.
 */
function MiniBar({
  ratio,
  savings = false,
  elapsed,
}: {
  ratio: number;
  savings?: boolean;
  elapsed?: number | null;
}) {
  // Over budget → two-tone: amber up to the limit, rose for the overspend.
  if (!savings && ratio > 1) {
    const budgetFrac = (1 / ratio) * 100;
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
        aria-label={`${Math.round(ratio * 100)}% of budget — over by ${Math.round((ratio - 1) * 100)}%`}
        className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]"
      >
        <div className="h-full bg-head-3" style={{ width: `${budgetFrac}%` }} />
        <div
          className="h-full bg-debit"
          style={{ width: `${100 - budgetFrac}%` }}
        />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, ratio * 100));
  const color = savings
    ? "bg-credit"
    : ratio > 0.85
      ? "bg-head-3"
      : "bg-head-1";
  const showMarker =
    !savings && elapsed != null && elapsed > 0.02 && elapsed < 0.98;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`${Math.round(ratio * 100)}% of ${savings ? "target" : "budget"}`}
      className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]"
    >
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
      {showMarker && (
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-quill/70 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${elapsed * 100}%` }}
        />
      )}
    </div>
  );
}

/** Compact aggregate strip atop the Budget widget — all spending budgets combined. */
function BudgetSummaryRow({
  spent,
  budget,
  base,
}: {
  spent: number;
  budget: number;
  base: string;
}) {
  const ratio = budget > 0 ? spent / budget : 0;
  const remaining = budget - spent;
  const tone =
    ratio > 1 ? "text-debit" : ratio > 0.85 ? "text-head-3" : "text-quill";
  return (
    <div className="leaf-panel p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-quill-soft">
          All budgets{" "}
          <span className="tnum text-quill-faint">
            · {formatMoney(spent, base)} / {formatMoney(budget, base)}
          </span>
        </span>
        <span className={cn("tnum font-medium", tone)}>
          {remaining >= 0
            ? `${formatMoney(remaining, base)} left`
            : `${formatMoney(-remaining, base)} over`}
        </span>
      </div>
      <MiniBar ratio={ratio} />
    </div>
  );
}



function CashflowBars({
  data,
  base,
  onMonthClick,
}: {
  data: (MonthlyPoint & { monthKey: string })[];
  base: string;
  onMonthClick?: (monthKey: string) => void;
}) {
  const ink = useLedgerInk();
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  if (!hasData) return <ChartEmpty label="No activity in the last 6 months" />;

  return (
    <ResponsiveContainer width="100%" height={132}>
      <BarChart
        data={data}
        barGap={4}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        onClick={(s) => {
          const p = s?.activePayload?.[0]?.payload as
            | { monthKey?: string; income?: number; expense?: number }
            | undefined;
          // Empty months have nothing to drill into — ignore the click.
          if (p?.monthKey && ((p.income ?? 0) > 0 || (p.expense ?? 0) > 0))
            onMonthClick?.(p.monthKey);
        }}
        className={onMonthClick ? "cursor-pointer" : undefined}
      >
        <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: ink["--color-quill-faint"], fontSize: 12 }}
        />
        <YAxis hide />
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
          formatter={(value) => formatMoney(Number(value), base)}
        />
        <Bar
          dataKey="income"
          name="Received"
          fill={ink["--color-credit"]}
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expense"
          name="Expended"
          fill={ink["--color-debit"]}
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}



/**
 * Portfolio value over time. One ink, a hairline baseline, the last point
 * marked and labelled — an engraved plate, not a dashboard sparkline.
 */
function InvestmentsPlate({
  history,
  base,
  rates,
  ink,
}: {
  history: InvestmentHistoryPoint[];
  base: string;
  rates: RateMap;
  ink: Ink;
}) {
  const series = history.map((p) => ({
    date: p.date,
    label: format(parseISO(p.date), "d MMM"),
    value: convert(p.total, p.base_currency, base, rates) ?? p.total,
  }));

  if (series.length < 2) {
    return (
      <p className="text-sm italic text-quill-faint">
        Not enough history yet — the line starts once Zenith has recorded a few
        days.
      </p>
    );
  }

  const first = series[0]!.value;
  const last = series[series.length - 1]!.value;
  const change = last - first;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="tnum text-lg text-quill">{formatMoney(last, base)}</span>
        <span className={cn("tnum text-sm", change >= 0 ? "text-credit" : "text-debit")}>
          {change >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(change), base)}
          <span className="text-quill-faint">
            {" "}
            since {series[0]!.label}
          </span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={132}>
        <AreaChart data={series} margin={{ top: 4, right: 10, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ink["--color-head-1"]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={ink["--color-head-1"]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: ink["--color-rule"] }}
            tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: ink["--color-rule-strong"], strokeWidth: 1 }}
            contentStyle={{
              background: ink["--color-page"],
              border: `1px solid ${ink["--color-rule-strong"]}`,
              borderRadius: 2,
              fontSize: 12,
              color: ink["--color-quill"],
            }}
            labelStyle={{ color: ink["--color-quill-soft"] }}
            formatter={(v: number) => [formatMoney(v, base), "Value"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={ink["--color-head-1"]}
            strokeWidth={1.75}
            fill="url(#investFill)"
            dot={false}
            activeDot={{ r: 3, fill: ink["--color-head-1"], stroke: ink["--color-page"] }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center border border-dashed border-rule text-center text-sm text-quill-faint">
      {label}
    </div>
  );
}

export function FloatingAdd({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  // Mobile: always visible above the dock (the primary add affordance).
  // Desktop web: revealed only once the page is scrolled (like the floating
  // search button), so it never crowds the header CTA on a fresh view.
  // `className` lets pages with their own floating stacks (Activity) slot it
  // higher so nothing overlaps.
  const [scrolled, setScrolled] = useState(false);
  useLeafScroll((y) => setScrolled(y > 300));

  return (
    <button
      onClick={onClick}
      aria-label="Add transaction"
      className={cn(
        "brass-face fixed bottom-6 right-16 z-20 flex size-14 items-center justify-center rounded-full shadow-[0_6px_18px_rgb(0_0_0/0.45)] transition-all active:scale-95 lg:right-24",
        !scrolled && "lg:pointer-events-none lg:translate-y-2 lg:opacity-0",
        className,
      )}
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  );
}
