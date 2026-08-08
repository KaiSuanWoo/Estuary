import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Check, ChevronLeft, Plus, Search, Target, Trash2 } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import {
  useTransactions,
  useReimbursedAmountMap,
  useCreateTransaction,
} from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
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
  useSetTransactionGoals,
} from "@/hooks/useBudgets";
import {
  spendForBudget,
  budgetPacing,
  goalFunding,
  groupLinks,
  groupTxnLinks,
  periodLabel,
  type GoalFunding,
} from "@/lib/budgets";
import type { RateMap } from "@/lib/fx";
import { formatMoney, formatSignedMoney, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import { PacingBar } from "@/components/ledger";
import type {
  Account,
  Budget,
  BudgetDirection,
  BudgetPeriod,
  BudgetType,
  Category,
  Transaction,
} from "@/lib/types";
import { FALLBACK_HEAD, HEAD_SWATCHES } from "@/lib/constants";

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const SWATCHES = HEAD_SWATCHES;

/**
 * Bar/text colour by progress. An expense budget counts *down* (over = bad, red);
 * a saving budget counts *up* (reaching the target = good, never red).
 */
function toneFor(ratio: number, saving: boolean): { bar: string; text: string } {
  if (saving)
    return ratio >= 1
      ? { bar: "bg-credit", text: "text-credit" }
      : { bar: "bg-accent", text: "text-accent" };
  if (ratio > 1) return { bar: "bg-debit", text: "text-debit" };
  if (ratio > 0.85) return { bar: "bg-head-3", text: "text-accent" };
  return { bar: "bg-accent", text: "text-accent" };
}

export function Budgets() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: txns = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: links = [] } = useBudgetLinks();
  const { data: txnLinks = [] } = useBudgetTransactionLinks();
  const reimbursed = useReimbursedAmountMap();
  const base = useBaseCurrency();
  const rates = useRateMap();

  const [sheet, setSheet] = useState<Budget | "new" | null>(null);
  const [contribute, setContribute] = useState<Budget | null>(null);

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

  const spendingTotals = useMemo(() => {
    let spent = 0;
    let budget = 0;
    for (const b of spending) {
      spent += spendForBudget(
        b,
        linksByBudget.get(b.id) ?? new Set<string>(),
        txns,
        base,
        rates,
        reimbursed,
      );
      budget += b.amount;
    }
    return { spent, budget };
  }, [spending, linksByBudget, txns, base, rates, reimbursed]);

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
        <GoalRow
          budget={b}
          funding={funding}
          count={ids.size}
          base={base}
          onEdit={() => setSheet(b)}
          onContribute={() => setContribute(b)}
        />
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4 flex items-center gap-2">
        {/* This page sets the limits; Analytics reads them. */}
        <Link
          to="/analytics?view=budgets"
          className="flex size-8 items-center justify-center rounded-[2px] text-quill-soft hover:text-quill"
          aria-label="Back to budget analysis"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1
            className="text-2xl tracking-[0.04em] text-quill"
            style={{ fontVariant: "small-caps" }}
          >
            Setting budgets
          </h1>
          <p className="text-sm italic text-quill-faint">
            Recurring limits and one-time goals
          </p>
        </div>
      </header>

      {/* Prominent add button */}
      <button
        onClick={() => setSheet("new")}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-[2px] border border-dashed border-rule py-3 text-sm font-medium text-quill-soft transition-colors hover:border-accent/60 hover:text-accent"
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
          {spending.length > 1 && (
            <BudgetTotals
              spent={spendingTotals.spent}
              budget={spendingTotals.budget}
              count={spending.length}
              base={base}
            />
          )}
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

      {contribute && (
        <ContributeSheet
          goal={contribute}
          accounts={accounts}
          base={base}
          onClose={() => setContribute(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-quill-faint">
      {children}
    </h2>
  );
}

/** Aggregate progress across all spending budgets — the page's focal summary. */
function BudgetTotals({
  spent,
  budget,
  count,
  base,
}: {
  spent: number;
  budget: number;
  count: number;
  base: string;
}) {
  const ratio = budget > 0 ? spent / budget : 0;
  const remaining = budget - spent;
  const tone = toneFor(ratio, false);
  return (
    <Card className="p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-quill-soft">
            Spending this period{" "}
            <span className="text-quill-faint">· {count} budget{count === 1 ? "" : "s"}</span>
          </p>
          <p className="tnum mt-0.5 text-xl font-semibold tracking-tight text-quill">
            {formatMoney(spent, base)}
            <span className="text-sm font-normal text-quill-faint">
              {" "}
              / {formatMoney(budget, base)}
            </span>
          </p>
        </div>
        <span className={cn("tnum shrink-0 text-sm font-medium", tone.text)}>
          {remaining >= 0
            ? `${formatMoney(remaining, base)} left`
            : `${formatMoney(-remaining, base)} over`}
        </span>
      </div>
      <PacingBar ratio={ratio} className="mt-3 h-2.5" />
    </Card>
  );
}

/**
 * Two-segment bar: spent first, then saved, both toward the target. Spent and
 * saved use distinct hues (indigo vs emerald) so they're easy to tell apart.
 */
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
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(spentPct + savedPct)}
      aria-label={`${Math.round(((spent + saved) / t) * 100)}% funded`}
      className="mt-3 flex h-2 overflow-hidden rounded-full bg-page-edge"
    >
      <div className="h-full bg-head-4 transition-all" style={{ width: `${spentPct}%` }} />
      <div className="h-full bg-credit transition-all" style={{ width: `${savedPct}%` }} />
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
  const pacing = budgetPacing(b, spent);
  const tone = toneFor(ratio, saving);

  const cats =
    catNames.length === 0
      ? "No categories yet"
      : catNames.length <= 2
        ? catNames.join(" · ")
        : `${catNames.slice(0, 2).join(" · ")} +${catNames.length - 2}`;

  const remainingLabel = saving
    ? remaining > 0
      ? `${formatMoney(remaining, base)} to go`
      : "Target reached"
    : remaining >= 0
      ? `${formatMoney(remaining, base)} left`
      : `${formatMoney(-remaining, base)} over`;

  // One contextual pace hint: how much can still be spent/saved per day, or a
  // warning when expense spend is running ahead of the period.
  let hint: { text: string; tone: string } | null = null;
  if (saving) {
    if (remaining > 0 && pacing.perDayLeft != null)
      hint = {
        text: `Save ~${formatMoney(pacing.perDayLeft, base)}/day to reach target`,
        tone: "text-quill-faint",
      };
  } else if (ratio > 1) {
    // Over budget: contrast the actual daily burn with the budgeted daily allowance.
    if (pacing.daysTotal && pacing.daysLeft != null) {
      const elapsedDays = Math.max(1, pacing.daysTotal - pacing.daysLeft);
      hint = {
        text: `${formatMoney(spent / elapsedDays, base)}/day vs ${formatMoney(b.amount / pacing.daysTotal, base)}/day budgeted`,
        tone: "text-debit/80",
      };
    }
  } else {
    if (pacing.overPace && pacing.projected != null)
      hint = {
        text: `Ahead of pace · on track for ${formatMoney(pacing.projected, base)}`,
        tone: "text-accent",
      };
    else if (pacing.perDayLeft != null)
      hint = {
        text: `~${formatMoney(pacing.perDayLeft, base)}/day left for ${pacing.daysLeft}d`,
        tone: "text-quill-faint",
      };
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: b.color ?? FALLBACK_HEAD }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-quill">{b.name}</p>
            <p className="truncate text-xs text-quill-faint">
              <span className="text-quill-soft">{periodLabel(b)}</span> · {cats}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn("tnum text-sm font-medium", tone.text)}>
            {formatMoney(spent, base)}
            <span className="text-quill-faint"> / {formatMoney(b.amount, base)}</span>
          </span>
          <p className={cn("tnum text-[11px] font-medium", tone.text)}>
            {Math.round(ratio * 100)}% {saving ? "saved" : "used"}
          </p>
        </div>
      </div>
      <PacingBar
        ratio={ratio}
        elapsed={pacing.elapsedRatio}
        tone={saving ? "credit" : undefined}
        className="mt-3 h-2.5"
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={cn("tnum font-medium", tone.text)}>{remainingLabel}</span>
        {pacing.daysLeft != null && (
          <span className="tnum text-quill-faint">
            {pacing.daysLeft === 0 ? "Ends today" : `${pacing.daysLeft}d left`}
          </span>
        )}
      </div>
      {hint && <p className={cn("tnum mt-1 text-xs", hint.tone)}>{hint.text}</p>}
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
  onEdit,
  onContribute,
}: {
  budget: Budget;
  funding: GoalFunding;
  count: number;
  base: string;
  onEdit: () => void;
  onContribute: () => void;
}) {
  const { spent, saved, funded, remaining, daysLeft, perWeek } = funding;
  const over = funded > b.amount + 0.005;

  return (
    <Card className="p-3.5">
      <button onClick={onEdit} className="block w-full text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: b.color ?? FALLBACK_HEAD }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-quill">{b.name}</p>
            <p className="truncate text-xs text-quill-faint">
              {goalDateLabel(b, daysLeft)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="tnum text-sm font-medium text-credit">
            {formatMoney(funded, base)}
            <span className="text-quill-faint"> / {formatMoney(b.amount, base)}</span>
          </span>
          <p className="tnum text-[11px] font-medium text-credit/80">
            {Math.round(funding.ratio * 100)}% funded
          </p>
        </div>
      </div>

      <StackedBar spent={spent} saved={saved} target={b.amount} />

      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="tnum text-quill-faint">
          {count === 0 ? (
            "No transactions yet"
          ) : (
            <>
              <span className="text-head-4">{formatMoney(spent, base)} spent</span>
              {" · "}
              <span className="text-credit">{formatMoney(saved, base)} saved</span>
            </>
          )}
        </span>
        <span className="tnum font-medium text-quill-soft">
          {remaining > 0
            ? `${formatMoney(remaining, base)} to save`
            : over
              ? `${formatMoney(funded - b.amount, base)} over`
              : "Fully funded"}
        </span>
      </div>

      {perWeek != null && (
        <p className="mt-1 text-right text-xs text-quill-faint">
          ~{formatMoney(perWeek, base)}/wk to stay on track
        </p>
      )}
      </button>
      <button
        onClick={onContribute}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[2px] border border-rule/60 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent/5"
      >
        <Plus className="size-3.5" /> Contribute
      </button>
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
  const [color, setColor] = useState(existing?.color ?? SWATCHES[0]);
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
    "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

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
      color,
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
          <span className="mb-1 block text-xs font-medium text-quill-soft">
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
                  "rounded-[2px] border px-3 py-2 text-left transition-colors",
                  btype === t.value
                    ? "border-accent bg-accent/10"
                    : "border-rule hover:border-rule-strong",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-medium",
                    btype === t.value ? "text-accent" : "text-quill",
                  )}
                >
                  {t.label}
                </span>
                <span className="block text-xs text-quill-faint">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-quill-soft">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isGoal ? "e.g. Hokkaido 2026" : "e.g. Monthly food"}
            className={field}
          />
        </label>

        {/* Colour */}
        <div>
          <span className="mb-1 block text-xs font-medium text-quill-soft">Colour</span>
          <div className="flex gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full transition-transform",
                  color === c
                    ? "ring-2 ring-quill ring-offset-2 ring-offset-page"
                    : "hover:scale-110",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-quill-soft">
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
              <span className="mb-1 block text-xs font-medium text-quill-soft">
                Fund by <span className="text-quill-faint">(optional)</span>
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
                <span className="text-xs font-medium text-quill-soft">
                  Transactions ({pickedTxns.size})
                </span>
                <span className="tnum text-xs text-quill-faint">
                  <span className="text-head-4">
                    {formatMoney(preview.spent, base)} spent
                  </span>
                  {" · "}
                  <span className="text-credit">
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
              <p className="mt-1 text-xs text-quill-faint">
                Expenses count as spent; transfers &amp; income count as saved.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Direction: expense (down) vs saving (up) */}
            <div>
              <span className="mb-1 block text-xs font-medium text-quill-soft">
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
                      "rounded-[2px] border px-3 py-2 text-left transition-colors",
                      direction === d.value
                        ? "border-accent bg-accent/10"
                        : "border-rule hover:border-rule-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        direction === d.value ? "text-accent" : "text-quill",
                      )}
                    >
                      {d.label}
                    </span>
                    <span className="block text-xs text-quill-faint">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time frame */}
            <div>
              <span className="mb-1 block text-xs font-medium text-quill-soft">
                Time frame
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      "h-9 rounded-[2px] border text-xs font-medium transition-colors",
                      period === p.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-rule text-quill-soft hover:border-rule-strong",
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
                    <span className="mb-1 block text-xs font-medium text-quill-soft">
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
                    <span className="mb-1 block text-xs font-medium text-quill-soft">
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
                <p className="mt-1 text-xs text-quill-faint">
                  Leave a date empty for an open-ended range.
                </p>
              </div>
            )}

            {/* Category assignment */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-quill-soft">
                Categories ({pickedCats.size} selected)
              </span>
              {expenseCats.length === 0 ? (
                <p className="text-xs text-quill-faint">
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
                          "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs font-medium transition-colors",
                          on
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-rule text-quill-soft hover:border-rule-strong",
                        )}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color ?? FALLBACK_HEAD }}
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

        {dateError && <p className="text-xs text-debit">{dateError}</p>}
        {anyError && (
          <p className="text-xs text-debit">Couldn't save — please try again.</p>
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
        <div className="mt-3 border-t border-rule pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-quill-soft">Delete this budget?</p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-quill-soft hover:text-quill"
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
              className="flex w-full items-center justify-center gap-2 text-xs text-quill-faint transition-colors hover:text-debit"
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
    <div className="rounded-[2px] border border-rule/60 bg-well">
      <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
        <Search className="size-3.5 shrink-0 text-quill-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transactions…"
          className="w-full bg-transparent text-sm text-quill placeholder:text-quill-faint focus:outline-none"
        />
      </div>
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-quill-faint">
            {txns.length === 0 ? "No transactions yet." : "No matches."}
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {filtered.map((t) => {
              const on = picked.has(t.id);
              const isExpense = t.type === "expense";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(t.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-page-edge"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on
                          ? "border-accent bg-accent text-page"
                          : "border-rule",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-quill">
                        {t.merchant || (isExpense ? "Expense" : "Transaction")}
                      </span>
                      <span className="block text-xs text-quill-faint">
                        {format(parseISO(t.date), "d MMM yyyy")} ·{" "}
                        {isExpense ? "spent" : "saved"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tnum shrink-0 text-xs font-medium",
                        isExpense ? "text-quill-soft" : "text-credit",
                      )}
                    >
                      {formatSignedMoney(t.amount, t.currency, t.type)}
                      {t.currency !== base && (
                        <span className="ml-1 text-quill-faint">{t.currency}</span>
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

// ─── Contribute to a goal ─────────────────────────────────────────────────────

/**
 * Record a contribution toward a goal. It's a transfer between two of your
 * accounts (money moved into savings) linked to the goal, so it counts as
 * "saved" without distorting income/net worth. With a single account it falls
 * back to a neutral balance adjustment.
 */
function ContributeSheet({
  goal,
  accounts,
  base,
  onClose,
}: {
  goal: Budget;
  accounts: Account[];
  base: string;
  onClose: () => void;
}) {
  const create = useCreateTransaction();
  const setGoals = useSetTransactionGoals();

  const first = accounts[0];
  const second = accounts.find((a) => a.id !== first?.id);
  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState(first?.id ?? "");
  const [toId, setToId] = useState(second?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);

  const from = accounts.find((a) => a.id === fromId) ?? first;
  const to = accounts.find((a) => a.id === toId);
  const multi = accounts.length >= 2;
  const pending = create.isPending || setGoals.isPending;
  const field =
    "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill focus:border-accent focus:outline-none";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0) || !from) return;
    if (multi && (!to || to.id === from.id)) {
      setError("Pick two different accounts to move money between.");
      return;
    }
    setError(null);
    try {
      const txn =
        multi && to
          ? await create.mutateAsync({
              type: "transfer",
              amount: amt,
              currency: from.currency,
              account_id: from.id,
              destination_account_id: to.id,
              destination_amount: from.currency === to.currency ? amt : null,
              date,
              merchant: `Contribution · ${goal.name}`,
            })
          : await create.mutateAsync({
              type: "adjustment",
              amount: amt,
              currency: from.currency,
              account_id: from.id,
              date,
              merchant: `Contribution · ${goal.name}`,
            });
      await setGoals.mutateAsync({ transactionId: txn.id, budgetIds: [goal.id] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Sheet title={`Contribute to ${goal.name}`} onClose={onClose}>
      {accounts.length === 0 ? (
        <p className="py-4 text-center text-sm text-quill-soft">
          Add an account first, then you can contribute.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-quill-soft">Amount</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={cn(field, "tnum text-lg")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-quill-soft">
              {multi ? "From account" : "Account"}
            </span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={field}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </label>

          {multi && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">Into account</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={field}>
                {accounts
                  .filter((a) => a.id !== fromId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-quill-soft">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>

          <p className="text-xs text-quill-faint">
            {multi
              ? "Moves money between your accounts and counts toward this goal — neutral to income."
              : "Recorded as a set-aside on this account, counted toward this goal."}
          </p>

          {error && <p className="text-xs text-debit">{error}</p>}

          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={!(Number(amount) > 0) || pending}
          >
            {pending ? "Saving…" : `Contribute ${amount ? formatMoney(Number(amount), from?.currency ?? base) : ""}`}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
