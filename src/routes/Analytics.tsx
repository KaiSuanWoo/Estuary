import { useMemo, useState } from "react";
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
import {
  useCashflowByMonth,
  useCategoryEntries,
  useCategorySpend,
  useCategorySpendByMonth,
  useDailySpend,
  useLedgerMonths,
  useMonthlyCashflow,
  useRecurringExpenses,
} from "@/hooks/useCashflow";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useBalancesByAccount } from "@/hooks/useAccountBalances";
import { useInvestmentOverrides } from "@/hooks/useInvestmentSnapshot";
import { useBudgets, useBudgetLinks } from "@/hooks/useBudgets";
import { groupLinks } from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { sumBalances } from "@/lib/balances";
import { convert } from "@/lib/fx";
import {
  buildMoneyFlow,
  categoryAnomaliesFor,
  categoryMoversFor,
  isNegligible,
  monthEndProjectionFor,
  monthsBetween,
  rangeBounds,
  savingsRateFor,
  slicesFor,
  totalsFor,
  type CashflowMode,
  type CategorySlice,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyState, Spinner } from "@/components/ui";
import {
  ChartEmpty,
  MarginLink,
  PageHead,
  Plate,
  Statement,
  tooltipStyle,
  useLedgerInk,
} from "@/components/ledger";
import { BudgetsBoard } from "@/components/BudgetsBoard";
import { FALLBACK_HEAD } from "@/lib/constants";

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

/*
 * `txnBaseValue` and `cumulativeSpendSeries` used to live here.
 *
 * Both walked the period's transactions; the second then walked them again per
 * budget, to find the day each one crossed its limit. `transaction_net` already
 * carries the per-entry net value, and `public.daily_spend` does the daily
 * grouping — including the category-scoped variant the budget drill needs.
 */

