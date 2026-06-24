import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { subMonths } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Plane, Plus, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  goalFunding,
  groupLinks,
  groupTxnLinks,
  periodLabel,
} from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
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
  type CategorySlice,
  type MonthlyPoint,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import type { Budget } from "@/lib/types";

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
  // it) but only over the scoped account(s).
  const byCurrency = balancesByCurrency(scopedAccounts, txns);
  const { total: netWorth, missing } = totalInBase(byCurrency, baseCurrency, rates);

  const refDate = useMemo(
    () => (monthBack === 0 ? new Date() : subMonths(new Date(), monthBack)),
    [monthBack],
  );
  const { from, to } = monthBounds(refDate);
  const month = cashflowForRange(scopedTxns, baseCurrency, rates, from, to, cashflowMode);
  const trend = monthlyCashflow(scopedTxns, baseCurrency, rates, 6, undefined, cashflowMode);
  const categorySlices = spendingByCategory(
    scopedTxns,
    categoriesQ.data ?? [],
    baseCurrency,
    rates,
    from,
    to,
    cashflowMode,
  );

  // ── Budgets — recurring use a period window; goals are transaction-funded ────
  const { expenseRows, savingRows, goalRows } = useMemo(() => {
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
    return {
      expenseRows: recurring
        .filter((b) => b.direction !== "saving")
        .map((b) => ({ b, spent: spentOf(b) })),
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
              value={formatMoney(netWorth, baseCurrency)}
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
        <Widget title="Cashflow" hint="Last 6 months" className="lg:col-span-2">
          <CashflowBars data={trend} base={baseCurrency} />
        </Widget>
        <Widget
          title="Spending"
          hint={`By category, ${monthBack === 0 ? "this month" : monthLabel(refDate)}`}
        >
          <CategoryDonut slices={categorySlices} base={baseCurrency} />
        </Widget>
      </div>

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
            <ul className="space-y-3">
              {expenseRows.slice(0, 4).map(({ b, spent }) => {
                const left = b.amount - spent;
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
                      <span
                        className={cn(
                          "tnum shrink-0 text-sm font-medium",
                          left < 0 ? "text-rose-400" : "text-ink-200",
                        )}
                      >
                        {formatMoney(Math.abs(left), baseCurrency)}{" "}
                        {left < 0 ? "over" : "left"}
                      </span>
                    </div>
                    <MiniBar ratio={ratio} />
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
  return (
    <Card className="p-3.5 lg:p-4">
      <p className="text-xs font-medium text-ink-400">
        {label} {sub && <span className="text-ink-600">· {sub}</span>}
      </p>
      <p
        className={cn(
          "tnum mt-1 text-xl font-semibold tracking-tight lg:text-2xl",
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

/** Slim progress bar for the Budget/Goals widgets. */
function MiniBar({ ratio, savings = false }: { ratio: number; savings?: boolean }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const color = savings
    ? "bg-emerald-500"
    : ratio > 1
      ? "bg-rose-500"
      : ratio > 0.85
        ? "bg-amber-500"
        : "bg-teal-500";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`${Math.round(ratio * 100)}% of ${savings ? "target" : "budget"}`}
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"
    >
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
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

function CashflowBars({ data, base }: { data: MonthlyPoint[]; base: string }) {
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  if (!hasData) return <ChartEmpty label="No activity in the last 6 months" />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
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

function CategoryDonut({
  slices,
  base,
}: {
  slices: CategorySlice[];
  base: string;
}) {
  if (slices.length === 0)
    return <ChartEmpty label="No spending recorded this month" />;

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.id} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ color: "#eef4fa" }}
              labelStyle={{ color: "#eef4fa" }}
              formatter={(value) => formatMoney(Number(value), base)}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink-500">Spent</span>
          <span className="tnum text-sm font-semibold text-ink-100">
            {formatMoney(total, base)}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.slice(0, 5).map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 truncate text-ink-300">{s.name}</span>
            <span className="tnum shrink-0 text-ink-400">
              {formatMoney(s.value, base)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-ink-800 text-center text-sm text-ink-500">
      {label}
    </div>
  );
}

export function FloatingAdd({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add transaction"
      className="fixed bottom-24 right-5 z-20 flex size-14 items-center justify-center rounded-full bg-teal-500 text-ink-950 shadow-lg shadow-teal-500/20 transition-transform active:scale-95 lg:hidden"
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  );
}
