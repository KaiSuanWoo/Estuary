import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, Pencil, Target, X } from "lucide-react";
import { useCategories, useUpdateCategory } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { spendingByCategory, monthBounds, monthLabel } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, EmptyState, Spinner } from "@/components/ui";
import type { Category } from "@/lib/types";

const inputCls =
  "h-9 w-28 rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

/** Bar colour by how much of the budget is used. */
function toneFor(ratio: number): { bar: string; text: string } {
  if (ratio > 1) return { bar: "bg-rose-500", text: "text-rose-400" };
  if (ratio > 0.85) return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-teal-500", text: "text-teal-300" };
}

export function Budgets() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: txns = [] } = useTransactions();
  const base = useBaseCurrency();
  const rates = useRateMap();
  const update = useUpdateCategory();

  const { from, to } = monthBounds();

  // This-month spend per category, rolled into the base currency.
  const spent = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spendingByCategory(txns, categories, base, rates, from, to, "net")) {
      m.set(s.id, s.value);
    }
    return m;
  }, [txns, categories, base, rates, from, to]);

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  );
  const budgeted = expenseCats.filter((c) => (c.monthly_budget ?? 0) > 0);
  const unbudgeted = expenseCats.filter((c) => !((c.monthly_budget ?? 0) > 0));

  const totalBudget = budgeted.reduce((s, c) => s + (c.monthly_budget ?? 0), 0);
  const totalSpent = budgeted.reduce((s, c) => s + (spent.get(c.id) ?? 0), 0);
  const overallRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(c: Category) {
    setEditing(c.id);
    setDraft(c.monthly_budget != null ? String(c.monthly_budget) : "");
  }
  function save(id: string) {
    const v = parseFloat(draft);
    update.mutate({ id, patch: { monthly_budget: isFinite(v) && v > 0 ? v : null } });
    setEditing(null);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-2">
        <Link
          to="/settings"
          className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:text-ink-200"
          aria-label="Back to settings"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            Budgets
          </h1>
          <p className="text-sm text-ink-400">
            Monthly spending limits · {monthLabel()}
          </p>
        </div>
      </header>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Overall summary */}
          {budgeted.length > 0 && (
            <Card>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-ink-400">Spent this month</p>
                  <p className="tnum mt-0.5 text-2xl font-semibold tracking-tight text-ink-50">
                    {formatMoney(totalSpent, base)}
                    <span className="text-base font-normal text-ink-500">
                      {" "}
                      / {formatMoney(totalBudget, base)}
                    </span>
                  </p>
                </div>
                <p
                  className={cn(
                    "tnum text-sm font-medium",
                    toneFor(overallRatio).text,
                  )}
                >
                  {formatMoney(Math.abs(totalBudget - totalSpent), base)}{" "}
                  {totalSpent > totalBudget ? "over" : "left"}
                </p>
              </div>
              <Bar ratio={overallRatio} />
            </Card>
          )}

          {/* Budgeted categories */}
          <section>
            <SectionLabel>Budgeted{budgeted.length > 0 && ` · ${budgeted.length}`}</SectionLabel>
            {budgeted.length === 0 ? (
              <EmptyState
                icon={<Target className="size-6" />}
                title="No budgets yet"
                hint="Set a monthly limit on a category below to start tracking."
              />
            ) : (
              <ul className="space-y-2">
                {budgeted.map((c) => (
                  <BudgetRow
                    key={c.id}
                    c={c}
                    spent={spent.get(c.id) ?? 0}
                    base={base}
                    editing={editing === c.id}
                    draft={draft}
                    onDraft={setDraft}
                    onStart={() => startEdit(c)}
                    onSave={() => save(c.id)}
                    onCancel={() => setEditing(null)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Categories without a budget */}
          {unbudgeted.length > 0 && (
            <section>
              <SectionLabel>Set a budget</SectionLabel>
              <ul className="space-y-2">
                {unbudgeted.map((c) => (
                  <BudgetRow
                    key={c.id}
                    c={c}
                    spent={spent.get(c.id) ?? 0}
                    base={base}
                    editing={editing === c.id}
                    draft={draft}
                    onDraft={setDraft}
                    onStart={() => startEdit(c)}
                    onSave={() => save(c.id)}
                    onCancel={() => setEditing(null)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
      {children}
    </h2>
  );
}

function Bar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800">
      <div
        className={cn("h-full rounded-full transition-all", toneFor(ratio).bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BudgetRow({
  c,
  spent,
  base,
  editing,
  draft,
  onDraft,
  onStart,
  onSave,
  onCancel,
}: {
  c: Category;
  spent: number;
  base: string;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const budget = c.monthly_budget ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave();
  }

  return (
    <li>
      <Card className="p-3.5">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={c.icon} color={c.color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">
            {c.name}
          </span>

          {editing ? (
            <form onSubmit={onSubmit} className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, "tnum")}
              />
              <button
                type="submit"
                aria-label="Save budget"
                className="flex size-8 items-center justify-center rounded-lg bg-teal-500 text-ink-950"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel"
                className="flex size-8 items-center justify-center rounded-lg bg-ink-800 text-ink-300"
              >
                <X className="size-4" />
              </button>
            </form>
          ) : budget > 0 ? (
            <button
              onClick={onStart}
              className="flex items-center gap-1.5 text-right"
            >
              <span className="tnum text-sm text-ink-300">
                {formatMoney(spent, base)}
                <span className="text-ink-600"> / {formatMoney(budget, base)}</span>
              </span>
              <Pencil className="size-3.5 text-ink-500" />
            </button>
          ) : (
            <button
              onClick={onStart}
              className="rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-medium text-ink-300 hover:border-ink-600"
            >
              Set budget
            </button>
          )}
        </div>

        {budget > 0 && !editing && <Bar ratio={ratio} />}
      </Card>
    </li>
  );
}
