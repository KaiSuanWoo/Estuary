import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Check, ChevronLeft, Plus, Search, Target, Trash2 } from "lucide-react";
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
  useBudgetTransactionLinks,
  useSetBudgetTransactions,
} from "@/hooks/useBudgets";
import {
  spendForBudget,
  goalFunding,
  groupLinks,
  groupTxnLinks,
  periodLabel,
  type GoalFunding,
} from "@/lib/budgets";
import type { RateMap } from "@/lib/fx";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import type {
  Budget,
  BudgetDirection,
  BudgetPeriod,
  BudgetType,
  Category,
  Transaction,
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
  const { data: txnLinks = [] } = useBudgetTransactionLinks();
  const reimbursed = useReimbursedAmountMap();
  const base = useBaseCurrency();
  const rates = useRateMap();

  const [sheet, setSheet] = useState<Budget | "new" | null>(null);

  const linksByBudget = useMemo(() => groupLinks(links), [links]);
  const txnsByBudget = useMemo(() => groupTxnLinks(txnLinks), [txnLinks]);
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const recurring = budgets.filter((b) => b.type !== "goal");
  const spending = recurring.filter((b) => b.direction !== "saving");
  const savings = recurring.filter((b) => b.direction === "saving");
  const goals = budgets.filter((b) => b.type === "goal");

  function recurringRow(b: Budget) {
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

  function goalRow(b: Budget) {
    const ids = txnsByBudget.get(b.id) ?? new Set<string>();
    const funding = goalFunding(b, ids, txns, base, rates, reimbursed);
    return (
      <li key={b.id}>
        <button onClick={() => setSheet(b)} className="block w-full text-left">
          <GoalRow budget={b} funding={funding} count={ids.size} base={base} />
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
            Recurring limits and one-time goals
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
          hint="Create a recurring limit (e.g. “Monthly food”) or a one-time goal (e.g. “Hokkaido 2026”)."
        />
      ) : (
        <div className="space-y-5">
          {spending.length > 0 && (
            <section>
              <SectionLabel>Spending</SectionLabel>
              <ul className="space-y-2">{spending.map(recurringRow)}</ul>
            </section>
          )}
          {savings.length > 0 && (
            <section>
              <SectionLabel>Savings</SectionLabel>
              <ul className="space-y-2">{savings.map(recurringRow)}</ul>
            </section>
          )}
          {goals.length > 0 && (
            <section>
              <SectionLabel>Goals</SectionLabel>
              <ul className="space-y-2">{goals.map(goalRow)}</ul>
            </section>
          )}
        </div>
      )}

      {sheet && (
        <BudgetSheet
          budget={sheet}
          categories={categories}
          txns={txns}
          base={base}
          rates={rates}
          reimbursed={reimbursed}
          assignedCats={
            sheet === "new"
              ? new Set<string>()
              : linksByBudget.get(sheet.id) ?? new Set<string>()
          }
          assignedTxns={
            sheet === "new"
              ? new Set<string>()
              : txnsByBudget.get(sheet.id) ?? new Set<string>()
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

/** Two-segment bar: spent first, then saved, both toward the target. */
function StackedBar({
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
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-800">
      <div className="h-full bg-teal-600 transition-all" style={{ width: `${spentPct}%` }} />
      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${savedPct}%` }} />
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

function goalDateLabel(b: Budget, daysLeft: number | null): string {
  if (!b.due_date) return "No deadline";
  const d = format(parseISO(b.due_date), "d MMM yyyy");
  if (daysLeft == null) return `Fund by ${d}`;
  if (daysLeft < 0) return `Overdue · was ${d}`;
  if (daysLeft === 0) return `Due today · ${d}`;
  return `Fund by ${d} · ${daysLeft}d left`;
}

function GoalRow({
  budget: b,
  funding,
  count,
  base,
}: {
  budget: Budget;
  funding: GoalFunding;
  count: number;
  base: string;
}) {
  const { spent, saved, funded, remaining, daysLeft, perWeek } = funding;
  const over = funded > b.amount + 0.005;

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-100">{b.name}</p>
          <p className="truncate text-xs text-ink-500">{goalDateLabel(b, daysLeft)}</p>
        </div>
        <span className="tnum shrink-0 text-sm font-medium text-emerald-400">
          {formatMoney(funded, base)}
          <span className="text-ink-600"> / {formatMoney(b.amount, base)}</span>
        </span>
      </div>

      <StackedBar spent={spent} saved={saved} target={b.amount} />

      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="tnum text-ink-500">
          {count === 0 ? (
            "No transactions yet"
          ) : (
            <>
              <span className="text-teal-300">{formatMoney(spent, base)} spent</span>
              {" · "}
              <span className="text-emerald-400">{formatMoney(saved, base)} saved</span>
            </>
          )}
        </span>
        <span className="tnum font-medium text-ink-300">
          {remaining > 0
            ? `${formatMoney(remaining, base)} to save`
            : over
              ? `${formatMoney(funded - b.amount, base)} over`
              : "Fully funded"}
        </span>
      </div>

      {perWeek != null && (
        <p className="mt-1 text-right text-xs text-ink-500">
          ~{formatMoney(perWeek, base)}/wk to stay on track
        </p>
      )}
    </Card>
  );
}

// ─── Create / edit sheet ──────────────────────────────────────────────────────

function BudgetSheet({
  budget,
  categories,
  txns,
  base,
  rates,
  reimbursed,
  assignedCats,
  assignedTxns,
  onClose,
}: {
  budget: Budget | "new";
  categories: Category[];
  txns: Transaction[];
  base: string;
  rates: RateMap;
  reimbursed: Map<string, number>;
  assignedCats: Set<string>;
  assignedTxns: Set<string>;
  onClose: () => void;
}) {
  const isNew = budget === "new";
  const existing = isNew ? null : budget;
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const del = useDeleteBudget();
  const setCats = useSetBudgetCategories();
  const setTxns = useSetBudgetTransactions();

  const [btype, setBtype] = useState<BudgetType>(existing?.type ?? "recurring");
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [direction, setDirection] = useState<BudgetDirection>(
    existing?.direction ?? "expense",
  );
  const [period, setPeriod] = useState<BudgetPeriod>(existing?.period ?? "monthly");
  const [start, setStart] = useState(existing?.start_date ?? "");
  const [end, setEnd] = useState(existing?.end_date ?? "");
  const [due, setDue] = useState(existing?.due_date ?? "");
  const [pickedCats, setPickedCats] = useState<Set<string>>(new Set(assignedCats));
  const [pickedTxns, setPickedTxns] = useState<Set<string>>(new Set(assignedTxns));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const isGoal = btype === "goal";
  const saving = direction === "saving";
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const pending =
    create.isPending || update.isPending || setCats.isPending || setTxns.isPending;
  const field =
    "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

  // Live funding preview for goals
  const preview = useMemo(
    () =>
      goalFunding(
        { amount: Number(amount) || 0, due_date: due || null } as Budget,
        pickedTxns,
        txns,
        base,
        rates,
        reimbursed,
      ),
    [amount, due, pickedTxns, txns, base, rates, reimbursed],
  );

  function toggleCat(id: string) {
    setPickedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleTxn(id: string) {
    setPickedTxns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !(Number(amount) > 0)) return;
    if (!isGoal && period === "custom" && start && end && end < start) {
      setDateError("End date must be on or after the start date.");
      return;
    }
    setDateError(null);
    const payload = {
      name: name.trim(),
      amount: Number(amount) || 0,
      type: btype,
      direction: isGoal ? "saving" : direction,
      period: isGoal ? "custom" : period,
      start_date: !isGoal && period === "custom" ? start || null : null,
      end_date: !isGoal && period === "custom" ? end || null : null,
      due_date: isGoal ? due || null : null,
    } as const;
    try {
      const id = isNew
        ? (await create.mutateAsync(payload)).id
        : (await update.mutateAsync({ id: existing!.id, patch: payload }),
          existing!.id);
      if (isGoal) {
        await setTxns.mutateAsync({ budgetId: id, transactionIds: [...pickedTxns] });
      } else {
        await setCats.mutateAsync({ budgetId: id, categoryIds: [...pickedCats] });
      }
      onClose();
    } catch {
      // surfaced via the mutation isError flags below
    }
  }

  async function onDelete() {
    if (existing) await del.mutateAsync(existing.id);
    onClose();
  }

  const anyError =
    create.isError || update.isError || setCats.isError || setTxns.isError;

  return (
    <Sheet title={isNew ? "New budget" : "Edit budget"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Budget type: recurring vs one-time goal */}
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-400">
            Budget type
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "recurring", label: "Recurring", hint: "Resets each period" },
                { value: "goal", label: "One-time goal", hint: "Fund a target" },
              ] as { value: BudgetType; label: string; hint: string }[]
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setBtype(t.value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  btype === t.value
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-ink-700 hover:border-ink-600",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-medium",
                    btype === t.value ? "text-teal-300" : "text-ink-200",
                  )}
                >
                  {t.label}
                </span>
                <span className="block text-xs text-ink-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isGoal ? "e.g. Hokkaido 2026" : "e.g. Monthly food"}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">
            {isGoal ? "Target amount" : saving ? "Target amount" : "Budget amount"}
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

        {isGoal ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">
                Fund by <span className="text-ink-600">(optional)</span>
              </span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className={field}
              />
            </label>

            {/* Transaction assignment */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium text-ink-400">
                  Transactions ({pickedTxns.size})
                </span>
                <span className="tnum text-xs text-ink-500">
                  <span className="text-teal-300">
                    {formatMoney(preview.spent, base)} spent
                  </span>
                  {" · "}
                  <span className="text-emerald-400">
                    {formatMoney(preview.saved, base)} saved
                  </span>
                </span>
              </div>
              <TransactionPicker
                txns={txns}
                picked={pickedTxns}
                onToggle={toggleTxn}
                base={base}
              />
              <p className="mt-1 text-xs text-ink-600">
                Expenses count as spent; transfers &amp; income count as saved.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Direction: expense (down) vs saving (up) */}
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-400">
                Direction
              </span>
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

            {/* Category assignment */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-400">
                Categories ({pickedCats.size} selected)
              </span>
              {expenseCats.length === 0 ? (
                <p className="text-xs text-ink-500">
                  Add some expense categories first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {expenseCats.map((c) => {
                    const on = pickedCats.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCat(c.id)}
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
          </>
        )}

        {dateError && <p className="text-xs text-red-400">{dateError}</p>}
        {anyError && (
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

/** Searchable, checkable list of transactions to fund a goal with. */
function TransactionPicker({
  txns,
  picked,
  onToggle,
  base,
}: {
  txns: Transaction[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  base: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Selected first, then the rest (newest-first as returned), capped.
    const match = (t: Transaction) =>
      !term ||
      (t.merchant ?? "").toLowerCase().includes(term) ||
      (t.notes ?? "").toLowerCase().includes(term);
    const sel = txns.filter((t) => picked.has(t.id));
    const rest = txns.filter((t) => !picked.has(t.id) && match(t));
    return [...sel.filter(match), ...rest].slice(0, 60);
  }, [txns, q, picked]);

  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-950/30">
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
        <Search className="size-3.5 shrink-0 text-ink-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transactions…"
          className="w-full bg-transparent text-sm text-ink-50 placeholder:text-ink-600 focus:outline-none"
        />
      </div>
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-500">
            {txns.length === 0 ? "No transactions yet." : "No matches."}
          </p>
        ) : (
          <ul className="divide-y divide-ink-800/70">
            {filtered.map((t) => {
              const on = picked.has(t.id);
              const isExpense = t.type === "expense";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(t.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-800/40"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on
                          ? "border-teal-500 bg-teal-500 text-ink-950"
                          : "border-ink-600",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-200">
                        {t.merchant || (isExpense ? "Expense" : "Transaction")}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {format(parseISO(t.date), "d MMM yyyy")} ·{" "}
                        {isExpense ? "spent" : "saved"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tnum shrink-0 text-xs font-medium",
                        isExpense ? "text-ink-300" : "text-emerald-400",
                      )}
                    >
                      {formatSignedMoney(t.amount, t.currency, t.type)}
                      {t.currency !== base && (
                        <span className="ml-1 text-ink-600">{t.currency}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