export function Analytics() {
  const ink = useLedgerInk();
  const [params, setParams] = useSearchParams();

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

  // Which of the two boards is open, read from the URL rather than held in
  // state. Seeding state from a search param only reads it once, so a link to
  // ?view=budgets did nothing if you were already on Analytics, and switching
  // boards left the URL behind — no back button, nothing to share or reload.
  const board = params.get("view") === "budgets" ? "budgets" : "analysis";
  const setBoard = (next: "analysis" | "budgets") => {
    const p = new URLSearchParams(params);
    if (next === "budgets") p.set("view", "budgets");
    else p.delete("view");
    setParams(p);
  };

  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLinks = [] } = useBudgetLinks();
  const overrides = useInvestmentOverrides(accounts);
  const balancesByAccount = useBalancesByAccount(overrides);
  const base = useBaseCurrency();
  const rates = useRateMap();

  // Months that actually have entries — the only ones offered or charted.
  const { data: ledgerMonths = [], isLoading } = useLedgerMonths();
  const monthsWithData = useMemo(
    () =>
      ledgerMonths.map((key) => ({
        key,
        label: format(parseISO(`${key}-01`), "MMM ''yy"),
      })),
    [ledgerMonths],
  );
  const dataMonthSet = useMemo(() => new Set(ledgerMonths), [ledgerMonths]);

  // Resolve the active period → month list, an in-scope test, a label.
  const period = useMemo(() => {
    if (mode === "months") {
      const list = [...selectedMonths].sort();
      const effective = list.length ? list : [format(new Date(), "yyyy-MM")];
      const set = new Set(effective);
      // The span the selected months sit inside, for the day-grained query.
      // A non-contiguous selection is filtered back down by `inScope`.
      const first = effective[0]!;
      const last = effective[effective.length - 1]!;
      return {
        months: effective,
        from: `${first}-01`,
        to: format(endOfMonth(parseISO(`${last}-01`)), "yyyy-MM-dd"),
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
      from,
      to,
      inScope: (d: string) => d >= from && d <= to,
      label:
        preset === "custom"
          ? `${format(parseISO(customFrom), "d MMM yyyy")} – ${format(parseISO(customTo), "d MMM yyyy")}`
          : PRESETS.find((p) => p.id === preset)?.label ?? "",
    };
  }, [mode, preset, customFrom, customTo, selectedMonths]);

  /**
   * A month-aligned period can be served by the per-month views, which cover
   * every month at once — so the movers, the anomaly history and the
   * savings-rate trend all read from the same fetch the period totals do. Only
   * a hand-picked custom range needs its own query, since it can start and end
   * mid-month.
   */
  const monthAligned = mode === "months" || preset !== "custom";
  const { data: allMonths = [] } = useMonthlyCashflow();
  const { data: allCategoryMonths = [] } = useCategorySpendByMonth();
  const { data: rangeMonths = [] } = useCashflowByMonth(
    monthAligned ? "" : period.from,
    monthAligned ? "" : period.to,
  );
  const { data: rangeCategories = [] } = useCategorySpend(
    monthAligned ? "" : period.from,
    monthAligned ? "" : period.to,
  );
  const { data: dailyRows = [] } = useDailySpend(period.from, period.to);
  const { data: recurring = [] } = useRecurringExpenses();

  const view = useMemo(() => {
    // Empty months carry no information — drop them from the per-month charts.
    const activeMonths = period.months.filter((mk) => dataMonthSet.has(mk));
    const monthSet = new Set(period.months);

    // The period's own months, from whichever source covers it.
    const periodMonths = monthAligned
      ? allMonths.filter((r) => monthSet.has(r.month.slice(0, 7)))
      : rangeMonths;
    const cf = totalsFor(periodMonths, txnMode);

    // Per-category totals for the period: fold the per-month rows together
    // when month-aligned, otherwise take the range query's own grouping.
    const periodCategories = monthAligned
      ? [
          ...allCategoryMonths
            .filter((r) => monthSet.has(r.month.slice(0, 7)))
            .reduce((acc, r) => {
              const key = `${r.category_id ?? "null"}:${r.kind}`;
              const prev = acc.get(key);
              if (prev) {
                prev.gross += r.gross;
                prev.net += r.net;
              } else {
                acc.set(key, {
                  category_id: r.category_id,
                  kind: r.kind,
                  gross: r.gross,
                  net: r.net,
                });
              }
              return acc;
            }, new Map<string, { category_id: string | null; kind: string; gross: number; net: number }>())
            .values(),
        ]
      : rangeCategories;

    const expenseCats = slicesFor(periodCategories, categories, "expense", txnMode);
    const incomeCats = slicesFor(periodCategories, categories, "income", txnMode);
    const movers = categoryMoversFor(allCategoryMonths, categories, txnMode, undefined, 5);

    // Cumulative spend through the period. The day rows are already summed;
    // a non-contiguous month selection drops the days in between.
    const cumulative = (() => {
      let cum = 0;
      return dailyRows
        .filter((r) => period.inScope(r.day))
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((r) => {
          cum += txnMode === "gross" ? r.gross : r.net;
          return {
            date: r.day,
            label: format(parseISO(r.day), "d MMM"),
            cum: Math.max(0, cum),
          };
        });
    })();

    // Money flow (Sankey): income sources → hub → categories + saved/deficit.
    const flow = buildMoneyFlow(incomeCats, expenseCats, 6);

    // Savings-rate trend over every month that has data (oldest → newest).
    const trendMonths = [...dataMonthSet].sort().slice(-12);
    const savingsTrend = savingsRateFor(allMonths, trendMonths, txnMode);

    // Fixed vs discretionary split of the period's expenses.
    const fixedIds = new Set(categories.filter((c) => c.is_fixed).map((c) => c.id));
    const fixedCats = expenseCats.filter((c) => fixedIds.has(c.id));
    const discCats = expenseCats.filter((c) => !fixedIds.has(c.id));
    const fixedTotal = fixedCats.reduce((s, c) => s + c.value, 0);
    const discTotal = discCats.reduce((s, c) => s + c.value, 0);

    // Signals read across all history, never period-scoped: a pace or a norm
    // means nothing measured only inside the window being looked at.
    const includesCurrentMonth = period.months.includes(format(new Date(), "yyyy-MM"));
    const projection = includesCurrentMonth
      ? monthEndProjectionFor(allMonths, txnMode)
      : null;
    const anomalies = includesCurrentMonth
      ? categoryAnomaliesFor(allCategoryMonths, categories, txnMode)
      : [];

    // Currency exposure across all accounts (portfolio-wide, not period-scoped).
    // Straight from `account_balances`: re-deriving it here meant one pass over
    // the whole ledger per account, and could disagree with the figure the
    // Accounts page shows for the very same pocket.
    const byCur = sumBalances(accounts, balancesByAccount);
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
      const spentByCategory = new Map(
        periodCategories
          .filter((r) => r.kind === "expense" && r.category_id)
          .map((r) => [r.category_id!, txnMode === "gross" ? r.gross : r.net]),
      );
      const refundByCategory = new Map(
        periodCategories
          .filter((r) => r.kind === "income" && r.category_id)
          .map((r) => [r.category_id!, r.gross]),
      );
      budgetRows = budgets
        .filter((b) => b.type !== "goal" && b.direction !== "saving")
        .map((b) => {
          const catIds = links.get(b.id) ?? new Set<string>();
          let spent = 0;
          for (const id of catIds)
            spent += (spentByCategory.get(id) ?? 0) - (refundByCategory.get(id) ?? 0);
          return {
            id: b.id,
            name: b.name,
            color: b.color ?? FALLBACK_HEAD,
            spent: Math.max(0, spent),
            amount: b.amount,
            catIds,
          };
        });
    }

    const savingsRate = cf.income > 0 ? cf.net / cf.income : 0;
    return {
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
  }, [
    categories,
    accounts,
    budgets,
    budgetLinks,
    balancesByAccount,
    base,
    rates,
    txnMode,
    period,
    monthAligned,
    allMonths,
    allCategoryMonths,
    rangeMonths,
    rangeCategories,
    dailyRows,
    recurring,
    dataMonthSet,
  ]);

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

  const head = (
    <PageHead
      title="Analytics"
      note={board === "budgets" ? "What you meant to spend" : "What actually happened"}
      action={
        // Two ways of reading the same ledger: what happened, and what you
        // said would happen. They belong on one page, not in two places.
        <span className="inline-flex items-center gap-3 text-xs">
          {(["analysis", "budgets"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setBoard(v)}
              className={cn(
                "tap capitalize transition-colors",
                board === v
                  ? "text-quill underline decoration-brass underline-offset-4"
                  : "text-quill-faint hover:text-quill-soft",
              )}
            >
              {v}
            </button>
          ))}
        </span>
      }
    />
  );

  if (board === "budgets") {
    return (
      <div className="mx-auto max-w-2xl">
        {head}
        <BudgetsBoard />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {head}

      {/* ── Period controls ─────────────────────────────────────────────── */}
      <div className="settle mb-4 space-y-3 border-b border-rule pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-[2px] border border-rule/60 bg-well p-1">
            {(["range", "months"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "tap rounded-[2px] px-3 py-1 text-xs font-medium capitalize transition-colors",
                  mode === m ? "bg-rule text-quill" : "text-quill-soft hover:text-quill",
                )}
              >
                {m === "range" ? "Range" : "Pick months"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-[2px] border border-rule/60 bg-well p-1">
            {(["gross", "net"] as CashflowMode[]).map((mo) => (
              <button
                key={mo}
                onClick={() => setTxnMode(mo)}
                className={cn(
                  "tap rounded-[2px] px-3 py-1 text-xs font-medium capitalize transition-colors",
                  txnMode === mo ? "bg-rule text-quill" : "text-quill-soft hover:text-quill",
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
                    "tap rounded-[2px] border px-3 py-1 text-xs font-medium transition-colors",
                    preset === p.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-rule text-quill-soft hover:border-rule-strong",
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
                    className="h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-quill-soft">To</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill focus:border-accent focus:outline-none"
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
                    "tap rounded-[2px] border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-rule text-quill-soft hover:border-rule-strong",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs italic text-quill-faint">
          Showing <span className="text-quill-soft">{period.label}</span>
        </p>
      </div>

      {ledgerMonths.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-6" />}
          title="No data yet"
          hint="Add or import some transactions to see your analytics."
        />
      ) : (
        <div className="space-y-4">
          {/* The period, set out */}
          <Statement
            rows={[
              { label: "Received", value: formatMoney(view.cf.income, base), tone: "credit" },
              { label: "Expended", value: formatMoney(view.cf.expense, base), tone: "debit" },
              { label: "Kept", value: `${Math.round(view.savingsRate * 100)}%` },
            ]}
            total={{
              label: "Net",
              value: formatMoney(view.cf.net, base),
              tone: view.cf.net >= 0 ? "credit" : "debit",
            }}
          />

          <Insights view={view} base={base} />

          {/* MAIN chart: money flow — income sources → categories + saved */}
          <Plate
            caption="Money flow"
            note="Where income came from and where it went — the surplus flows to Saved"
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
                  link={{ stroke: FALLBACK_HEAD, strokeOpacity: 0.28 }}
                >
                  <Tooltip
                    {...tooltipStyle(ink)}
                    formatter={(v: number) => formatMoney(Number(v), base)}
                  />
                </Sankey>
              </ResponsiveContainer>
            )}
          </Plate>

          {/* Cumulative spending over the period */}
          <Plate caption="Cumulative spending" note="Running total across the period">
            {view.cumulative.length === 0 ? (
              <ChartEmpty label="No spending in range" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={view.cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="cumSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ink["--color-debit"]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ink["--color-debit"]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} tickFormatter={(v) => compact(v, base)} />
                  <Tooltip
                    {...tooltipStyle(ink)}
                    formatter={(v: number) => [formatMoney(v, base), "Spent so far"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cum"
                    stroke={ink["--color-debit"]}
                    strokeWidth={2}
                    fill="url(#cumSpend)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Plate>

          {/* Savings-rate trend + fixed vs discretionary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Plate caption="Savings rate" note="Net ÷ income, per month">
              {view.savingsTrend.filter((p) => p.rate != null).length < 2 ? (
                <p className="py-6 text-center text-sm text-quill-faint">
                  Needs at least two months with income.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={view.savingsTrend} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      {...tooltipStyle(ink)}
                      formatter={(v: number) => [`${Math.round(v)}%`, "Savings rate"]}
                    />
                    <ReferenceLine y={0} stroke={ink["--color-debit"]} strokeDasharray="4 3" />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke={ink["--color-credit"]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Plate>

            <Plate caption="Fixed vs discretionary" note="Committed bills vs controllable spend">
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
            </Plate>
          </div>

          {/* Expense breakdown — expandable category bars */}
          <Plate caption="Where money went" note="Expenses by category — tap a row for detail">
            {view.expenseCats.length === 0 ? (
              <ChartEmpty label="No spending in range" />
            ) : (
              <CategoryBreakdown
                slices={view.expenseCats}
                months={view.activeMonths}
                kind="expense"
                from={period.from}
                to={period.to}
                base={base}
                mode={txnMode}
              />
            )}
          </Plate>

          {/* Income breakdown */}
          <Plate caption="Where money came from" note="Income by category — tap a row for detail">
            {view.incomeCats.length === 0 ? (
              <ChartEmpty label="No income in range" />
            ) : (
              <CategoryBreakdown
                slices={view.incomeCats}
                months={view.activeMonths}
                kind="income"
                from={period.from}
                to={period.to}
                base={base}
                mode={txnMode}
              />
            )}
          </Plate>

          {/* Recurring & subscriptions — detected from the full ledger */}
          <Plate
            caption="Recurring & subscriptions"
            note={
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
              <ul className="divide-y divide-rule">
                {view.recurring.slice(0, 8).map((r) => (
                  <li key={r.merchant} className="flex items-center gap-3 py-2 text-sm">
                    <RefreshCcw className="size-3.5 shrink-0 text-quill-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-quill">{r.merchant}</p>
                      <p className="text-xs text-quill-faint">
                        {r.cadence} · ×{r.count} ·{" "}
                        {r.maybeStopped ? (
                          <span className="text-accent">
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
          </Plate>

          {/* Budgets live on their own view now — this is the way through. */}
          <Plate
            caption="Budgets"
            note="Pacing, overruns and the heads nothing is watching"
            action={
              <button onClick={() => setBoard("budgets")}>
                <MarginLink>open budgets</MarginLink>
              </button>
            }
          >
            {period.months.length !== 1 ? (
              <p className="text-sm italic text-quill-faint">
                Budgets are kept by period — the budgets view reads them against
                their own windows rather than this one.
              </p>
            ) : view.budgetRows.length === 0 ? (
              <p className="text-sm italic text-quill-faint">No spending budgets set.</p>
            ) : (
              <BudgetsDetail
                rows={view.budgetRows}
                from={period.from}
                to={period.to}
                base={base}
                mode={txnMode}
              />
            )}
          </Plate>

          {/* Movers + currency exposure */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Plate caption="Month-on-month movers" note="This month vs last">
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
                      <span className={cn("tnum flex shrink-0 items-center gap-1 font-medium", m.delta > 0 ? "text-debit" : "text-accent")}>
                        {m.delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {formatMoney(Math.abs(m.delta), base)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Plate>

            <Plate caption="Currency exposure" note="Across all accounts">
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
                      <div className="h-1.5 overflow-hidden rounded-full bg-page-edge">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${view.exposureTotal > 0 ? (e.base / view.exposureTotal) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Plate>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category breakdown (expandable bar rows) ─────────────────────────────────

function CategoryBreakdown({
  slices,
  months,
  kind,
  from,
  to,
  base,
  mode,
}: {
  slices: CategorySlice[];
  months: string[];
  kind: "expense" | "income";
  from: string;
  to: string;
  base: string;
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
          <li key={s.id} className={cn("rounded-[2px] transition-colors", isOpen && "bg-well")}>
            <button
              onClick={() => setOpen(isOpen ? null : s.id)}
              className="block w-full rounded-[2px] px-2 py-2 text-left transition-colors hover:bg-page-edge"
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
              <div className="ml-6 h-2 overflow-hidden rounded-full bg-page-edge">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
            </button>

            {isOpen && (
              <CategoryDetail
                slice={s}
                months={months}
                kind={kind}
                from={from}
                to={to}
                base={base}
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
  months,
  kind,
  from,
  to,
  base,
  mode,
}: {
  slice: CategorySlice;
  months: string[];
  kind: "expense" | "income";
  from: string;
  to: string;
  base: string;
  mode: CashflowMode;
}) {
  const ink = useLedgerInk();

  /**
   * Only this slice's entries, only over the period on screen.
   *
   * Drilling into a category genuinely wants rows — but it used to get them by
   * filtering a fetch of the entire ledger. `transaction_net` returns them with
   * their base-currency value already worked out, gross and net both.
   */
  const { data: rows = [] } = useCategoryEntries(
    slice.id === "uncategorised" ? null : slice.id,
    from,
    to,
    kind,
  );

  const catTxns = useMemo(
    () =>
      rows
        .map((r) => ({
          t: r,
          v: Number(mode === "gross" ? r.gross_base : r.net_base) || 0,
        }))
        // Fully repaid entries cost nothing — they don't belong in the list
        // or its count.
        .filter(({ v }) => !isNegligible(v))
        .sort((a, b) => b.v - a.v),
    [rows, mode],
  );

  const series = useMemo(
    () =>
      months.map((mk) => ({
        label: format(parseISO(`${mk}-01`), "MMM ''yy"),
        value: catTxns
          .filter(({ t }) => t.date.startsWith(mk))
          .reduce((s, { v }) => s + v, 0),
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
            <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgb(0 0 0 / 0.04)" }}
              {...tooltipStyle(ink)}
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
        <ul className="divide-y divide-rule">
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

interface BudgetDetailRow {
  id: string;
  name: string;
  color: string;
  spent: number;
  amount: number;
  catIds: Set<string>;
}

function BudgetsDetail({
  rows,
  from,
  to,
  base,
  mode,
}: {
  rows: BudgetDetailRow[];
  from: string;
  to: string;
  base: string;
  mode: CashflowMode;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="space-y-1">
      {rows.map((b) => (
        <BudgetDetailItem
          key={b.id}
          b={b}
          from={from}
          to={to}
          base={base}
          mode={mode}
          isOpen={open === b.id}
          onToggle={() => setOpen(open === b.id ? null : b.id)}
        />
      ))}
    </ul>
  );
}

/**
 * One budget row, with its own daily-spend query.
 *
 * A row apiece rather than one list-wide fetch because each budget covers its
 * own categories, and the crossing date is a property of that set. The series
 * only loads once the row is opened — a collapsed row shows figures it already
 * has.
 */
function BudgetDetailItem({
  b,
  from,
  to,
  base,
  mode,
  isOpen,
  onToggle,
}: {
  b: BudgetDetailRow;
  from: string;
  to: string;
  base: string;
  mode: CashflowMode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ink = useLedgerInk();
  const { data: daily = [] } = useDailySpend(
    isOpen ? from : "",
    isOpen ? to : "",
    [...b.catIds],
  );

  const series = useMemo(() => {
    let cum = 0;
    return [...daily]
      .sort((a, c) => a.day.localeCompare(c.day))
      .map((r) => {
        cum += mode === "gross" ? r.gross : r.net;
        return {
          date: r.day,
          label: format(parseISO(r.day), "d MMM"),
          cum: Math.max(0, cum),
        };
      });
  }, [daily, mode]);

  const ratio = b.amount > 0 ? b.spent / b.amount : 0;
  const over = b.spent > b.amount + 0.005;
  const crossed = over ? series.find((p) => p.cum > b.amount) : undefined;

  return (
    <li className={cn("rounded-[2px] transition-colors", isOpen && "bg-well")}>
      <button
        onClick={onToggle}
        className="block w-full rounded-[2px] px-2 py-2 text-left transition-colors hover:bg-page-edge"
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={cn("size-3.5 shrink-0 text-quill-faint transition-transform", !isOpen && "-rotate-90")}
            />
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="truncate text-quill">{b.name}</span>
          </span>
          <span className={cn("tnum shrink-0", over ? "text-debit" : "text-quill-soft")}>
            {formatMoney(b.spent, base)}
            <span className="text-quill-faint"> / {formatMoney(b.amount, base)}</span>
          </span>
        </div>
        <div className="ml-6 flex h-2 overflow-hidden rounded-full bg-page-edge">
          {over ? (
            <>
              <div className="h-full bg-head-3" style={{ width: `${(b.amount / b.spent) * 100}%` }} />
              <div className="h-full bg-debit" style={{ width: `${100 - (b.amount / b.spent) * 100}%` }} />
            </>
          ) : (
            <div
              className={cn("h-full rounded-full", ratio > 0.85 ? "bg-head-3" : "bg-accent")}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          )}
        </div>
        <p className={cn("tnum ml-6 mt-1 text-xs", over ? "text-debit" : "text-quill-faint")}>
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
                <CartesianGrid vertical={false} stroke={ink["--color-rule"]} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: ink["--color-quill-faint"], fontSize: 11 }} tickFormatter={(v) => compact(v, base)} domain={[0, (dataMax: number) => Math.max(dataMax, b.amount) * 1.1]} />
                <Tooltip
                  {...tooltipStyle(ink)}
                  formatter={(v: number) => [formatMoney(v, base), "Spent so far"]}
                />
                <ReferenceLine
                  y={b.amount}
                  stroke={ink["--color-debit"]}
                  strokeDasharray="5 4"
                  label={{ value: "Budget", position: "insideTopRight", fill: ink["--color-debit"], fontSize: 11 }}
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
}

// ─── shared bits ──────────────────────────────────────────────────────────────

/** Compact axis money (e.g. $1.2k) so the y-axis stays narrow. */
function compact(v: number, base: string): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return formatMoney(v, base).replace(/\.00$/, "");
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
  // A marginal note in the bookkeeper's hand, not a callout box.
  return (
    <aside className="settle border-l-2 border-brass/50 pl-3 text-sm italic text-quill-soft">
      {items.map((t, i) => (
        <p key={i} className={i > 0 ? "mt-1" : undefined}>
          {t}
        </p>
      ))}
    </aside>
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
  const ink = useLedgerInk();
  const toRight = payload.side === "in";
  const labelX = toRight ? x + width + 8 : x - 8;
  const anchor = toRight ? "start" : "end";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={payload.color} rx={2} fillOpacity={0.9} />
      <text x={labelX} y={y + height / 2 - 2} textAnchor={anchor} fill={ink["--color-quill"]} fontSize={12}>
        {payload.name}
      </text>
      <text x={labelX} y={y + height / 2 + 12} textAnchor={anchor} fill={ink["--color-quill-faint"]} fontSize={11} className="tnum">
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
      <div className="flex h-3 overflow-hidden rounded-full bg-page-edge">
        <div className="h-full bg-head-1/80" style={{ width: `${fixedPct}%` }} />
        <div className="h-full bg-head-3/80" style={{ width: `${100 - fixedPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-head-1">
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
          <p className="text-xs font-medium text-accent">
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


