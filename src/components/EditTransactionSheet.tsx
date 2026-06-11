import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, Flag, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { reimbursementLinks } from "@/lib/reimbursements";
import { Button, Sheet } from "@/components/ui";
import { CategoryPicker } from "@/components/CategoryPicker";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import {
  useUpdateTransaction,
  useDeleteTransaction,
  useReimbursableExpenses,
  useTransactionsByIds,
} from "@/hooks/useTransactions";
import type { Transaction, TransactionType } from "@/lib/types";
import type { ReimbursementStatus } from "@/lib/database.types";

const inputCls =
  "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

type SheetType = Extract<
  TransactionType,
  "expense" | "income" | "transfer" | "adjustment"
>;
const TYPES: SheetType[] = ["expense", "income", "transfer", "adjustment"];
const TYPE_LABELS: Record<SheetType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  adjustment: "Adjust",
};

export function EditTransactionSheet({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();

  const [type, setType] = useState<SheetType>(tx.type);
  const [amount, setAmount] = useState(String(tx.amount));
  const [accountId, setAccountId] = useState(tx.account_id);
  const [toAccountId, setToAccountId] = useState(tx.destination_account_id ?? "");
  const [destAmount, setDestAmount] = useState(
    tx.destination_amount != null ? String(tx.destination_amount) : "",
  );
  const [rate, setRate] = useState(tx.fx_rate != null ? String(tx.fx_rate) : "");
  const [currency, setCurrency] = useState(tx.currency);
  const [srcCurrency, setSrcCurrency] = useState(tx.currency);
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [date, setDate] = useState(tx.date);
  const [merchant, setMerchant] = useState(tx.merchant ?? "");
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flagged, setFlagged] = useState(tx.flagged);
  const [isReimbursable, setIsReimbursable] = useState(tx.is_reimbursable);
  const [reimbStatus, setReimbStatus] = useState<ReimbursementStatus>(
    // "partial" is retired — treat any existing partial as pending.
    tx.reimbursement_status === "partial" ? "pending" : tx.reimbursement_status,
  );
  // expense_id → allocated amount (string), in this income's currency.
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of reimbursementLinks(tx)) init[l.expense_id] = String(l.amount);
    return init;
  });

  const { data: reimbursableExpenses = [] } = useReimbursableExpenses();
  // Also load any expenses this income is already linked to (they may be
  // settled / off the reimbursable list), so every allocation stays visible.
  const linkedIds = useMemo(
    () => reimbursementLinks(tx).map((l) => l.expense_id),
    [tx],
  );
  const { data: linkedExpenses = [] } = useTransactionsByIds(linkedIds);
  // No cross-currency reimbursement: only offer expenses in the income's own
  // currency. Already-linked expenses stay visible so old links are manageable.
  const expenseChoices = useMemo(() => {
    const map = new Map<string, Transaction>();
    for (const e of linkedExpenses) map.set(e.id, e);
    for (const e of reimbursableExpenses) {
      if (e.currency === tx.currency) map.set(e.id, e);
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [reimbursableExpenses, linkedExpenses, tx.currency]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const isTransfer = type === "transfer";
  const isAdjustment = type === "adjustment";
  const from = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const to =
    accounts.find((a) => a.id === toAccountId) ??
    accounts.find((a) => a.id !== from?.id);

  const allCurrencies = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.currency))).sort(),
    [accounts],
  );
  // Currency picker appears only for accounts explicitly marked multi-currency.
  const showCurrency = !!from?.is_multi_currency;
  const fromCurrency = srcCurrency || from?.currency || "";
  const entryCurrency = currency || from?.currency || "";
  const crossCurrency =
    isTransfer && !!from && !!to && fromCurrency !== to.currency;
  // Show the exchange-rate fields for cross-currency transfers AND whenever a
  // multi-currency account is involved (so you can always set an FX rate).
  const showRate =
    isTransfer &&
    !!from &&
    !!to &&
    (crossCurrency || !!from.is_multi_currency || !!to.is_multi_currency);


  // Cross-currency transfer: keep amount / rate / received in sync.
  function onAmountChange(v: string) {
    setAmount(v);
    const a = Number(v);
    const r = Number(rate);
    if (a > 0 && r > 0) setDestAmount((a * r).toFixed(2));
  }
  function onRateChange(v: string) {
    setRate(v);
    const a = Number(amount);
    const r = Number(v);
    if (a > 0 && r > 0) setDestAmount((a * r).toFixed(2));
  }
  function onDestAmountChange(v: string) {
    setDestAmount(v);
    const a = Number(amount);
    const d = Number(v);
    if (a > 0 && d > 0) setRate((d / a).toFixed(6));
  }

  const canSubmit = (() => {
    if (!from || !(Number(amount) > 0) || update.isPending) return false;
    if (isTransfer) {
      if (!to || to.id === from.id) return false;
      if (crossCurrency && !(Number(destAmount) > 0)) return false;
    }
    return true;
  })();

  // ── Reimbursement allocations (income only) ─────────────────────────────────
  function toggleAlloc(expense: Transaction) {
    setAlloc((prev) => {
      const next = { ...prev };
      if (expense.id in next) {
        delete next[expense.id];
        return next;
      }
      // Default to the still-unallocated repayment, capped at the expense's amount.
      const allocated = Object.values(next).reduce(
        (s, a) => s + (Number(a) || 0),
        0,
      );
      const remaining = Math.max(0, (Number(amount) || 0) - allocated);
      const def = remaining > 0 ? Math.min(remaining, expense.amount) : expense.amount;
      next[expense.id] = String(Number(def.toFixed(2)));
      return next;
    });
  }
  function setAllocAmount(id: string, v: string) {
    setAlloc((prev) => ({ ...prev, [id]: v }));
  }
  const links = Object.entries(alloc)
    .map(([expense_id, a]) => ({ expense_id, amount: Number(a) }))
    .filter((l) => Number.isFinite(l.amount) && l.amount > 0);
  const allocatedTotal = links.reduce((s, l) => s + l.amount, 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!from) return;

    if (isTransfer && to) {
      const amt = Number(amount);
      // Received defaults to the sent amount (1:1) when not specified.
      const recv = Number(destAmount) > 0 ? Number(destAmount) : amt;
      await update.mutateAsync({
        id: tx.id,
        patch: {
          type: "transfer",
          amount: amt,
          currency: fromCurrency,
          account_id: from.id,
          destination_account_id: to.id,
          destination_amount: recv,
          fx_rate: amt > 0 ? recv / amt : null,
          date,
          merchant: null,
          category_id: null,
          notes: notes.trim() || null,
          is_reimbursable: false,
          reimbursement_status: "none",
          linked_transaction_id: null,
          reimbursement_links: null,
          flagged,
        },
      });
    } else {
      await update.mutateAsync({
        id: tx.id,
        patch: {
          type,
          amount: Number(amount),
          currency: entryCurrency,
          account_id: from.id,
          destination_account_id: null,
          destination_amount: null,
          fx_rate: null,
          category_id: isAdjustment ? null : categoryId || null,
          date,
          merchant: merchant.trim() || null,
          notes: notes.trim() || null,
          // Reimbursement fields
          is_reimbursable: type === "expense" ? isReimbursable : false,
          reimbursement_status:
            type === "expense" && isReimbursable ? reimbStatus : "none",
          linked_transaction_id: null,
          reimbursement_links:
            type === "income" && links.length ? links : null,
          flagged,
        },
      });
    }
    onClose();
  }

  async function handleDelete() {
    await del.mutateAsync(tx.id);
    onClose();
  }

  const anyError = update.isError || del.isError;
  const errMsg = ((update.error || del.error) as Error | null)?.message;

  return (
    <Sheet title="Edit transaction" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          {/* Type picker */}
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "h-9 rounded-xl border text-xs font-medium transition-colors",
                  type === t
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-ink-700 text-ink-400",
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-400">
              Amount {isTransfer ? "sent" : ""}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, "tnum text-lg flex-1")}
              />
              {showCurrency ? (
                <select
                  aria-label="Currency"
                  value={isTransfer ? fromCurrency : entryCurrency}
                  onChange={(e) =>
                    isTransfer
                      ? setSrcCurrency(e.target.value)
                      : setCurrency(e.target.value)
                  }
                  className={cn(inputCls, "w-24 shrink-0")}
                >
                  {allCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                from && (
                  <span className="flex h-9 shrink-0 items-center rounded-xl border border-ink-800 bg-ink-950/40 px-3 text-sm text-ink-500">
                    {from.currency}
                  </span>
                )
              )}
            </div>
          </div>

          <Field label={isTransfer ? "From account" : "Account"}>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={inputCls}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </Field>

          {isTransfer ? (
            <>
              <Field label="To account">
                <select
                  value={toAccountId || to?.id || ""}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className={inputCls}
                >
                  {accounts
                    .filter((a) => a.id !== from?.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency}
                      </option>
                    ))}
                </select>
              </Field>

              {showRate && (
                <div className="space-y-3 rounded-xl border border-ink-700/70 bg-ink-950/40 p-3">
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    {fromCurrency}
                    <ArrowRight className="size-3.5" />
                    {to?.currency}
                    {crossCurrency && " · cross-currency transfer"}
                  </div>

                  <label className="block text-xs font-medium text-ink-400">
                    Exchange rate (1 {fromCurrency} → {to?.currency})
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      min="0"
                      value={rate}
                      onChange={(e) => onRateChange(e.target.value)}
                      placeholder="0.000000"
                      className={cn(inputCls, "tnum mt-1")}
                    />
                  </label>

                  <label className="block text-xs font-medium text-ink-400">
                    Amount received ({to?.currency})
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={destAmount}
                      onChange={(e) => onDestAmountChange(e.target.value)}
                      placeholder="0.00"
                      className={cn(inputCls, "tnum mt-1")}
                    />
                  </label>

                  {Number(amount) > 0 && Number(destAmount) > 0 && (
                    <p className="text-xs text-ink-500">
                      {Number(amount).toFixed(2)} {fromCurrency} ={" "}
                      {Number(destAmount).toFixed(2)} {to?.currency}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : isAdjustment ? (
            <>
              <div className="flex gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
                <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-violet-400" />
                <span>
                  Balance adjustment — raises this account's balance without
                  counting as income or expense (e.g. a transfer in, currency
                  conversion, or manual correction).
                </span>
              </div>

              <Field label="Description">
                <input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="e.g. Transfer from Wise"
                  className={inputCls}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Category">
                <CategoryPicker
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                  kind={type === "income" ? "income" : "expense"}
                />
              </Field>

              <Field label="Merchant / description">
                <input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="e.g. Woolworths"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </Field>

          {/* ── Split / reimbursable (expenses only) ── */}
          {type === "expense" && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-200">
                    Reimbursable
                  </p>
                  <p className="text-xs text-ink-500">
                    I'll be paid back — excluded from net cashflow
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isReimbursable}
                  onClick={() => {
                    const next = !isReimbursable;
                    setIsReimbursable(next);
                    if (next && reimbStatus === "none")
                      setReimbStatus("pending");
                    if (!next) setReimbStatus("none");
                  }}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                    isReimbursable ? "bg-teal-500" : "bg-ink-700",
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 translate-y-0 rounded-full bg-white shadow transition-transform",
                      isReimbursable ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </label>

              {isReimbursable && (
                <div className="mt-3 flex gap-1.5">
                  {(["pending", "settled"] as ReimbursementStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReimbStatus(s)}
                      className={cn(
                        "flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors",
                        reimbStatus === s
                          ? s === "settled"
                            ? "border-teal-500 bg-teal-500/10 text-teal-300"
                            : "border-ink-500 bg-ink-800 text-ink-200"
                          : "border-ink-700 text-ink-500",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Reimbursement allocations (income only) ── */}
          {type === "income" && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ink-200">
                  Reimburses…
                </p>
                {links.length > 0 && (
                  <p
                    className={cn(
                      "tnum text-xs",
                      allocatedTotal > Number(amount)
                        ? "text-amber-400"
                        : "text-ink-500",
                    )}
                  >
                    {formatMoney(allocatedTotal, entryCurrency)} of{" "}
                    {formatMoney(Number(amount) || 0, entryCurrency)}
                  </p>
                )}
              </div>

              {expenseChoices.length === 0 ? (
                <p className="text-xs text-ink-500">
                  No open reimbursable expenses found. Mark an expense as
                  "Reimbursable" first.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-ink-500">
                    Pick one or more expenses this repayment covers.
                  </p>
                  {expenseChoices.map((e) => {
                    const selected = e.id in alloc;
                    return (
                      <div key={e.id} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          onClick={() => toggleAlloc(e)}
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            selected
                              ? "border-teal-500 bg-teal-500 text-ink-950"
                              : "border-ink-600 text-transparent hover:border-ink-500",
                          )}
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink-100">
                            {e.merchant ?? "Expense"}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            {formatMoney(e.amount, e.currency)}
                            {accountMap.get(e.account_id)
                              ? ` · ${accountMap.get(e.account_id)}`
                              : ""}{" "}
                            · {e.date}
                          </p>
                        </div>
                        {selected && (
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={alloc[e.id]}
                            onChange={(ev) =>
                              setAllocAmount(e.id, ev.target.value)
                            }
                            aria-label={`Amount allocated to ${e.merchant ?? "expense"}`}
                            className="tnum h-8 w-20 shrink-0 rounded-lg border border-ink-700 bg-ink-950/60 px-2 text-right text-sm text-ink-50 focus:border-teal-500 focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Flag for review ── */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
            <div className="flex items-center gap-2">
              <Flag
                className={cn(
                  "size-4 shrink-0",
                  flagged ? "text-amber-400" : "text-ink-500",
                )}
              />
              <div>
                <p className="text-sm font-medium text-ink-200">
                  Flag for review
                </p>
                <p className="text-xs text-ink-500">
                  Mark to come back to it later
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flagged}
              onClick={() => setFlagged((v) => !v)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                flagged ? "bg-amber-500" : "bg-ink-700",
              )}
            >
              <span
                className={cn(
                  "block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  flagged ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
          </label>

          {anyError && (
            <p className="text-xs text-red-400">
              Something went wrong.{errMsg ? ` ${errMsg}` : ""}
            </p>
          )}

          <Button type="submit" size="sm" className="w-full" disabled={!canSubmit}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>

        {/* Delete zone */}
        <div className="mt-3 border-t border-ink-800 pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">
                Delete this transaction?
              </p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-ink-400 hover:text-ink-200"
              >
                Cancel
              </button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={del.isPending}
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 text-xs text-ink-500 transition-colors hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
              Delete transaction
            </button>
          )}
        </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">
        {label}
      </span>
      {children}
    </label>
  );
}
