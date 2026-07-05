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
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useBudgets, useBudgetLinks } from "@/hooks/useBudgets";
import { groupLinks } from "@/lib/budgets";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { balancesByCurrency } from "@/lib/balances";
import { convert } from "@/lib/fx";
import {
  breakdownByCategory,
  cashflowForRange,
  categoryMovers,
  merchantLeaderboard,
  monthsBetween,
  rangeBounds,
  stackedCategoryByMonth,
  type CashflowMode,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { HoverDonut } from "@/components/HoverDonut";

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

/** Last 18 months as yyyy-MM, newest first — the month multi-select source. */
function recentMonths(now = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < 18; i++) {
    const d = subMonths(now, i);
    out.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM ''yy") });
  }
  return out;
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
  const base = useBaseCurrency();
  const rates = useRateMap();

  // Resolve the active period → ISO bounds, the month list, an in-scope test.
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
    const cf = cashflowForRange(scoped, base, rates, WIDE.from, WIDE.to, txnMode);
    const expenseCats = breakdownByCategory(scoped, categories, base, rates, WIDE.from, WIDE.to, "expense", txnMode);
    const incomeCats = breakdownByCategory(scoped, categories, base, rates, WIDE.from, WIDE.to, "income", txnMode);
    const merchants = merchantLeaderboard(scoped, base, rates, WIDE.from, WIDE.to, txnMode, 8);
    const movers = categoryMovers(txns, categories, base, rates, undefined, txnMode, 5);
    const stacked = stackedCategoryByMonth(scoped, categories, base, rates, period.months, txnMode, 6);

    // Currency exposure across all accounts (portfolio-wide, not period-scoped).
    const byCur = balancesByCurrency(accounts, txns);
    const exposure = Object.entries(byCur)
      .map(([currency, amount]) => ({
        currency,
        base: convert(Math.abs(amount), currency, base, rates) ?? 0,
      }))
      .filter((e) => e.base > 0)
      .sort((a, b) => b.base - a.base);
    const exposureTotal = exposure.reduce((s, e) => s + e.base, 0);

    // Budgets — only meaningful for a single month (monthly amounts).
    let budgetRows: { id: string; name: string; color: string; spent: number; amount: number }[] = [];
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
              spent += (convert(t.amount, t.currency, base, rates) ?? t.amount) - (reimbursedMap.get(t.id) ?? 0);
            else if (t.type === "income")
              spent -= convert(t.amount, t.currency, base, rates) ?? t.amount;
          }
          return { id: b.id, name: b.name, color: b.color ?? "#4d6175", spent: Math.max(0, spent), amount: b.amount };
        });
    }

    const savingsRate = cf.income > 0 ? cf.net / cf.income : 0;
    return { cf, expenseCats, incomeCats, merchants, movers, stacked, exposure, exposureTotal, budgetRows, savingsRate };
  }, [txns, categories, accounts, budgets, budgetLinks, reimbursedMap, base, rates, txnMode, period]);

  const months = useMemo(() => recentMonths(), []);

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
          <div className="flex items-center gap-1 rounded-xl border border-ink-700/60 bg-ink-950/50 p-1">
            {(["range", "months"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                  mode === m ? "bg-ink-700 text-ink-100" : "text-ink-500 hover:text-ink-300",
                )}
              >
                {m === "range" ? "Range" : "Pick months"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-ink-700/60 bg-ink-950/50 p-1">
            {(["gross", "net"] as CashflowMode[]).map((mo) => (
              <button
                key={mo}
                onClick={() => setTxnMode(mo)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                  txnMode === mo ? "bg-ink-700 text-ink-100" : "text-ink-500 hover:text-ink-300",
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
                      : "border-ink-700 text-ink-400 hover:border-ink-600",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-400">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 focus:border-teal-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-400">To</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 focus:border-teal-500 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {months.map((m) => {
              const on = selectedMonths.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMonth(m.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-teal-500 bg-teal-500/15 text-teal-300"
                      : "border-ink-700 text-ink-400 hover:border-ink-600",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-ink-500">
          Showing <span className="text-ink-300">{period.label}</span>
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

          {/* MAIN combined chart: stacked spend by category + income & net lines */}
          <Widget
            title="Spending composition vs income"
            hint="Stacked category spend per month, with income and net overlaid"
          >
            {view.stacked.data.length === 0 ? (
              <ChartEmpty label="No months in range" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={view.stacked.data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="#1c2632" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#6f8499", fontSize: 11 }} tickFormatter={(v) => compact(v, base)} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#eef4fa" }}
                    labelStyle={{ color: "#eef4fa" }}
                    formatter={(v: number, n: string) => [formatMoney(v, base), n]}
                  />
                  {view.stacked.keys.map((k) => (
                    <Bar key={k.name} dataKey={k.name} stackId="spend" fill={k.color} radius={[0, 0, 0, 0]} />
                  ))}
                  <Line type="monotone" dataKey="income" name="Income" stroke="#7fd1b9" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#e0a458" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <Legend keys={view.stacked.keys} extra={[{ name: "Income", color: "#7fd1b9" }, { name: "Net", color: "#e0a458" }]} />
          </Widget>

          {/* Income & expense breakdowns */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Where money went" hint="Expenses by category">
              {view.expenseCats.length === 0 ? (
                <ChartEmpty label="No spending in range" />
              ) : (
                <HoverDonut slices={view.expenseCats} base={base} centerLabel="Spent" />
              )}
            </Widget>
            <Widget title="Where money came from" hint="Income by category">
              {view.incomeCats.length === 0 ? (
                <ChartEmpty label="No income in range" />
              ) : (
                <HoverDonut slices={view.incomeCats} base={base} centerLabel="Earned" />
              )}
            </Widget>
          </div>

          {/* Merchants + budgets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Top merchants" hint="By spend in range">
              {view.merchants.length === 0 ? (
                <ChartEmpty label="No merchants in range" />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, view.merchants.length * 34)}>
                  <BarChart data={view.merchants} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={92} tickLine={false} axisLine={false} tick={{ fill: "#9fb0c0", fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => formatMoney(v, base)}
                    />
                    <Bar dataKey="value" fill="#3f72af" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Widget>

            <Widget
              title="Budgets"
              hint={period.months.length === 1 ? period.label : "Select a single month to see budgets"}
            >
              {period.months.length !== 1 ? (
                <p className="py-6 text-center text-sm text-ink-500">
                  Budgets are monthly — pick one month to see them.
                </p>
              ) : view.budgetRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-500">No spending budgets set.</p>
              ) : (
                <ul className="space-y-2.5">
                  {view.budgetRows.map((b) => {
                    const ratio = b.amount > 0 ? b.spent / b.amount : 0;
                    const over = b.spent > b.amount;
                    return (
                      <li key={b.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                            <span className="truncate text-ink-200">{b.name}</span>
                          </span>
                          <span className={cn("tnum shrink-0", over ? "text-rose-400" : "text-ink-400")}>
                            {formatMoney(b.spent, base)}
                            <span className="text-ink-600"> / {formatMoney(b.amount, base)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                          <div
                            className={cn("h-full rounded-full", over ? "bg-rose-500" : ratio > 0.85 ? "bg-amber-500" : "bg-teal-500")}
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Widget>
          </div>

          {/* Movers + currency exposure */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Month-on-month movers" hint="This month vs last">
              {view.movers.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-500">No change to report.</p>
              ) : (
                <ul className="space-y-2">
                  {view.movers.map((m) => (
                    <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="truncate text-ink-200">{m.name}</span>
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
                <p className="py-6 text-center text-sm text-ink-500">No balances to show.</p>
              ) : (
                <ul className="space-y-2.5">
                  {view.exposure.map((e) => (
                    <li key={e.currency}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="text-ink-200">{e.currency}</span>
                        <span className="tnum text-ink-400">
                          {formatMoney(e.base, base)}
                          <span className="ml-1 text-ink-600">
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
      <p className="truncate text-xs font-medium text-ink-400">{label}</p>
      <p
        className={cn(
          "tnum mt-1 break-words font-semibold leading-tight tracking-tight",
          size,
          tone === "up" ? "text-teal-400" : tone === "down" ? "text-rose-400" : "text-ink-100",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

interface AnalyticsView {
  cf: { income: number; expense: number; net: number };
  expenseCats: { id: string; name: string; value: number; color: string }[];
  merchants: { name: string; value: number; count: number }[];
  movers: { name: string; color: string; delta: number }[];
  savingsRate: number;
}

function Insights({ view, base }: { view: AnalyticsView; base: string }) {
  const items: string[] = [];
  if (view.expenseCats[0]) items.push(`Biggest expense: ${view.expenseCats[0].name} (${formatMoney(view.expenseCats[0].value, base)}).`);
  if (view.merchants[0]) items.push(`Top merchant: ${view.merchants[0].name} (${formatMoney(view.merchants[0].value, base)}).`);
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
      <p className="text-sm font-semibold text-ink-200">Insights</p>
      <ul className="space-y-1 text-sm text-ink-400">
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

function Legend({
  keys,
  extra = [],
}: {
  keys: { name: string; color: string }[];
  extra?: { name: string; color: string }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {[...keys, ...extra].map((k) => (
        <span key={k.name} className="flex items-center gap-1.5 text-xs text-ink-400">
          <span className="size-2 rounded-full" style={{ backgroundColor: k.color }} />
          {k.name}
        </span>
      ))}
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

function Widget({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink-200">{title}</h2>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}
