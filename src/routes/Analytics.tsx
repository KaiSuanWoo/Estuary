import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { balancesByCurrency } from "@/lib/balances";
import { convert } from "@/lib/fx";
import {
  cashflowForRange,
  categoryMovers,
  merchantLeaderboard,
  monthlyCashflow,
  rangeBounds,
  spendingByCategory,
  type CashflowMode,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

const TOOLTIP_STYLE = {
  background: "#111a24",
  border: "1px solid #2b3947",
  borderRadius: 12,
  fontSize: 12,
  color: "#e9eef4",
} as const;

const RANGES = [3, 6, 12] as const;

interface Prefs {
  months: number;
  mode: CashflowMode;
}
const PREFS_KEY = "estuary.analytics";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        months: RANGES.includes(p.months as 3) ? (p.months as number) : 6,
        mode: p.mode === "gross" ? "gross" : "net",
      };
    }
  } catch {
    /* ignore */
  }
  return { months: 6, mode: "net" };
}

export function Analytics() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const { months, mode } = prefs;

  function patch(p: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const { data: txns = [], isLoading } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const base = useBaseCurrency();
  const rates = useRateMap();

  const view = useMemo(() => {
    const { from, to } = rangeBounds(months);
    const cf = cashflowForRange(txns, base, rates, from, to, mode);
    const trend = monthlyCashflow(txns, base, rates, months, undefined, mode).map(
      (p) => ({ ...p, net: p.income - p.expense }),
    );
    const cats = spendingByCategory(txns, categories, base, rates, from, to, mode);
    const merchants = merchantLeaderboard(txns, base, rates, from, to, mode, 8);
    const movers = categoryMovers(txns, categories, base, rates, undefined, mode, 5);

    // Currency exposure across all accounts, converted to base.
    const byCur = balancesByCurrency(accounts, txns);
    const exposure = Object.entries(byCur)
      .map(([currency, amount]) => ({
        currency,
        base: convert(Math.abs(amount), currency, base, rates) ?? 0,
      }))
      .filter((e) => e.base > 0)
      .sort((a, b) => b.base - a.base);
    const exposureTotal = exposure.reduce((s, e) => s + e.base, 0);

    const savingsRate = cf.income > 0 ? cf.net / cf.income : 0;
    return { cf, trend, cats, merchants, movers, exposure, exposureTotal, savingsRate };
  }, [txns, categories, accounts, base, rates, months, mode]);

  const hasData = txns.length > 0;
  const catTotal = view.cats.reduce((s, c) => s + c.value, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Analytics" />

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-ink-700/60 bg-ink-900/60 p-1">
          {RANGES.map((m) => (
            <button
              key={m}
              onClick={() => patch({ months: m })}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                months === m ? "bg-ink-700 text-ink-100" : "text-ink-500 hover:text-ink-300",
              )}
            >
              {m}m
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-ink-700/60 bg-ink-900/60 p-1">
          {(["gross", "net"] as CashflowMode[]).map((mo) => (
            <button
              key={mo}
              onClick={() => patch({ mode: mo })}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors",
                mode === mo ? "bg-ink-700 text-ink-100" : "text-ink-500 hover:text-ink-300",
              )}
            >
              {mo}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
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
            <Kpi
              label="Net"
              value={formatMoney(view.cf.net, base)}
              tone={view.cf.net >= 0 ? "up" : "down"}
            />
            <Kpi label="Savings rate" value={`${Math.round(view.savingsRate * 100)}%`} />
          </div>

          {/* Insights */}
          <Insights view={view} base={base} />

          {/* Trend */}
          <Widget title="Income, expense & net" hint={`Last ${months} months`}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={view.trend} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke="#1c2632" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6f8499", fontSize: 12 }} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: "#eef4fa" }}
                  labelStyle={{ color: "#eef4fa" }}
                  formatter={(v: number) => formatMoney(v, base)}
                />
                <Bar dataKey="income" name="Income" fill="#7fd1b9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="#fb7185" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#8aa6c4" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Widget>

          {/* Category share + merchants */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Spending by category" hint={`Last ${months} months`}>
              {view.cats.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-500">No spending in range.</p>
              ) : (
                <ul className="space-y-2.5">
                  {view.cats.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="truncate text-ink-200">{c.name}</span>
                        </span>
                        <span className="tnum shrink-0 text-ink-400">{formatMoney(c.value, base)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${catTotal > 0 ? (c.value / catTotal) * 100 : 0}%`,
                            backgroundColor: c.color,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>

            <Widget title="Top merchants" hint={`Last ${months} months`}>
              {view.merchants.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-500">No merchants in range.</p>
              ) : (
                <ul className="space-y-2">
                  {view.merchants.map((m, i) => (
                    <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="tnum w-4 shrink-0 text-right text-xs text-ink-600">{i + 1}</span>
                        <span className="truncate text-ink-200">{m.name}</span>
                        <span className="shrink-0 text-xs text-ink-600">×{m.count}</span>
                      </span>
                      <span className="tnum shrink-0 text-ink-400">{formatMoney(m.value, base)}</span>
                    </li>
                  ))}
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
                      <span
                        className={cn(
                          "tnum flex shrink-0 items-center gap-1 font-medium",
                          m.delta > 0 ? "text-rose-400" : "text-teal-400",
                        )}
                      >
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
                            {view.exposureTotal > 0
                              ? `${Math.round((e.base / view.exposureTotal) * 100)}%`
                              : ""}
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{
                            width: `${view.exposureTotal > 0 ? (e.base / view.exposureTotal) * 100 : 0}%`,
                          }}
                        />
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

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
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
  cats: { id: string; name: string; value: number; color: string }[];
  merchants: { name: string; value: number; count: number }[];
  movers: { name: string; color: string; delta: number }[];
  savingsRate: number;
}

function Insights({ view, base }: { view: AnalyticsView; base: string }) {
  const items: string[] = [];
  if (view.cats[0]) items.push(`Biggest category: ${view.cats[0].name} (${formatMoney(view.cats[0].value, base)}).`);
  if (view.merchants[0]) items.push(`Top merchant: ${view.merchants[0].name} (${formatMoney(view.merchants[0].value, base)}).`);
  if (view.movers[0]) {
    const m = view.movers[0];
    items.push(
      `${m.name} spending ${m.delta > 0 ? "up" : "down"} ${formatMoney(Math.abs(m.delta), base)} vs last month.`,
    );
  }
  items.push(
    view.savingsRate >= 0
      ? `You saved ${Math.round(view.savingsRate * 100)}% of income in range.`
      : `You spent more than you earned in range.`,
  );
  if (items.length === 0) return null;
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

function Widget({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
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
