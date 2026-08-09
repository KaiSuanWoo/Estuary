import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { useBudgets, useBudgetLinks } from "@/hooks/useBudgets";
import { groupLinks } from "@/lib/budgets";
import { budgetMetrics } from "@/lib/budget-metrics";
import { useCategories } from "@/hooks/useCategories";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import {
  useInvestmentHistory,
  useInvestmentOverrides,
  useInvestmentSnapshot,
} from "@/hooks/useInvestmentSnapshot";
import { investmentTotalInBase } from "@/lib/investments";
import { balancesByCurrency } from "@/lib/balances";
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
import { useReducedMotion } from "@/lib/motion";
import { Spinner } from "@/components/ui";
import {
  ChartEmpty,
  headInk,
  LeadFigure,
  MarginLink,
  PageHead,
  Plate,
  Register,
  Spread,
  Statement,
  tooltipStyle,
  useLedgerInk,
  type Ink,
} from "@/components/ledger";
import { HoverDonut } from "@/components/HoverDonut";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import type { InvestmentHistoryPoint } from "@/lib/types";

export function Dashboard() {
  const [adding, setAdding] = useState(false);
  // monthBack: 0 = current month, 1 = last month, etc.
  const [monthBack, setMonthBack] = useState(0);
  // +1 when you turned back through the book, -1 when you turned forward. Only
  // the sign is used, to point the month transition the right way.
  const [turned, setTurned] = useState(1);
  const [cashflowMode, setCashflowMode] = useState<CashflowMode>("net");
  // "" = all accounts; otherwise scope the whole overview to one account.
  const [accountFilter, setAccountFilter] = useState<string>("");

  const accountsQ = useAccounts();
  const allTxnsQ = useTransactions();
  const categoriesQ = useCategories();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const reimbursedMap = useReimbursedAmountMap();
  const { data: investSnapshot } = useInvestmentSnapshot();
  const { data: investHistory = [] } = useInvestmentHistory();

  // Must sit with the other hooks: an early return below would otherwise make
  // the hook count differ between the loading and loaded renders.
  const ink = useLedgerInk();
  const reduce = useReducedMotion();

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

  // Only the budgets pinned from the editor reach the front page, and only
  // ever as one line each — Home is a glance, not the board.
  const pinned = useMemo(() => {
    const links = groupLinks(budgetLinks);
    return budgets
      .filter((b) => b.show_on_home && b.type !== "goal")
      .map((b) =>
        budgetMetrics(
          b,
          links.get(b.id) ?? new Set<string>(),
          categoriesQ.data ?? [],
          txns,
          baseCurrency,
          rates,
          reimbursedMap,
          { cycles: 0 },
        ),
      );
  }, [budgets, budgetLinks, categoriesQ.data, txns, baseCurrency, rates, reimbursedMap]);

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

      {/* Six months of received-against-expended. It belongs on the verso: the
          shape of the last half-year is part of where you stand, not part of
          what happened this month. */}
      {cashflowPlate}

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
                  "tap capitalize transition-colors",
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
              onClick={() => {
                setTurned(1);
                setMonthBack((m) => m + 1);
              }}
              className="tap flex size-6 items-center justify-center text-quill-faint transition-colors hover:text-quill"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => {
                setTurned(-1);
                setMonthBack((m) => Math.max(m - 1, 0));
              }}
              disabled={monthBack === 0}
              className="tap flex size-6 items-center justify-center text-quill-faint transition-colors hover:text-quill disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </span>
        }
      />

      {/* The month's figures slide the way you turned. Back a month and they
          come in from the left, the way an earlier page would. */}
      <AnimatePresence mode="wait" initial={false} custom={turned}>
        <motion.div
          key={monthBack}
          custom={turned}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: turned > 0 ? -24 : 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: turned > 0 ? 24 : -24 }}
          transition={{ duration: reduce ? 0.1 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
        >
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
        </motion.div>
      </AnimatePresence>


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

      {/* A phone never opens the verso, so the plate is repeated here — hidden
          the moment there is a left page to carry it. */}
      <div className="lg:hidden">{cashflowPlate}</div>

      {pinned.length > 0 && (
        <Register
          title="Budgets"
          action={
            <Link to="/analytics?view=budgets">
              <MarginLink>the board</MarginLink>
            </Link>
          }
        >
          <div>
            {pinned.map((m) => (
              <PinnedBudget key={m.budget.id} m={m} base={baseCurrency} />
            ))}
          </div>
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
 * A pinned budget, in one line. Spent against allocated, the share used, and
 * the gap from an even pace — the three figures that answer "am I fine" without
 * opening anything.
 */
function PinnedBudget({ m, base }: { m: ReturnType<typeof budgetMetrics>; base: string }) {
  const over = m.used > 1;
  const dev = m.deviation;
  return (
    <div className="border-b border-rule py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-quill">{m.budget.name}</span>
        <span className="tnum shrink-0 text-sm text-quill-soft">
          {formatMoney(m.spent, base)}
          <span className="text-quill-faint"> / {formatMoney(m.allocated, base)}</span>
          <span className={cn("ml-2", over ? "text-debit" : "text-quill")}>
            {Math.round(m.used * 100)}%
          </span>
          {dev != null && (
            <span
              className={cn(
                "ml-2 text-xs",
                dev > 0.02 ? "text-debit" : dev < -0.02 ? "text-credit" : "text-quill-faint",
              )}
            >
              {dev >= 0 ? "+" : "−"}
              {Math.abs(Math.round(dev * 100))}%
            </span>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, m.used) * 100)}
        aria-label={`${m.budget.name}: ${Math.round(m.used * 100)}% of budget`}
        className="relative mt-1.5 flex h-1.5 overflow-hidden bg-[color-mix(in_oklab,var(--color-quill)_12%,transparent)]"
      >
        {over ? (
          <>
            <div className="h-full bg-head-3" style={{ width: `${(1 / m.used) * 100}%` }} />
            <div className="h-full bg-debit" style={{ width: `${100 - (1 / m.used) * 100}%` }} />
          </>
        ) : (
          m.breakdown.map((c) => (
            <div
              key={c.id}
              className="h-full"
              style={{ width: `${c.shareOfAllocated * 100}%`, backgroundColor: c.color }}
            />
          ))
        )}
        {m.elapsed != null && m.elapsed > 0.02 && m.elapsed < 0.98 && (
          <span
            aria-hidden
            className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-quill/70"
            style={{ left: `${m.elapsed * 100}%` }}
          />
        )}
      </div>
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
          {...tooltipStyle(ink)}
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
            {...tooltipStyle(ink)}
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
