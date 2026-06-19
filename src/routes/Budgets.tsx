import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { ChevronLeft, Plus, Target, Trash2 } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import {
  useBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useBudgetLinks,
  useSetBudgetCategories,
} from "@/hooks/useBudgets";
import { spendForBudget, groupLinks, periodLabel } from "@/lib/budgets";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import type {
  Budget,
  BudgetDirection,
  BudgetPeriod,
  Category,
} from "@/lib/types";

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

/**
 * Bar/text colour by progress. An expense budget counts *down* (over = bad, red);
 * a saving budget counts *up* (reaching the target = good, never red).
 */
function toneFor(ratio: number, saving: boolean): { bar: string; text: string } {
  if (saving)
    return ratio >= 1
      ? { bar: "bg-emerald-500", text: "text-emerald-400" }
      : { bar: "bg-teal-500", text: "text-teal-300" };
  if (ratio > 1) return { bar: "bg-rose-500", text: "text-rose-400" };
  if (ratio > 0.85) return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-teal-500", text: "text-teal-300" };
}

export function Budgets() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();
  const { data: links = [] } = useBudgetLinks();
  const reimbursed = useReimbursedAmountMap();
  const base = useBaseCurrency();
  const rates = useRateMap();

  const [sheet, setSheet] = useState<Budget | "new" | null>(null);

  const linksByBudget = useMemo(() => groupLinks(links), [links]);
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const spending = budgets.filter((b) => b.direction !== "saving");
  const savings = budgets.filter((b) => b.direction === "saving");

  function rowFor(b: Budget) {
    const catIds = linksByBudget.get(b.id) ?? new Set<string>();
    const spent = spendForBudget(b, catIds, txns, base, rates, reimbursed);
    const names = [...catIds]
      .map((id) => catById.get(id)?.name)
      .filter(Boolean) as string[];
    return (
      <li key={b.id}>
        <button onClick={() => setSheet(b)} className="block w-full text-left">
          <BudgetRow budget={b} spent={spent} catNames={names} base={base} />
        </button>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4 flex items-center gap-2">
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
            Group categories into budgets you track
          </p>
        </div>
      </header>

      {/* Prominent add button */}
      <button
        onClick={() => setSheet("new")}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-medium text-ink-300 transition-colors hover:border-teal-500/60 hover:text-teal-300"
      >
        <Plus className="size-4" /> New budget
      </button>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={<Target className="size-6" />}
          title="No budgets yet"
          hint="Create a budget (e.g. “Japan trip” or “Monthly food”), then assign your spending categories to it."
        />
      ) : (
        <div className="space-y-5">
          {spending.length > 0 && (
            <section>
              <SectionLabel>Spending</SectionLabel>
              <ul className="space-y-2">{spending.map(rowFor)}</ul>
            </section>
          )}
          {savings.length > 0 && (
            <section>
              <SectionLabel>Savings</SectionLabel>
              <ul className="space-y-2">{savings.map(rowFor)}</ul>
            </section>
          )}
        </div>
      )}

      {sheet && (
        <BudgetSheet
          budget={sheet}
          categories={categories}
          assigned={
            sheet === "new"
              ? new Set<string>()
              : linksByBudget.get(sheet.id) ?? new Set<string>()
          }
          onClose={() => setSheet(null)}
        />
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

function Bar({ ratio, saving }: { ratio: number; saving: boolean }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          toneFor(ratio, saving).bar,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BudgetRow({
  budget: b,
  spent,
  catNames,
  base,
}: {
  budget: Budget;
  spent: number;
  catNames: string[];
  base: string;
}) {
  const saving = b.direction === "saving";
  const ratio = b.amount > 0 ? spent / b.amount : 0;
  const remaining = b.amount - spent;
  const daysLeft =
    b.period === "custom" && b.end_date
      ? differenceInCalendarDays(new Date(b.end_date), new Date())
      : null;

  const cats =
    catNames.length === 0
      ? "No categories yet"
      : catNames.length <= 2
        ? catNames.join(" · ")
        : `${catNames.slice(0, 2).join(" · ")} +${catNames.length - 2}`;

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-100">{b.name}</p>
          <p className="truncate text-xs text-ink-500">
            <span className="text-ink-400">{periodLabel(b)}</span> · {cats}
            {daysLeft != null &&
              (daysLeft >= 0 ? ` · ${daysLeft}d left` : " · ended")}
          </p>
        </div>
        <span
          className={cn(
            "tnum shrink-0 text-sm font-medium",
            toneFor(ratio, saving).text,
          )}
        >
          {formatMoney(spent, base)}
          <span className="text-ink-600"> / {formatMoney(b.amount, base)}</span>
        </span>
      </div>
      <Bar ratio={ratio} saving={saving} />
      <p
        className={cn(
          "tnum mt-1.5 text-right text-xs font-medium",
          toneFor(ratio, saving).text,
        )}
      >
        {saving
          ? remaining > 0
            ? `${formatMoney(remaining, base)} to go`
            : "Target reached"
          : remaining >= 0
            ? `${formatMoney(remaining, base)} left`
            : `${formatMoney(-remaining, base)} over`}
      </p>
    </Card>
  );
}

// ─── Create / edit sheet ──────────────────────────────────────────────────────

function BudgetSheet({
  budget,
  categories,
  assigned,
  onClose,
}: {
  budget: Budget | "new";
  categories: Category[];
  assigned: Set<string>;
  onClose: () => void;
}) {
  const isNew = budget === "new";
  const existing = isNew ? null : budget;
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const del = useDeleteBudget();
  const setCats = useSetBudgetCategories();

  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [direction, setDirection] = useState<BudgetDirection>(
    existing?.direction ?? "expense",
  );
  const [period, setPeriod] = useState<BudgetPeriod>(existing?.period ?? "monthly");
  const [start, setStart] = useState(existing?.start_date ?? "");
  const [end, setEnd] = useState(existing?.end_date ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set(assigned));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const saving = direction === "saving";
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const pending = create.isPending || update.isPending || setCats.isPending;
  const field =
    "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      amount: Number(amount) || 0,
      direction,
      period,
      start_date: period === "custom" ? start || null : null,
      end_date: period === "custom" ? end || null : null,
    };
    if (!payload.name || !(payload.amount > 0)) return;
    if (period === "custom" && start && end && end < start) {
      setDateError("End date must be on or after the start date.");
      return;
    }
    setDateError(null);
    try {
      const id = isNew
        ? (await create.mutateAsync(payload)).id
        : (await update.mutateAsync({ id: existing!.id, patch: payload }),
          existing!.id);
      await setCats.mutateAsync({ budgetId: id, categoryIds: [...picked] });
      onClose();
    } catch {
      // surfaced via the mutation isError flags below
    }
  }

  async function onDelete() {
    if (existing) await del.mutateAsync(existing.id);
    onClose();
  }

  return (
    <Sheet title={isNew ? "New budget" : "Edit budget"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Name</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Japan trip"
            className={field}
          />
        </label>

        {/* Direction: expense (down) vs saving (up) */}
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-400">Type</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "expense", label: "Expense", hint: "Counts down" },
                { value: "saving", label: "Saving", hint: "Counts up" },
              ] as { value: BudgetDirection; label: string; hint: string }[]
            ).map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDirection(d.value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  direction === d.value
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-ink-700 hover:border-ink-600",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-medium",
                    direction === d.value ? "text-teal-300" : "text-ink-200",
                  )}
                >
                  {d.label}
                </span>
                <span className="block text-xs text-ink-500">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time frame */}
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-400">
            Time frame
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "h-9 rounded-xl border text-xs font-medium transition-colors",
                  period === p.value
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-ink-700 text-ink-400 hover:border-ink-600",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === "custom" && (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-400">
                  Start
                </span>
                <input
                  type="date"
                  value={start}
                  max={end || undefined}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setDateError(null);
                  }}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-400">
                  End
                </span>
                <input
                  type="date"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setDateError(null);
                  }}
                  className={field}
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-600">
              Leave a date empty for an open-ended range.
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">
            {saving ? "Target amount" : "Budget amount"}
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={cn(field, "tnum")}
          />
        </label>

        {/* Category assignment */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-400">
            Categories ({picked.size} selected)
          </span>
          {expenseCats.length === 0 ? (
            <p className="text-xs text-ink-500">
              Add some expense categories first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {expenseCats.map((c) => {
                const on = picked.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-teal-500 bg-teal-500/15 text-teal-300"
                        : "border-ink-700 text-ink-400 hover:border-ink-600",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color ?? "#6f8499" }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {dateError && <p className="text-xs text-red-400">{dateError}</p>}
        {(create.isError || update.isError || setCats.isError) && (
          <p className="text-xs text-red-400">Couldn't save — please try again.</p>
        )}

        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={!name.trim() || !(Number(amount) > 0) || pending}
        >
          {pending ? "Saving…" : isNew ? "Create budget" : "Save changes"}
        </Button>
      </form>

      {!isNew && (
        <div className="mt-3 border-t border-ink-800 pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">Delete this budget?</p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-ink-400 hover:text-ink-200"
              >
                Cancel
              </button>
              <Button variant="danger" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 text-xs text-ink-500 transition-colors hover:text-red-400"
            >
              <Trash2 className="size-3.5" /> Delete budget
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
