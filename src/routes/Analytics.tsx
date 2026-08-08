import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  endOfMonth,
  format,
  parseISO,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestmentOverrides } from "@/hooks/useInvestmentSnapshot";
import { useBudgets, useBudgetLinks } from "@/hooks/useBudgets";
import { useAliasMap } from "@/hooks/useMerchantAliases";
import { groupLinks } from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { balancesByCurrency } from "@/lib/balances";
import { convert, type RateMap } from "@/lib/fx";
import { detectRecurring } from "@/lib/recurring";
import { reimbursementLinks } from "@/lib/reimbursements";
import {
  amountInBase,
  breakdownByCategory,
  buildMoneyFlow,
  cashflowForRange,
  categoryAnomalies,
  categoryMovers,
  isNegligible,
  monthEndProjection,
  monthsBetween,
  rangeBounds,
  savingsRateSeries,
  type CashflowMode,
  type CategorySlice,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import type { Transaction } from "@/lib/types";

const TOOLTIP_STYLE = {
  background: "#111a24",
  border: "1px solid #2b3947",
  borderRadius: 12,
  fontSize: 12,
  color: "#e9eef4",
} as const;

const WIDE = { from: "0000-01-01", to: "9999-12-31" };

const PRESETS = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "ytd", label: "This year" },
  { id: "custom", label: "Custom" },
] as const;

function presetRange(preset: string, now = new Date()): { from: string; to: string } {
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "thisMonth":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(endOfMonth(now)) };
    case "lastMonth": {
      const d = subMonths(now, 1);
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(endOfMonth(d)) };
    }
    case "3m":
      return rangeBounds(3, now);
    case "12m":
      return rangeBounds(12, now);
    case "ytd":
      return { from: iso(startOfYear(now)), to: iso(endOfMonth(now)) };
    case "6m":
    default:
      return rangeBounds(6, now);
  }
}

/**
 * Convert a transaction's amount to base, net of reimbursements in net mode:
 * an expense drops to what it actually cost, and a repayment income drops to
 * whatever part of it wasn't allocated against an expense. Either can land on
 * zero, which means the transaction shouldn't be counted at all — callers test
 * the result with `isNegligible`.
 */
function txnBaseValue(
  t: Transaction,
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  mode: CashflowMode,
): number {
  const gross = amountInBase(t.amount, t, base, rates);
  if (mode !== "net") return gross;
  if (t.type === "expense")
    return Math.max(0, gross - (reimbursed.get(t.id) ?? 0));
  if (t.type === "income") {
    const links = reimbursementLinks(t);
    if (links.length === 0) return gross;
    const allocated = links.reduce((s, l) => s + l.amount, 0);
    return amountInBase(Math.max(0, t.amount - allocated), t, base, rates);
  }
  return gross;
}

/**
 * Daily cumulative spend series (net-aware), optionally restricted to a
 * category set — income in those categories nets off as a refund, matching
 * how budgets count spend.
 */
function cumulativeSpendSeries(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  mode: CashflowMode,
  categoryIds?: Set<string>,
): { date: string; label: string; cum: number }[] {
  const daily = new Map<string, number>();
  for (const t of txns) {
    if (t.excluded_from_cashflow) continue;
    if (categoryIds && (!t.category_id || !categoryIds.has(t.category_id))) continue;
    if (t.type === "expense") {
      daily.set(t.date, (daily.get(t.date) ?? 0) + txnBaseValue(t, base, rates, reimbursed, mode));
    } else if (categoryIds && t.type === "income") {
      // Refund into a tracked category reduces its spend (mirrors spendForBudget).
      daily.set(t.date, (daily.get(t.date) ?? 0) - (convert(t.amount, t.currency, base, rates) ?? t.amount));
    }
  }
  const dates = [...daily.keys()].sort();
  let cum = 0;
  return dates.map((d) => {
    cum += daily.get(d)!;
    return { date: d, label: format(parseISO(d), "d MMM"), cum: Math.max(0, cum) };
  });
}

