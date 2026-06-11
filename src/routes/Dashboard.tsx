import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, TrendingUp, Wallet } from "lucide-react";
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
import { convert } from "@/lib/fx";
import { useCategories, useCategoryMap } from "@/hooks/useCategories";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { accountBalancesByCurrency, balancesByCurrency, isMultiCurrency } from "@/lib/balances";
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
import { TransactionRow } from "@/components/TransactionRow";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import type { Transaction } from "@/lib/types";

const TOOLTIP_STYLE = {
  background: "#111a24",
  border: "1px solid #2b3947",
  borderRadius: 12,
  fontSize: 12,
  color: "#e9eef4",
} as const;

export function Dashboard() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  // monthBack: 0 = current month, 1 = last month, etc.
  const [monthBack, setMonthBack] = useState(0);
  const [cashflowMode, setCashflowMode] = useState<CashflowMode>("net");
  // "" = all accounts; otherwise scope the whole overview to one account.
  const [accountFilter, setAccountFilter] = useState<string>("");

  const accountsQ = useAccounts();
  const allTxnsQ = useTransactions();
  // refDate is set after monthBounds, so recentQ must be declared after it.
  // We'll forward-declare here and update after refDate is known.
  const categoriesQ = useCategories();
  const categoryMap = useCategoryMap();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  const reimbursedMap = useReimbursedAmountMap(); // values in base currency
  const accounts = accountsQ.data ?? [];
  const txns = allTxnsQ.data ?? [];
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

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

  // Convert base-currency reimbursed totals back to each expense's own currency
  const reimbursedInTxCurrency = useMemo(() => {
    const out = new Map<string, number>();
    for (const tx of txns) {
      const baseAmt = reimbursedMap.get(tx.id);
      if (!baseAmt) continue;
      out.set(
        tx.id,
        convert(baseAmt, baseCurrency, tx.currency, rates) ?? baseAmt,
      );
    }
    return out;
  }, [txns, reimbursedMap, baseCurrency, rates]);

  // Balances use the FULL txns (so transfers into a scoped account still credit
  // it) but only over the scoped account(s).
  const byCurrency = balancesByCurrency(scopedAccounts, txns);
  const { total: netWorth, missing } = totalInBase(byCurrency, baseCurrency, rates);

  const refDate = useMemo(
    () => (monthBack === 0 ? new Date() : subMonths(new Date(), monthBack)),
    [monthBack],
  );
  const { from, to } = monthBounds(refDate);
  // Scope "recent activity" to the selected month (6 most recent in that month)
  const recentQ = useTransactions({
    from,
    to,
    limit: 6,
    accountId: accountFilter || undefined,
  });
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

      {/* Account scope filter */}
      {accounts.length > 1 && (
        <div className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterPill
            label="All accounts"
            active={accountFilter === ""}
            onClick={() => setAccountFilter("")}
          />
          {accounts.map((a) => (
            <FilterPill
              key={a.id}
              label={a.name}
              dot={ACCOUNT_TYPE_COLORS[a.type].dot}
              active={accountFilter === a.id}
              onClick={() => setAccountFilter(a.id)}
            />
          ))}
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

      {/* Lists */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget
          title="Accounts"
          action={
            <Link to="/accounts" className="text-sm text-teal-400">
              Manage
            </Link>
          }
        >
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-6" />}
              title="No accounts yet"
              hint="Add one to start tracking balances."
            />
          ) : (
            <ul className="divide-y divide-ink-800/70">
              {accounts.slice(0, 5).map((a) => {
                const balances = accountBalancesByCurrency(a, txns);
                const multi = a.is_multi_currency || isMultiCurrency(balances);
                const currencies = [
                  a.currency,
                  ...Object.keys(balances)
                    .filter((c) => c !== a.currency)
                    .sort(),
                ];
                return (
                  <li key={a.id}>
                    <Link
                      to={`/transactions?account=${a.id}`}
                      className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-teal-300"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-100 group-hover:text-teal-300 transition-colors">
                          {a.name}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {a.type === "investmentCash"
                            ? "Investment"
                            : a.type.charAt(0).toUpperCase() + a.type.slice(1)}{" "}
                          · {multi ? "Multi-currency" : a.currency}
                        </p>
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {currencies.map((c, i) => (
                          <span
                            key={c}
                            className={cn(
                              "tnum font-semibold group-hover:text-teal-300 transition-colors",
                              i === 0
                                ? "text-sm text-ink-50"
                                : "text-xs text-ink-400",
                            )}
                          >
                            {formatMoney(balances[c] ?? 0, c)}
                            {multi && <span className="ml-1 text-ink-600">{c}</span>}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Widget>

        <Widget
          title={monthBack === 0 ? "Recent activity" : `Activity — ${monthLabel(refDate)}`}
          action={
            <Link to="/transactions" className="text-sm text-teal-400">
              See all
            </Link>
          }
        >
          {recentQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (recentQ.data ?? []).length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="size-6" />}
              title={monthBack === 0 ? "No transactions yet" : "No activity"}
              hint={
                monthBack === 0
                  ? "Hit + to record your first transaction."
                  : `Nothing recorded in ${monthLabel(refDate)}.`
              }
            />
          ) : (
            <div className="divide-y divide-ink-800/70">
              {recentQ.data!.map((tx) => {
                const cat = tx.category_id
                  ? categoryMap.get(tx.category_id)
                  : undefined;
                return (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    categoryName={cat?.name}
                    categoryIcon={cat?.icon}
                    categoryColor={cat?.color}
                    accountName={accountMap.get(tx.account_id)}
                    toAccountName={
                      tx.destination_account_id
                        ? accountMap.get(tx.destination_account_id)
                        : undefined
                    }
                    reimbursedAmount={reimbursedInTxCurrency.get(tx.id)}
                    onClick={() => setEditing(tx)}
                  />
                );
              })}
            </div>
          )}
        </Widget>
      </div>

      <FloatingAdd onClick={() => setAdding(true)} />
      {adding && <AddTransactionSheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// --- building blocks -------------------------------------------------------

function FilterPill({
  label,
  dot,
  active,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-teal-500 bg-teal-500/10 text-teal-300"
          : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200",
      )}
    >
      {dot && <span className={cn("size-2 shrink-0 rounded-full", dot)} />}
      {label}
    </button>
  );
}

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
