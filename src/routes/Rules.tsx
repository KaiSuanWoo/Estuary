import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Pencil, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  useCategorizationRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useApplyRules,
} from "@/hooks/useCategorizationRules";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import {
  FIELD_LABELS,
  OPERATOR_LABELS,
  operatorsFor,
} from "@/lib/categorize";
import { cn } from "@/lib/cn";
import { Button, Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import type {
  Category,
  CategorizationRule,
} from "@/lib/types";
import type { RuleMatchField, RuleMatchOperator } from "@/lib/database.types";

const inputCls =
  "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

const FIELDS: RuleMatchField[] = ["merchant", "notes", "amount", "account"];

export function Rules() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CategorizationRule | null>(null);
  const { data: rules = [], isLoading } = useCategorizationRules();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const apply = useApplyRules();

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/categories"
            className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:text-ink-200"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            Auto-categorise
          </h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Rule
        </Button>
      </header>

      <Card className="mb-4 flex gap-3 py-3">
        <Wand2 className="mt-0.5 size-4 shrink-0 text-ink-500" />
        <p className="text-sm text-ink-400">
          Rules run top-to-bottom on each income/expense transaction — the first
          match sets the category. New imports are categorised automatically; use{" "}
          <span className="text-ink-300">Apply now</span> to sweep existing
          uncategorised transactions.
        </p>
      </Card>

      {/* Apply to existing */}
      <Card className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-200">
            Apply to existing transactions
          </p>
          <p className="text-xs text-ink-500">
            {apply.isSuccess
              ? `Categorised ${apply.data.updated} of ${apply.data.scanned} uncategorised.`
              : apply.isError
                ? (apply.error as Error).message
                : "Only touches uncategorised income/expense rows."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => apply.mutate()}
          disabled={apply.isPending || rules.length === 0}
        >
          {apply.isPending ? (
            <>
              <Spinner className="size-4" /> Applying…
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Apply now
            </>
          )}
        </Button>
      </Card>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<Wand2 className="size-6" />}
          title="No rules yet"
          hint="Add a rule like “Merchant contains Spotify → Subscriptions”."
        />
      ) : (
        <Card className="divide-y divide-ink-800/70 py-0">
          {rules.map((rule) => {
            const cat = rule.set_category_id
              ? categoryMap.get(rule.set_category_id)
              : undefined;
            const valueLabel =
              rule.match_field === "account"
                ? accountMap.get(rule.match_value) ?? "Unknown account"
                : rule.match_value;
            return (
              <div
                key={rule.id}
                className={cn(
                  "flex items-center gap-3 py-3",
                  !rule.is_enabled && "opacity-50",
                )}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.is_enabled}
                  onClick={() =>
                    update.mutate({
                      id: rule.id,
                      patch: { is_enabled: !rule.is_enabled },
                    })
                  }
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                    rule.is_enabled ? "bg-teal-500" : "bg-ink-700",
                  )}
                  aria-label={rule.is_enabled ? "Disable rule" : "Enable rule"}
                >
                  <span
                    className={cn(
                      "block size-3.5 rounded-full bg-white shadow transition-transform",
                      rule.is_enabled ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>

                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate text-ink-200">
                    <span className="text-ink-400">
                      {FIELD_LABELS[rule.match_field]}
                    </span>{" "}
                    {OPERATOR_LABELS[rule.match_operator]}{" "}
                    <span className="font-medium text-ink-100">
                      {valueLabel}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                    →
                    {cat ? (
                      <>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color ?? "#4d6175" }}
                        />
                        {cat.name}
                      </>
                    ) : (
                      <span className="italic">no category</span>
                    )}
                    {rule.set_reimbursable && (
                      <span className="ml-1 rounded-full bg-ink-800 px-1.5 py-px text-[10px] font-medium text-ink-400">
                        reimbursable
                      </span>
                    )}
                  </p>
                </div>

                <button
                  onClick={() => setEditing(rule)}
                  aria-label="Edit rule"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-800 hover:text-ink-200"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => del.mutate(rule.id)}
                  aria-label="Delete rule"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-600 transition-colors hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {adding && (
        <RuleSheet
          categories={categories}
          accounts={accounts}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <RuleSheet
          rule={editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Add / edit sheet ─────────────────────────────────────────────────────────

function RuleSheet({
  rule,
  categories,
  accounts,
  onClose,
}: {
  rule?: CategorizationRule;
  categories: Category[];
  accounts: { id: string; name: string; currency: string }[];
  onClose: () => void;
}) {
  const create = useCreateRule();
  const update = useUpdateRule();
  const isEdit = !!rule;

  const [field, setField] = useState<RuleMatchField>(rule?.match_field ?? "merchant");
  const [operator, setOperator] = useState<RuleMatchOperator>(
    rule?.match_operator ?? "contains",
  );
  const [value, setValue] = useState(
    rule?.match_value ?? (accounts[0] && rule?.match_field === "account" ? accounts[0].id : ""),
  );
  const [categoryId, setCategoryId] = useState(rule?.set_category_id ?? "");
  const [reimbursable, setReimbursable] = useState(rule?.set_reimbursable === true);

  function changeField(f: RuleMatchField) {
    setField(f);
    const ops = operatorsFor(f);
    if (!ops.includes(operator)) setOperator(ops[0]);
    // Reset value when switching to/from the account picker.
    if (f === "account") setValue(accounts[0]?.id ?? "");
    else if (field === "account") setValue("");
  }

  const canSubmit = value.trim().length > 0 && !create.isPending && !update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const patch = {
      match_field: field,
      match_operator: operator,
      match_value: value.trim(),
      set_category_id: categoryId || null,
      set_reimbursable: reimbursable ? true : null,
    };
    if (isEdit) await update.mutateAsync({ id: rule!.id, patch });
    else await create.mutateAsync(patch);
    onClose();
  }

  return (
    <Sheet title={isEdit ? "Edit rule" : "New rule"} onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          {/* Field */}
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-400">When</span>
            <div className="grid grid-cols-4 gap-1.5">
              {FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => changeField(f)}
                  className={cn(
                    "h-9 rounded-xl border text-xs font-medium transition-colors",
                    field === f
                      ? "border-teal-500 bg-teal-500/10 text-teal-300"
                      : "border-ink-700 text-ink-400",
                  )}
                >
                  {FIELD_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Operator */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">Condition</span>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as RuleMatchOperator)}
              className={inputCls}
            >
              {operatorsFor(field).map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
          </label>

          {/* Value */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              {field === "amount" ? "Range or value" : "Value"}
            </span>
            {field === "account" ? (
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={inputCls}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  field === "amount"
                    ? operator === "amountRange"
                      ? "e.g. 10-50"
                      : "e.g. 9.99"
                    : "e.g. Spotify"
                }
                className={inputCls}
              />
            )}
          </label>

          {/* Category */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Set category
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              <option value="">— no change —</option>
              <optgroup label="Expense">
                {categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Income">
                {categories
                  .filter((c) => c.kind === "income")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>

          {/* Reimbursable */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
            <div>
              <p className="text-sm font-medium text-ink-200">
                Also mark reimbursable
              </p>
              <p className="text-xs text-ink-500">
                Flags matching expenses as paid-back
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reimbursable}
              onClick={() => setReimbursable((v) => !v)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                reimbursable ? "bg-teal-500" : "bg-ink-700",
              )}
            >
              <span
                className={cn(
                  "block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  reimbursable ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
          </label>

          {(create.isError || update.isError) && (
            <p className="text-xs text-red-400">
              Couldn't save. {((create.error || update.error) as Error).message}
            </p>
          )}

          <Button type="submit" size="sm" className="w-full" disabled={!canSubmit}>
            {create.isPending || update.isPending ? "Saving…" : "Save rule"}
          </Button>
        </form>
    </Sheet>
  );
}
