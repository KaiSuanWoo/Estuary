import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { Check, ChevronLeft, Pencil, Plane, Plus, Target, Trash2, X } from "lucide-react";
import { useCategories, useUpdateCategory } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import {
  useBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@/hooks/useBudgets";
import { useTags, useAllTransactionTags } from "@/hooks/useTags";
import { spendingByCategory, monthBounds, monthLabel } from "@/lib/analytics";
import { convert } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/CategoryIcon";
import { TagPicker } from "@/components/TagPicker";
import { Button, Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import type { Budget, Category } from "@/lib/types";

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

  // ── Goal / envelope budgets (tag-scoped) ──────────────────────────────────
  const { data: budgets = [] } = useBudgets();
  const { data: tags = [] } = useTags();
  const { data: txTags = [] } = useAllTransactionTags();
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const tagTxns = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const tt of txTags) {
      let s = m.get(tt.tag_id);
      if (!s) {
        s = new Set();
        m.set(tt.tag_id, s);
      }
      s.add(tt.transaction_id);
    }
    return m;
  }, [txTags]);
  const txnById = useMemo(() => new Map(txns.map((t) => [t.id, t])), [txns]);

  function goalSpent(b: Budget): number {
    if (!b.tag_id) return 0;
    const ids = tagTxns.get(b.tag_id);
    if (!ids) return 0;
    let total = 0;
    for (const id of ids) {
      const t = txnById.get(id);
      if (!t || t.type !== "expense") continue;
      if (b.start_date && t.date < b.start_date) continue;
      if (b.end_date && t.date > b.end_date) continue;
      total += convert(t.amount, t.currency, base, rates) ?? t.amount;
    }
    return total;
  }

  const [goalSheet, setGoalSheet] = useState<Budget | "new" | null>(null);

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
            Goals & monthly limits · {monthLabel()}
          </p>
        </div>
      </header>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Goals / envelopes (tag-scoped, e.g. a vacation) */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Goals</SectionLabel>
              <button
                onClick={() => setGoalSheet("new")}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-400 hover:text-teal-300"
              >
                <Plus className="size-3.5" /> New goal
              </button>
            </div>
            {budgets.length === 0 ? (
              <EmptyState
                icon={<Plane className="size-6" />}
                title="No goals yet"
                hint="Create a goal (e.g. a vacation), then tag transactions to track spend against it."
              />
            ) : (
              <ul className="space-y-2">
                {budgets.map((b) => {
                  const sp = goalSpent(b);
                  const ratio = b.amount > 0 ? sp / b.amount : 0;
                  const daysLeft = b.end_date
                    ? differenceInCalendarDays(new Date(b.end_date), new Date())
                    : null;
                  return (
                    <li key={b.id}>
                      <button
                        onClick={() => setGoalSheet(b)}
                        className="block w-full text-left"
                      >
                        <Card className="p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink-100">
                                {b.name}
                              </p>
                              <p className="text-xs text-ink-500">
                                {b.tag_id
                                  ? `#${tagName.get(b.tag_id) ?? "tag"}`
                                  : "no tag"}
                                {daysLeft != null &&
                                  (daysLeft >= 0
                                    ? ` · ${daysLeft}d left`
                                    : " · ended")}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "tnum shrink-0 text-sm font-medium",
                                toneFor(ratio).text,
                              )}
                            >
                              {formatMoney(sp, base)}
                              <span className="text-ink-600">
                                {" "}
                                / {formatMoney(b.amount, base)}
                              </span>
                            </span>
                          </div>
                          <Bar ratio={ratio} />
                        </Card>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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

      {goalSheet && (
        <GoalSheet
          goal={goalSheet}
          onClose={() => setGoalSheet(null)}
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

function GoalSheet({
  goal,
  onClose,
}: {
  goal: Budget | "new";
  onClose: () => void;
}) {
  const isNew = goal === "new";
  const existing = isNew ? null : goal;
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const del = useDeleteBudget();

  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [tag, setTag] = useState<string>(existing?.tag_id ?? "");
  const [start, setStart] = useState(existing?.start_date ?? "");
  const [end, setEnd] = useState(existing?.end_date ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pending = create.isPending || update.isPending;
  const field =
    "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      amount: Number(amount) || 0,
      tag_id: tag || null,
      start_date: start || null,
      end_date: end || null,
    };
    if (!payload.name || !(payload.amount > 0)) return;
    if (isNew) await create.mutateAsync(payload);
    else await update.mutateAsync({ id: existing!.id, patch: payload });
    onClose();
  }

  async function onDelete() {
    if (existing) await del.mutateAsync(existing.id);
    onClose();
  }

  return (
    <Sheet title={isNew ? "New goal" : "Edit goal"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Name</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Japan 2026"
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">
            Target amount
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

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-400">
            Tag (transactions with this tag count toward the goal)
          </span>
          <TagPicker
            value={tag ? [tag] : []}
            onChange={(ids) => setTag(ids.length ? ids[ids.length - 1]! : "")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Start (optional)
            </span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              End (optional)
            </span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={field}
            />
          </label>
        </div>

        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={!name.trim() || !(Number(amount) > 0) || pending}
        >
          {pending ? "Saving…" : isNew ? "Create goal" : "Save changes"}
        </Button>
      </form>

      {!isNew && (
        <div className="mt-3 border-t border-ink-800 pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">Delete this goal?</p>
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
              <Trash2 className="size-3.5" /> Delete goal
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