export function Analytics() {
  const [params] = useSearchParams();

  // Deep-link seeds: ?month=YYYY-MM → single-month; ?from&to → custom range.
  const seedMonth = params.get("month");
  const seedFrom = params.get("from");
  const seedTo = params.get("to");

  const [mode, setMode] = useState<"range" | "months">(seedMonth ? "months" : "range");
  const [preset, setPreset] = useState<string>(seedFrom && seedTo ? "custom" : "thisMonth");
  const [customFrom, setCustomFrom] = useState(seedFrom ?? format(subMonths(new Date(), 2), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(seedTo ?? format(new Date(), "yyyy-MM-dd"));
  const [selectedMonths, setSelectedMonths] = useState<string[]>(
    seedMonth ? [seedMonth] : [format(new Date(), "yyyy-MM")],
  );

  const [txnMode, setTxnMode] = useState<CashflowMode>("net");

  const { data: txns = [], isLoading } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const reimbursedMap = useReimbursedAmountMap();
  const aliasMap = useAliasMap();
  const overrides = useInvestmentOverrides(accounts);
  const base = useBaseCurrency();
  const rates = useRateMap();

  // Months that actually have entries — the only ones offered or charted.
  const monthsWithData = useMemo(() => {
    const s = new Set(txns.map((t) => t.date.slice(0, 7)));
    return [...s]
      .sort()
      .reverse()
      .map((key) => ({ key, label: format(parseISO(`${key}-01`), "MMM ''yy") }));
  }, [txns]);
  const dataMonthSet = useMemo(
    () => new Set(monthsWithData.map((m) => m.key)),
    [monthsWithData],
  );

  // Resolve the active period → month list, an in-scope test, a label.
  const period = useMemo(() => {
    if (mode === "months") {
      const list = [...selectedMonths].sort();
      const effective = list.length ? list : [format(new Date(), "yyyy-MM")];
      const set = new Set(effective);
      return {
        months: effective,
        inScope: (d: string) => set.has(d.slice(0, 7)),
        label:
          effective.length === 1
            ? format(parseISO(`${effective[0]}-01`), "MMMM yyyy")
            : `${effective.length} months selected`,
      };
    }
    const { from, to } =
      preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset);
    return {
      months: monthsBetween(from, to),
      inScope: (d: string) => d >= from && d <= to,
      label:
        preset === "custom"
          ? `${format(parseISO(customFrom), "d MMM yyyy")} – ${format(parseISO(customTo), "d MMM yyyy")}`
          : PRESETS.find((p) => p.id === preset)?.label ?? "",
    };
  }, [mode, preset, customFrom, customTo, selectedMonths]);

  const view = useMemo(() => {
    const scoped = txns.filter((t) => period.inScope(t.date));
    // Empty months carry no information — drop them from the per-month charts.
    const activeMonths = period.months.filter((mk) => dataMonthSet.has(mk));
    // `scoped` is the period slice; `txns` is passed as the ledger so a
    // repayment filed in another month still cancels its expense here.
    const cf = cashflowForRange(scoped, base, rates, WIDE.from, WIDE.to, txnMode, txns);
    const expenseCats = breakdownByCategory(scoped, categories, base, rates, WIDE.from, WIDE.to, "expense", txnMode, txns);
    const incomeCats = breakdownByCategory(scoped, categories, base, rates, WIDE.from, WIDE.to, "income", txnMode, txns);
    const movers = categoryMovers(txns, categories, base, rates, undefined, txnMode, 5);
    const cumulative = cumulativeSpendSeries(scoped, base, rates, reimbursedMap, txnMode);

    // Money flow (Sankey): income sources → hub → categories + saved/deficit.
    const flow = buildMoneyFlow(incomeCats, expenseCats, 6);

    // Savings-rate trend over every month that has data (oldest → newest).
    const trendMonths = [...dataMonthSet].sort().slice(-12);
    const savingsTrend = savingsRateSeries(txns, base, rates, trendMonths, txnMode);

    // Fixed vs discretionary split of the period's expenses.
    const fixedIds = new Set(categories.filter((c) => c.is_fixed).map((c) => c.id));
    const fixedCats = expenseCats.filter((c) => fixedIds.has(c.id));
    const discCats = expenseCats.filter((c) => !fixedIds.has(c.id));
    const fixedTotal = fixedCats.reduce((s, c) => s + c.value, 0);
    const discTotal = discCats.reduce((s, c) => s + c.value, 0);

    // Full-ledger signals (history is the signal — never period-scoped).
    const recurring = detectRecurring(txns, base, rates, aliasMap);
    const includesCurrentMonth = period.months.includes(format(new Date(), "yyyy-MM"));
    const projection = includesCurrentMonth
      ? monthEndProjection(txns, base, rates, txnMode)
      : null;
    const anomalies = includesCurrentMonth
      ? categoryAnomalies(txns, categories, base, rates, txnMode)
      : [];

    // Currency exposure across all accounts (portfolio-wide, not period-scoped).
    const byCur = balancesByCurrency(accounts, txns, overrides);
    const exposure = Object.entries(byCur)
      .map(([currency, amount]) => ({
        currency,
        base: convert(Math.abs(amount), currency, base, rates) ?? 0,
      }))
      .filter((e) => e.base > 0)
      .sort((a, b) => b.base - a.base);
    const exposureTotal = exposure.reduce((s, e) => s + e.base, 0);

    // Budgets — only meaningful for a single month (monthly amounts).
    let budgetRows: {
      id: string;
      name: string;
      color: string;
      spent: number;
      amount: number;
      catIds: Set<string>;
    }[] = [];
    if (period.months.length === 1) {
      const links = groupLinks(budgetLinks);
      budgetRows = budgets
        .filter((b) => b.type !== "goal" && b.direction !== "saving")
        .map((b) => {
          const catIds = links.get(b.id) ?? new Set<string>();
          let spent = 0;
          for (const t of scoped) {
            if (!t.category_id || !catIds.has(t.category_id)) continue;
            if (t.type === "expense")
              spent += txnBaseValue(t, base, rates, reimbursedMap, txnMode);
            else if (t.type === "income")
              spent -= convert(t.amount, t.currency, base, rates) ?? t.amount;
          }
          return {
            id: b.id,
            name: b.name,
            color: b.color ?? "#4d6175",
            spent: Math.max(0, spent),
            amount: b.amount,
            catIds,
          };
        });
    }

    const savingsRate = cf.income > 0 ? cf.net / cf.income : 0;
    return {
      scoped,
      activeMonths,
      cf,
      expenseCats,
      incomeCats,
      movers,
      cumulative,
      flow,
      savingsTrend,
      fixedCats,
      discCats,
      fixedTotal,
      discTotal,
      recurring,
      projection,
      anomalies,
      exposure,
      exposureTotal,
      budgetRows,
      savingsRate,
    };
  }, [txns, categories, accounts, budgets, budgetLinks, reimbursedMap, aliasMap, overrides, base, rates, txnMode, period, dataMonthSet]);

  function toggleMonth(k: string) {
    setSelectedMonths((prev) =>
      prev.includes(k) ? prev.filter((m) => m !== k) : [...prev, k],
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Analytics" />

      {/* ── Period controls ─────────────────────────────────────────────── */}
      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-rule/60 bg-ink-950/50 p-1">
            {(["range", "months"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                  mode === m ? "bg-ink-700 text-quill" : "text-quill-faint hover:text-quill-soft",
                )}
              >
                {m === "range" ? "Range" : "Pick months"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-rule/60 bg-ink-950/50 p-1">
            {(["gross", "net"] as CashflowMode[]).map((mo) => (
              <button
                key={mo}
                onClick={() => setTxnMode(mo)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                  txnMode === mo ? "bg-ink-700 text-quill" : "text-quill-faint hover:text-quill-soft",
                )}
              >
                {mo}
              </button>
            ))}
          </div>
        </div>

        {mode === "range" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    preset === p.id
                      ? "border-teal-500 bg-teal-500/10 text-teal-300"
                      : "border-rule text-quill-soft hover:border-rule",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-quill-soft">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 w-full rounded-xl border border-rule bg-ink-950/60 px-3 text-sm text-quill focus:border-teal-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-quill-soft">To</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-full rounded-xl border border-rule bg-ink-950/60 px-3 text-sm text-quill focus:border-teal-500 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>
        ) : monthsWithData.length === 0 ? (
          <p className="text-xs text-quill-faint">No months with entries yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {monthsWithData.map((m) => {
              const on = selectedMonths.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMonth(m.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-teal-500 bg-teal-500/15 text-teal-300"
                      : "border-rule text-quill-soft hover:border-rule",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-quill-faint">
          Showing <span className="text-quill-soft">{period.label}</span>
        </p>
      </Card>

      {txns.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-6" />}
          title="No data yet"
          hint="Add or import some transactions to see your analytics."
        />
      ) : (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Income" value={formatMoney(view.cf.income, base)} tone="up" />
            <Kpi label="Expenses" value={formatMoney(view.cf.expense, base)} tone="down" />
            <Kpi label="Net" value={formatMoney(view.cf.net, base)} tone={view.cf.net >= 0 ? "up" : "down"} />
            <Kpi label="Savings rate" value={`${Math.round(view.savingsRate * 100)}%`} />
          </div>

          <Insights view={view} base={base} />

          {/* MAIN chart: money flow — income sources → categories + saved */}
          <Widget
            title="Money flow"
            hint="Where income came from and where it went — the surplus flows to Saved"
          >
            {!view.flow ? (
              <ChartEmpty label="No income or spending in range" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <Sankey
                  data={view.flow}
                  nodePadding={28}
                  margin={{ top: 12, right: 8, bottom: 12, left: 8 }}
                  node={(p: unknown) => <FlowNode {...(p as FlowNodeProps)} base={base} />}
                  link={{ stroke: "#4d6175", strokeOpacity: 0.28 }}
                >
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#eef4fa" }}
                    labelStyle={{ color: "#eef4fa" }}
                    formatter={(v: number) => formatMoney(Number(v), base)}
                  />
                </Sankey>
              </ResponsiveContainer>
            )}
          </Widget>

          {/* Cumulative spending over the period */}
          <Widget title="Cumulative spending" hint="Running total across the period">
            {view.cumulative.length === 0 ? (
              <ChartEmpty label="No spending in range" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={view.cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="cumSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#1c2632" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 11 }} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#6f8499", fontSize: 11 }} tickFormatter={(v) => compact(v, base)} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#eef4fa" }}
                    labelStyle={{ color: "#eef4fa" }}
                    formatter={(v: number) => [formatMoney(v, base), "Spent so far"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cum"
                    stroke="#fb7185"
                    strokeWidth={2}
                    fill="url(#cumSpend)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Widget>

          {/* Savings-rate trend + fixed vs discretionary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Savings rate" hint="Net ÷ income, per month">
              {view.savingsTrend.filter((p) => p.rate != null).length < 2 ? (
                <p className="py-6 text-center text-sm text-quill-faint">
                  Needs at least two months with income.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={view.savingsTrend} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke="#1c2632" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 11 }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      tick={{ fill: "#6f8499", fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: "#eef4fa" }}
                      labelStyle={{ color: "#eef4fa" }}
                      formatter={(v: number) => [`${Math.round(v)}%`, "Savings rate"]}
                    />
                    <ReferenceLine y={0} stroke="#fb7185" strokeDasharray="4 3" />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#7fd1b9"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Widget>

            <Widget title="Fixed vs discretionary" hint="Committed bills vs controllable spend">
              {view.fixedTotal + view.discTotal <= 0 ? (
                <p className="py-6 text-center text-sm text-quill-faint">No spending in range.</p>
              ) : (
                <FixedVsDiscretionary
                  fixedTotal={view.fixedTotal}
                  discTotal={view.discTotal}
                  fixedCats={view.fixedCats}
                  discCats={view.discCats}
                  base={base}
                />
              )}
            </Widget>
          </div>

          {/* Expense breakdown — expandable category bars */}
          <Widget title="Where money went" hint="Expenses by category — tap a row for detail">
            {view.expenseCats.length === 0 ? (
              <ChartEmpty label="No spending in range" />
            ) : (
              <CategoryBreakdown
                slices={view.expenseCats}
                scoped={view.scoped}
                months={view.activeMonths}
                kind="expense"
                base={base}
                rates={rates}
                reimbursed={reimbursedMap}
                mode={txnMode}
              />
            )}
          </Widget>

          {/* Income breakdown */}
          <Widget title="Where money came from" hint="Income by category — tap a row for detail">
            {view.incomeCats.length === 0 ? (
              <ChartEmpty label="No income in range" />
            ) : (
              <CategoryBreakdown
                slices={view.incomeCats}
                scoped={view.scoped}
                months={view.activeMonths}
                kind="income"
                base={base}
                rates={rates}
                reimbursed={reimbursedMap}
                mode={txnMode}
              />
            )}
          </Widget>

          {/* Recurring & subscriptions — detected from the full ledger */}
          <Widget
            title="Recurring & subscriptions"
            hint={
              view.recurring.length > 0
                ? `≈ ${formatMoney(view.recurring.reduce((s, r) => s + r.monthlyEquivalent, 0), base)}/month committed`
                : "Detected from steady intervals and stable amounts"
            }
          >
            {view.recurring.length === 0 ? (
              <p className="py-6 text-center text-sm text-quill-faint">
                No recurring charges detected yet — needs ≥3 charges to the same
                merchant at a steady interval.
              </p>
            ) : (
              <ul className="divide-y divide-ink-800/60">
                {view.recurring.slice(0, 8).map((r) => (
                  <li key={r.merchant} className="flex items-center gap-3 py-2 text-sm">
                    <RefreshCcw className="size-3.5 shrink-0 text-quill-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-quill">{r.merchant}</p>
                      <p className="text-xs text-quill-faint">
                        {r.cadence} · ×{r.count} ·{" "}
                        {r.maybeStopped ? (
                          <span className="text-amber-400">
                            no charge since {format(parseISO(r.lastDate), "d MMM")} — stopped?
                          </span>
                        ) : (
                          <>next ~{format(parseISO(r.nextDue), "d MMM")}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-quill">{formatMoney(r.typicalAmount, base)}</p>
                      <p className="tnum text-xs text-quill-faint">
                        {formatMoney(r.monthlyEquivalent, base)}/mo
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          {/* Budgets — deep per-budget detail for a single month */}
          <Widget
            title="Budgets"
            hint={
              period.months.length === 1
                ? `${period.label} — tap a budget for detail`
                : "Select a single month to see budgets"
            }
          >
            {period.months.length !== 1 ? (
              <p className="py-6 text-center text-sm text-quill-faint">
                Budgets are monthly — pick one month to see them.
              </p>
            ) : view.budgetRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-quill-faint">No spending budgets set.</p>
            ) : (
              <BudgetsDetail
                rows={view.budgetRows}
                scoped={view.scoped}
                base={base}
                rates={rates}
                reimbursed={reimbursedMap}
                mode={txnMode}
              />
            )}
          </Widget>

          {/* Movers + currency exposure */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Month-on-month movers" hint="This month vs last">
              {view.movers.length === 0 ? (
                <p className="py-6 text-center text-sm text-quill-faint">No change to report.</p>
              ) : (
                <ul className="space-y-2">
                  {view.movers.map((m) => (
                    <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="truncate text-quill">{m.name}</span>
                      </span>
                      <span className={cn("tnum flex shrink-0 items-center gap-1 font-medium", m.delta > 0 ? "text-rose-400" : "text-teal-400")}>
                        {m.delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {formatMoney(Math.abs(m.delta), base)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>

            <Widget title="Currency exposure" hint="Across all accounts">
              {view.exposure.length === 0 ? (
                <p className="py-6 text-center text-sm text-quill-faint">No balances to show.</p>
              ) : (
                <ul className="space-y-2.5">
                  {view.exposure.map((e) => (
                    <li key={e.currency}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="text-quill">{e.currency}</span>
                        <span className="tnum text-quill-soft">
                          {formatMoney(e.base, base)}
                          <span className="ml-1 text-quill-faint">
                            {view.exposureTotal > 0 ? `${Math.round((e.base / view.exposureTotal) * 100)}%` : ""}
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                        <div className="h-full rounded-full bg-teal-500" style={{ width: `${view.exposureTotal > 0 ? (e.base / view.exposureTotal) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category breakdown (expandable bar rows) ─────────────────────────────────

function CategoryBreakdown({
  slices,
  scoped,
  months,
  kind,
  base,
  rates,
  reimbursed,
  mode,
}: {
  slices: CategorySlice[];
  scoped: Transaction[];
  months: string[];
  kind: "expense" | "income";
  base: string;
  rates: RateMap;
  reimbursed: Map<string, number>;
  mode: CashflowMode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <ul className="space-y-1">
      {slices.map((s) => {
        const isOpen = open === s.id;
        const pct = (s.value / total) * 100;
        return (
          <li key={s.id} className={cn("rounded-xl transition-colors", isOpen && "bg-ink-950/40")}>
            <button
              onClick={() => setOpen(isOpen ? null : s.id)}
              className="block w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink-800/40"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown
                    className={cn("size-3.5 shrink-0 text-quill-faint transition-transform", !isOpen && "-rotate-90")}
                  />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-quill">{s.name}</span>
                </span>
                <span className="tnum shrink-0 text-quill-soft">
                  {formatMoney(s.value, base)}
                  <span className="ml-1.5 text-xs text-quill-faint">{Math.round(pct)}%</span>
                </span>
              </div>
              <div className="ml-6 h-2 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
            </button>

            {isOpen && (
              <CategoryDetail
                slice={s}
                scoped={scoped}
                months={months}
                kind={kind}
                base={base}
                rates={rates}
                reimbursed={reimbursed}
                mode={mode}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CategoryDetail({
  slice,
  scoped,
  months,
  kind,
  base,
  rates,
  reimbursed,
  mode,
}: {
  slice: CategorySlice;
  scoped: Transaction[];
  months: string[];
  kind: "expense" | "income";
  base: string;
  rates: RateMap;
  reimbursed: Map<string, number>;
  mode: CashflowMode;
}) {
  const inCategory = (t: Transaction) =>
    slice.id === "uncategorised" ? !t.category_id : t.category_id === slice.id;

  const catTxns = useMemo(
    () =>
      scoped
        .filter((t) => t.type === kind && inCategory(t))
        .map((t) => ({ t, v: txnBaseValue(t, base, rates, reimbursed, mode) }))
        // Fully repaid entries cost nothing — they don't belong in the list
        // or its count.
        .filter(({ v }) => !isNegligible(v))
        .sort((a, b) => b.v - a.v),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, slice.id, kind, base, rates, reimbursed, mode],
  );

  const series = useMemo(
    () =>
      months.map((mk) => ({
        label: format(parseISO(`${mk}-01`), "MMM ''yy"),
        value: catTxns
          .filter(({ t }) => t.date.startsWith(mk))
          .reduce((s, { t: _t, v }) => s + v, 0),
      })),
    [months, catTxns],
  );

  const avg = months.length > 1 ? slice.value / months.length : null;

  return (
    <div className="space-y-3 px-2 pb-3 pl-8">
      {avg != null && (
        <p className="tnum text-xs text-quill-faint">
          ~{formatMoney(avg, base)}/month average over {months.length} months
        </p>
      )}

      {/* Per-month bars — only when there's a trend to show */}
      {months.length > 1 && (
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="#1c2632" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 11 }} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [formatMoney(v, base), slice.name]}
            />
            <Bar
              dataKey="value"
              fill={slice.color}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Largest entries */}
      <div>
        <p className="mb-1 text-xs font-medium text-quill-faint">
          Largest {kind === "expense" ? "expenses" : "income"} · {catTxns.length} entr{catTxns.length === 1 ? "y" : "ies"}
        </p>
        <ul className="divide-y divide-ink-800/60">
          {catTxns.slice(0, 6).map(({ t, v }) => (
            <li key={t.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="tnum w-14 shrink-0 text-xs text-quill-faint">
                {format(parseISO(t.date), "d MMM")}
              </span>
              <span className="min-w-0 flex-1 truncate text-quill-soft">
                {t.merchant || "—"}
              </span>
              <span className="tnum shrink-0 text-quill">{formatMoney(v, base)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Budgets detail (single month) ────────────────────────────────────────────

function BudgetsDetail({
  rows,
  scoped,
  base,
  rates,
  reimbursed,
  mode,
}: {
  rows: { id: string; name: string; color: string; spent: number; amount: number; catIds: Set<string> }[];
  scoped: Transaction[];
  base: string;
  rates: RateMap;
  reimbursed: Map<string, number>;
  mode: CashflowMode;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="space-y-1">
      {rows.map((b) => {
        const isOpen = open === b.id;
        const ratio = b.amount > 0 ? b.spent / b.amount : 0;
        const over = b.spent > b.amount + 0.005;
        // Daily cumulative spend for this budget's categories → crossing date.
        const series = cumulativeSpendSeries(scoped, base, rates, reimbursed, mode, b.catIds);
        const crossed = over ? series.find((p) => p.cum > b.amount) : undefined;

        return (
          <li key={b.id} className={cn("rounded-xl transition-colors", isOpen && "bg-ink-950/40")}>
            <button
              onClick={() => setOpen(isOpen ? null : b.id)}
              className="block w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink-800/40"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown
                    className={cn("size-3.5 shrink-0 text-quill-faint transition-transform", !isOpen && "-rotate-90")}
                  />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                  <span className="truncate text-quill">{b.name}</span>
                </span>
                <span className={cn("tnum shrink-0", over ? "text-rose-400" : "text-quill-soft")}>
                  {formatMoney(b.spent, base)}
                  <span className="text-quill-faint"> / {formatMoney(b.amount, base)}</span>
                </span>
              </div>
              <div className="ml-6 flex h-2 overflow-hidden rounded-full bg-ink-800">
                {over ? (
                  <>
                    <div className="h-full bg-amber-500" style={{ width: `${(b.amount / b.spent) * 100}%` }} />
                    <div className="h-full bg-rose-500" style={{ width: `${100 - (b.amount / b.spent) * 100}%` }} />
                  </>
                ) : (
                  <div
                    className={cn("h-full rounded-full", ratio > 0.85 ? "bg-amber-500" : "bg-teal-500")}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                )}
              </div>
              <p className={cn("tnum ml-6 mt-1 text-xs", over ? "text-rose-400" : "text-quill-faint")}>
                {over
                  ? `Over by ${formatMoney(b.spent - b.amount, base)}${crossed ? ` · crossed the limit on ${crossed.label}` : ""}`
                  : `${formatMoney(b.amount - b.spent, base)} left · ${Math.round(ratio * 100)}% used`}
              </p>
            </button>

            {isOpen && (
              <div className="px-2 pb-3 pl-8">
                {series.length === 0 ? (
                  <p className="py-2 text-xs text-quill-faint">No entries this month.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id={`bud-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={b.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={b.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#1c2632" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 11 }} minTickGap={20} />
                      <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: "#6f8499", fontSize: 11 }} tickFormatter={(v) => compact(v, base)} domain={[0, (dataMax: number) => Math.max(dataMax, b.amount) * 1.1]} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "#eef4fa" }}
                        labelStyle={{ color: "#eef4fa" }}
                        formatter={(v: number) => [formatMoney(v, base), "Spent so far"]}
                      />
                      <ReferenceLine
                        y={b.amount}
                        stroke="#fb7185"
                        strokeDasharray="5 4"
                        label={{ value: "Budget", position: "insideTopRight", fill: "#fb7185", fontSize: 11 }}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="cum"
                        stroke={b.color}
                        strokeWidth={2}
                        fill={`url(#bud-${b.id})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── shared bits ──────────────────────────────────────────────────────────────

/** Compact axis money (e.g. $1.2k) so the y-axis stays narrow. */
function compact(v: number, base: string): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return formatMoney(v, base).replace(/\.00$/, "");
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const size = value.length > 11 ? "text-lg lg:text-xl" : "text-xl lg:text-2xl";
  return (
    <Card className="min-w-0 p-3.5">
      <p className="truncate text-xs font-medium text-quill-soft">{label}</p>
      <p
        className={cn(
          "tnum mt-1 break-words font-semibold leading-tight tracking-tight",
          size,
          tone === "up" ? "text-teal-400" : tone === "down" ? "text-rose-400" : "text-quill",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

interface AnalyticsView {
  cf: { income: number; expense: number; net: number };
  expenseCats: CategorySlice[];
  movers: { name: string; color: string; delta: number }[];
  budgetRows: { name: string; spent: number; amount: number }[];
  savingsRate: number;
  projection: {
    projected: number;
    spent: number;
    daysElapsed: number;
    daysInMonth: number;
    vsPrior: number | null;
  } | null;
  anomalies: { name: string; z: number; current: number; mean: number }[];
  recurring: { monthlyEquivalent: number }[];
}

function Insights({ view, base }: { view: AnalyticsView; base: string }) {
  const items: string[] = [];

  if (view.projection) {
    const p = view.projection;
    const vs =
      p.vsPrior == null
        ? ""
        : Math.abs(p.vsPrior) < 0.05
          ? " — in line with your recent months"
          : ` — ${Math.round(Math.abs(p.vsPrior) * 100)}% ${p.vsPrior > 0 ? "above" : "below"} your recent average`;
    items.push(
      `On pace for ${formatMoney(p.projected, base)} spend this month (${formatMoney(p.spent, base)} in ${p.daysElapsed} of ${p.daysInMonth} days)${vs}.`,
    );
  }

  for (const a of view.anomalies.slice(0, 2)) {
    items.push(
      `${a.name} is well ${a.z > 0 ? "above" : "below"} its usual level: ${formatMoney(a.current, base)} vs ~${formatMoney(a.mean, base)} typical.`,
    );
  }

  if (view.expenseCats[0])
    items.push(`Biggest expense: ${view.expenseCats[0].name} (${formatMoney(view.expenseCats[0].value, base)}).`);

  const overs = view.budgetRows.filter((b) => b.spent > b.amount + 0.005);
  if (overs.length > 0) {
    const worst = overs.reduce((a, b) => (b.spent - b.amount > a.spent - a.amount ? b : a));
    items.push(
      `${overs.length} budget${overs.length === 1 ? "" : "s"} over — worst: ${worst.name} by ${formatMoney(worst.spent - worst.amount, base)}.`,
    );
  }

  const subs = view.recurring.reduce((s, r) => s + r.monthlyEquivalent, 0);
  if (subs > 0)
    items.push(
      `Recurring bills commit ≈ ${formatMoney(subs, base)}/month before you spend a cent.`,
    );

  if (view.movers[0]) {
    const m = view.movers[0];
    items.push(`${m.name} spending ${m.delta > 0 ? "up" : "down"} ${formatMoney(Math.abs(m.delta), base)} vs last month.`);
  }
  items.push(
    view.savingsRate >= 0
      ? `You saved ${Math.round(view.savingsRate * 100)}% of income this period.`
      : `You spent more than you earned this period.`,
  );
  return (
    <Card className="space-y-1.5">
      <p className="text-sm font-semibold text-quill">Insights</p>
      <ul className="space-y-1 text-sm text-quill-soft">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-teal-400">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface FlowNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: { name: string; color: string; value: number; side: "in" | "hub" | "out" };
}

/**
 * Sankey node: coloured block + name/value label. Income sources (`side: "in"`)
 * label to the RIGHT so they never clip the left edge; the hub and expense
 * sinks label to the LEFT. Side is baked into the data so this needs no
 * (unreliable) containerWidth from recharts.
 */
function FlowNode({ x, y, width, height, payload, base }: FlowNodeProps & { base: string }) {
  const toRight = payload.side === "in";
  const labelX = toRight ? x + width + 8 : x - 8;
  const anchor = toRight ? "start" : "end";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={payload.color} rx={2} fillOpacity={0.9} />
      <text x={labelX} y={y + height / 2 - 2} textAnchor={anchor} fill="#c6d3df" fontSize={12}>
        {payload.name}
      </text>
      <text x={labelX} y={y + height / 2 + 12} textAnchor={anchor} fill="#6f8499" fontSize={11} className="tnum">
        {formatMoney(payload.value, base)}
      </text>
    </g>
  );
}

/** Two-tone committed-vs-controllable split with per-side category chips. */
function FixedVsDiscretionary({
  fixedTotal,
  discTotal,
  fixedCats,
  discCats,
  base,
}: {
  fixedTotal: number;
  discTotal: number;
  fixedCats: CategorySlice[];
  discCats: CategorySlice[];
  base: string;
}) {
  const total = fixedTotal + discTotal;
  const fixedPct = (fixedTotal / total) * 100;
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full bg-sky-500/80" style={{ width: `${fixedPct}%` }} />
        <div className="h-full bg-amber-500/80" style={{ width: `${100 - fixedPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-sky-300">
            Fixed · {Math.round(fixedPct)}%
          </p>
          <p className="tnum font-semibold text-quill">{formatMoney(fixedTotal, base)}</p>
          <p className="mt-1 truncate text-xs text-quill-faint">
            {fixedCats.length === 0
              ? "No categories marked fixed yet — set them in Categories."
              : fixedCats.map((c) => c.name).join(" · ")}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-300">
            Discretionary · {Math.round(100 - fixedPct)}%
          </p>
          <p className="tnum font-semibold text-quill">{formatMoney(discTotal, base)}</p>
          <p className="mt-1 truncate text-xs text-quill-faint">
            {discCats.map((c) => c.name).join(" · ") || "—"}
          </p>
        </div>
      </div>
      <p className="text-xs text-quill-faint">
        Discretionary is the lever — fixed costs only move by renegotiating or
        cancelling.
      </p>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-rule text-center text-sm text-quill-faint">
      {label}
    </div>
  );
}

function Widget({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-quill">{title}</h2>
        {hint && <p className="text-xs text-quill-faint">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}
