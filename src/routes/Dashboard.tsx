import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, subMonths } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Plane, Plus, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  periodLabel,
} from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import {
  useInvestmentOverrides,
  useInvestmentSnapshot,
} from "@/hooks/useInvestmentSnapshot";
import { investmentTotalInBase } from "@/lib/investments";
import { balancesByCurrency } from "@/lib/balances";
import { ACCOUNT_TYPE_COLORS } from "@/lib/account-colors";
import { totalInBase } from "@/lib/fx";
import {
  cashflowForRange,
  monthBounds,
  monthLabel,
  monthlyCashflow,
  spendingByCategory,
  type CashflowMode,
  type MonthlyPoint,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { HoverDonut } from "@/components/HoverDonut";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import type { Budget, InvestmentSnapshot } from "@/lib/types";

const TOOLTIP_STYLE = {
  background: "#111a24",
  border: "1px solid #2b3947",
  borderRadius: 12,
  fontSize: 12,
  color: "#e9eef4",
} as const;

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
  // Trend carries each bar's yyyy-MM so a click can deep-link into Analytics.
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
  const { expenseRows, savingRows, goalRows, expenseTotals } = useMemo(() => {
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

  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            Overview
          </h1>
          <div className="mt-0.5 flex items-center gap-0.5">
            <button
              onClick={() => setMonthBack((m) => m + 1)}
              className="flex size-6 items-center justify-center rounded-md text-ink-500 hover:bg-ink-800 hover:text-ink-200 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[7rem] text-center text-sm text-ink-400">
              {monthLabel(refDate)}
            </span>
            <button
              onClick={() => setMonthBack((m) => Math.max(m - 1, 0))}
              disabled={monthBack === 0}
              className="flex size-6 items-center justify-center rounded-md text-ink-500 hover:bg-ink-800 hover:text-ink-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Cashflow mode toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-ink-700/60 bg-ink-900/60 p-1">
          {(["gross", "net"] as CashflowMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setCashflowMode(m)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                cashflowMode === m
                  ? "bg-ink-700 text-ink-100"
                  : "text-ink-500 hover:text-ink-300",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Button
          className="hidden lg:inline-flex"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> New transaction
        </Button>
      </header>

      {/* Account scope filter — a compact dropdown (mobile-friendly) */}
      {accounts.length > 1 && (
        <div className="mb-4">
          <div className="relative w-full sm:max-w-xs">
            {accountFilter && (
              <span
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full",
                  ACCOUNT_TYPE_COLORS[
                    accounts.find((a) => a.id === accountFilter)?.type ?? "checking"
                  ].dot,
                )}
              />
            )}
            <select
              aria-label="Filter overview by account"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className={cn(
                "h-9 w-full appearance-none rounded-xl border border-ink-700 bg-ink-900/60 pr-9 text-sm font-medium text-ink-100 focus:border-teal-500 focus:outline-none",
                accountFilter ? "pl-8" : "pl-3",
              )}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          </div>
        </div>
      )}

      {/* Stat row */}
      {(() => {
        const subLabel = monthBack === 0 ? "this month" : monthLabel(refDate);
        return (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={accountFilter ? "Balance" : "Net worth"}
              sub={showInvest ? "cash + invest" : undefined}
              value={formatMoney(combinedNetWorth, baseCurrency)}
              accent
            />
            <Stat
              label="Income"
              sub={subLabel}
              value={formatMoney(month.income, baseCurrency)}
              tone="up"
            />
            <Stat
              label="Expenses"
              sub={subLabel}
              value={formatMoney(month.expense, baseCurrency)}
              tone="down"
            />
            <Stat
              label="Net"
              sub={subLabel}
              value={formatMoney(month.net, baseCurrency)}
              tone={month.net >= 0 ? "up" : "down"}
            />
          </div>
        );
      })()}

      {showInvest && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-ink-800/70 px-2.5 py-1 text-ink-300">
            Cash{" "}
            <span className="tnum text-ink-100">
              {formatMoney(combinedNetWorth - investBase, baseCurrency)}
            </span>
          </span>
          <span className="rounded-full bg-violet-500/12 px-2.5 py-1 text-violet-300">
            Investments{" "}
            <span className="tnum">{formatMoney(investBase, baseCurrency)}</span>
          </span>
        </div>
      )}

      {(byCurrency && Object.keys(byCurrency).length > 1) || missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {Object.entries(byCurrency).map(([c, v]) => (
            <span
              key={c}
              className="tnum rounded-full bg-ink-800/70 px-2.5 py-1 text-xs text-ink-300"
            >
              {formatMoney(v, c)} <span className="text-ink-500">{c}</span>
            </span>
          ))}
          {missing.length > 0 && (
            <span className="text-xs text-amber-400/80">
              {missing.join(", ")} not converted —{" "}
              <Link to="/settings" className="underline">
                set a rate
              </Link>
            </span>
          )}
        </div>
      ) : null}

      {/* Charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Widget title="Cashflow" hint="Last 6 months · tap a month for detail" className="lg:col-span-2">
          <CashflowBars
            data={trend}
            base={baseCurrency}
            onMonthClick={(mk) => navigate(`/analytics?month=${mk}`)}
          />
        </Widget>
        <Widget
          title="Spending"
          hint={`By category, ${monthBack === 0 ? "this month" : monthLabel(refDate)}`}
          action={
            <Link
              to={`/analytics?month=${format(refDate, "yyyy-MM")}`}
              className="text-sm text-teal-400"
            >
              More details
            </Link>
          }
        >
          {categorySlices.length === 0 ? (
            <ChartEmpty label="No spending recorded this month" />
          ) : (
            <HoverDonut slices={categorySlices} base={baseCurrency} centerLabel="Spent" legendCount={5} />
          )}
        </Widget>
      </div>

      {/* Investments — pulled live from Zenith */}
      {showInvest && investSnapshot && (
        <div className="mt-4">
          <Widget
            title="Investments"
            hint={
              investSnapshot.as_of
                ? `Zenith · as of ${new Date(investSnapshot.as_of).toLocaleDateString()}`
                : "Zenith"
            }
            action={
              <Link to="/settings" className="text-sm text-teal-400">
                Manage
              </Link>
            }
          >
            <InvestmentsList
              snapshot={investSnapshot}
              base={baseCurrency}
              investBase={investBase}
            />
          </Widget>
        </div>
      )}

      {/* Budgets — expense (counts down) & savings (count up) */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget
          title="Budget"
          hint="Spending budgets"
          action={
            <Link to="/budgets" className="text-sm text-teal-400">
              Manage
            </Link>
          }
        >
          {expenseRows.length === 0 ? (
            <EmptyState
              icon={<Target className="size-6" />}
              title="No budgets yet"
              hint="Create a budget to track spending."
            />
          ) : (
            <div className="space-y-3">
              {expenseRows.length > 1 && (
                <BudgetSummaryRow
                  spent={expenseTotals.spent}
                  budget={expenseTotals.budget}
                  base={baseCurrency}
                />
              )}
              <ul className="space-y-3">
                {expenseRows.slice(0, 4).map(({ b, spent, pacing }) => {
                  const left = b.amount - spent;
                  const ratio = b.amount > 0 ? spent / b.amount : 0;
                  return (
                    <li key={b.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-100">
                            {b.name}
                          </p>
                          <p className="text-xs text-ink-500">
                            {periodLabel(b)}
                            {pacing.daysLeft != null &&
                              ` · ${pacing.daysLeft === 0 ? "ends today" : `${pacing.daysLeft}d left`}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={cn(
                              "tnum text-sm font-medium",
                              left < 0 ? "text-rose-400" : "text-ink-200",
                            )}
                          >
                            {formatMoney(Math.abs(left), baseCurrency)}{" "}
                            {left < 0 ? "over" : "left"}
                          </span>
                          <p className="tnum text-[11px] text-ink-500">
                            {Math.round(ratio * 100)}% used
                          </p>
                        </div>
                      </div>
                      <MiniBar ratio={ratio} elapsed={pacing.elapsedRatio} />
                      {left < 0 && (
                        <p className="tnum mt-1 text-[11px] text-rose-400/80">
                          {formatMoney(spent, baseCurrency)} of{" "}
                          {formatMoney(b.amount, baseCurrency)} ·{" "}
                          {formatMoney(-left, baseCurrency)} over
                        </p>
                      )}
                    </li>
                  );
                })}
                {expenseRows.length > 4 && (
                  <li>
                    <Link
                      to="/budgets"
                      className="block pt-1 text-xs text-ink-500 hover:text-teal-300"
                    >
                      +{expenseRows.length - 4} more
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}
        </Widget>

        <Widget
          title="Goals & savings"
          hint="Progress toward targets"
          action={
            <Link to="/budgets" className="text-sm text-teal-400">
              Manage
            </Link>
          }
        >
          {goalRows.length === 0 && savingRows.length === 0 ? (
            <EmptyState
              icon={<Plane className="size-6" />}
              title="No goals yet"
              hint="Create a one-time goal or a savings budget to track progress."
            />
          ) : (
            <ul className="space-y-3">
              {/* Goals first (transaction-funded, stacked bar) */}
              {goalRows.slice(0, 4).map(({ b, funding }) => (
                <li key={b.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-100">
                        {b.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {funding.daysLeft == null
                          ? "Goal"
                          : funding.daysLeft < 0
                            ? "Overdue"
                            : `${funding.daysLeft}d left`}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-sm font-medium text-emerald-400">
                      {formatMoney(funding.funded, baseCurrency)}
                      <span className="text-ink-600">
                        {" "}
                        / {formatMoney(b.amount, baseCurrency)}
                      </span>
                    </span>
                  </div>
                  <MiniStackedBar
                    spent={funding.spent}
                    saved={funding.saved}
                    target={b.amount}
                  />
                </li>
              ))}

              {/* Recurring savings fill any remaining slots */}
              {savingRows
                .slice(0, Math.max(0, 4 - goalRows.length))
                .map(({ b, spent }) => {
                  const ratio = b.amount > 0 ? spent / b.amount : 0;
                  return (
                    <li key={b.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-100">
                            {b.name}
                          </p>
                          <p className="text-xs text-ink-500">{periodLabel(b)}</p>
                        </div>
                        <span className="tnum shrink-0 text-sm font-medium text-emerald-400">
                          {formatMoney(spent, baseCurrency)}
                          <span className="text-ink-600">
                            {" "}
                            / {formatMoney(b.amount, baseCurrency)}
                          </span>
                        </span>
                      </div>
                      <MiniBar ratio={ratio} savings />
                    </li>
                  );
                })}

              {goalRows.length + savingRows.length > 4 && (
                <li>
                  <Link
                    to="/budgets"
                    className="block pt-1 text-xs text-ink-500 hover:text-teal-300"
                  >
                    +{goalRows.length + savingRows.length - 4} more
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Widget>
      </div>

      <FloatingAdd onClick={() => setAdding(true)} />
      {adding && <AddTransactionSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

// --- building blocks -------------------------------------------------------

function Stat({
  label,
  sub,
  value,
  tone,
  accent,
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: "up" | "down";
  accent?: boolean;
}) {
  // Adaptive size so big values (e.g. $12,345,678) don't overflow the card,
  // including on 375px phones where the grid is two columns.
  const size =
    value.length > 14
      ? "text-base lg:text-lg"
      : value.length > 11
        ? "text-lg lg:text-xl"
        : "text-xl lg:text-2xl";

  return (
    <Card className="min-w-0 p-3.5 lg:p-4">
      <p className="truncate text-xs font-medium text-ink-400">
        {label} {sub && <span className="text-ink-600">· {sub}</span>}
      </p>
      <p
        className={cn(
          "tnum mt-1 break-words font-semibold leading-tight tracking-tight",
          size,
          accent
            ? "text-ink-50"
            : tone === "up"
              ? "text-teal-400"
              : tone === "down"
                ? "text-rose-400"
                : "text-ink-100",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function Widget({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-200">{title}</h2>
          {hint && <p className="text-xs text-ink-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

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
        className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-800"
      >
        <div className="h-full bg-amber-500" style={{ width: `${budgetFrac}%` }} />
        <div
          className="h-full bg-rose-500 ring-1 ring-inset ring-rose-300/30"
          style={{ width: `${100 - budgetFrac}%` }}
        />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, ratio * 100));
  const color = savings
    ? "bg-emerald-500"
    : ratio > 0.85
      ? "bg-amber-500"
      : "bg-teal-500";
  const showMarker =
    !savings && elapsed != null && elapsed > 0.02 && elapsed < 0.98;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`${Math.round(ratio * 100)}% of ${savings ? "target" : "budget"}`}
      className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"
    >
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
      {showMarker && (
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-ink-50/70 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${elapsed * 100}%` }}
        />
      )}
    </div>
  );
}

/** Zenith portfolio breakdown — total in base + each external account. */
function InvestmentsList({
  snapshot,
  base,
  investBase,
}: {
  snapshot: InvestmentSnapshot;
  base: string;
  investBase: number;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <span className="text-xs text-ink-500">Portfolio value</span>
        <span className="tnum text-lg font-semibold text-violet-300">
          {formatMoney(investBase, base)}
        </span>
      </div>
      {snapshot.accounts.length > 0 ? (
        <ul className="space-y-2">
          {snapshot.accounts.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-violet-400" />
                <span className="truncate text-ink-200">{a.name}</span>
              </span>
              <span className="tnum shrink-0 text-ink-300">
                {formatMoney(a.value, a.currency)}
                {a.currency !== base && (
                  <span className="ml-1 text-ink-600">{a.currency}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">
          Portfolio total only — no per-account breakdown provided.
        </p>
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
    ratio > 1 ? "text-rose-400" : ratio > 0.85 ? "text-amber-400" : "text-ink-200";
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink-400">
          All budgets{" "}
          <span className="tnum text-ink-600">
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

/** Two-segment slim bar for goals: spent then saved, toward the target. */
function MiniStackedBar({
  spent,
  saved,
  target,
}: {
  spent: number;
  saved: number;
  target: number;
}) {
  const t = target > 0 ? target : 1;
  const spentPct = Math.min(100, (spent / t) * 100);
  const savedPct = Math.min(100 - spentPct, (saved / t) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(spentPct + savedPct)}
      aria-label={`${Math.round(((spent + saved) / t) * 100)}% funded`}
      className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-800"
    >
      <div className="h-full bg-indigo-400 transition-all" style={{ width: `${spentPct}%` }} />
      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${savedPct}%` }} />
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
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  if (!hasData) return <ChartEmpty label="No activity in the last 6 months" />;

  return (
    <ResponsiveContainer width="100%" height={220}>
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
        <CartesianGrid vertical={false} stroke="#1c2632" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#6f8499", fontSize: 12 }}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={TOOLTIP_STYLE}
          itemStyle={{ color: "#eef4fa" }}
          labelStyle={{ color: "#eef4fa" }}
          formatter={(value) => formatMoney(Number(value), base)}
        />
        <Bar dataKey="income" name="Income" fill="#7fd1b9" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Expense" fill="#fb7185" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-ink-800 text-center text-sm text-ink-500">
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
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={onClick}
      aria-label="Add transaction"
      className={cn(
        "fixed bottom-24 right-5 z-20 flex size-14 items-center justify-center rounded-full bg-teal-500 text-ink-950 shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-400 active:scale-95 lg:bottom-8 lg:right-8",
        !scrolled && "lg:pointer-events-none lg:translate-y-2 lg:opacity-0",
        className,
      )}
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  );
}
