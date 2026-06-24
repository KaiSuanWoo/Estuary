import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/format";
import { Button, Sheet } from "@/components/ui";
import { CategoryPicker } from "@/components/CategoryPicker";
import { TagPicker } from "@/components/TagPicker";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useSetTransactionTags } from "@/hooks/useTags";
import type { TransactionType } from "@/lib/types";

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

export function AddTransactionSheet({ onClose }: { onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const create = useCreateTransaction();
  const setTxnTags = useSetTransactionTags();

  const [type, setType] = useState<SheetType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [destAmount, setDestAmount] = useState("");
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState(""); // transfer fee, in the source currency
  const [currency, setCurrency] = useState(""); // "" → use account's currency
  const [srcCurrency, setSrcCurrency] = useState(""); // transfer source currency
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isReimbursable, setIsReimbursable] = useState(false);

  const isTransfer = type === "transfer";
  const isAdjustment = type === "adjustment";
  const from = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const to =
    accounts.find((a) => a.id === toAccountId) ??
    accounts.find((a) => a.id !== from?.id);

  // Currencies the user deals in — drives whether currency pickers are shown.
  const allCurrencies = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.currency))).sort(),
    [accounts],
  );
  // Currency picker appears only for accounts explicitly marked multi-currency.
  const showCurrency = !!from?.is_multi_currency;

  // Effective currency the money is denominated in.
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

  // ── Cross-currency transfer: keep amount / fee / rate / received in sync ────
  // Wise model: the fee is taken from the source first, then the remainder is
  // converted → received = (amount − fee) × rate.
  function syncReceived(a: number, f: number, r: number) {
    if (a > 0 && r > 0) setDestAmount((Math.max(0, a - f) * r).toFixed(2));
  }
  function onAmountChange(v: string) {
    setAmount(v);
    syncReceived(Number(v), Number(fee), Number(rate));
  }
  function onFeeChange(v: string) {
    setFee(v);
    syncReceived(Number(amount), Number(v), Number(rate));
  }
  function onRateChange(v: string) {
    setRate(v);
    syncReceived(Number(amount), Number(fee), Number(v));
  }
  function onDestAmountChange(v: string) {
    setDestAmount(v);
    const net = Math.max(0, Number(amount) - Number(fee));
    const d = Number(v);
    if (net > 0 && d > 0) setRate((d / net).toFixed(6));
  }

  const canSubmit = (() => {
    if (!from || !(Number(amount) > 0) || create.isPending) return false;
    if (isTransfer) {
      if (!to || to.id === from.id) return false;
      if (crossCurrency && !(Number(destAmount) > 0)) return false;
    }
    return true;
  })();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!from) return;

    let created;
    if (isTransfer && to) {
      const amt = Number(amount);
      const f = Number(fee);
      const net = Math.max(0, amt - f); // amount left after the fee
      // Cross-currency: received comes from the rate box. Same-currency:
      // received = amount − fee (the fee is the only difference).
      const recv = showRate ? (Number(destAmount) > 0 ? Number(destAmount) : net) : net;
      const feeNote = f > 0 ? `fee ${f.toFixed(2)} ${fromCurrency}` : "";
      created = await create.mutateAsync({
        type: "transfer",
        amount: amt,
        currency: fromCurrency,
        account_id: from.id,
        destination_account_id: to.id,
        destination_amount: recv,
        // Keep the pure FX rate the user entered for cross-currency transfers.
        fx_rate: showRate ? (Number(rate) > 0 ? Number(rate) : amt > 0 ? recv / amt : null) : null,
        date,
        notes: [notes.trim(), feeNote].filter(Boolean).join(" · ") || null,
      });
    } else {
      created = await create.mutateAsync({
        type,
        amount: Number(amount),
        currency: entryCurrency,
        account_id: from.id,
        category_id: isAdjustment ? null : categoryId || null,
        date,
        merchant: merchant.trim() || null,
        notes: notes.trim() || null,
        is_reimbursable: type === "expense" ? isReimbursable : false,
        reimbursement_status:
          type === "expense" && isReimbursable ? "pending" : "none",
      });
    }
    if (created && tags.length) {
      await setTxnTags.mutateAsync({ transactionId: created.id, tagIds: tags });
    }
    onClose();
  }

  const notEnoughAccounts = isTransfer && accounts.length < 2;

  return (
    <Sheet title="New transaction" onClose={onClose}>
        {accounts.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-400">
            Add an account first, then you can record transactions.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
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

            {notEnoughAccounts ? (
              <p className="py-4 text-center text-sm text-ink-400">
                You need at least two accounts to make a transfer.
              </p>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-400">
                    Amount {isTransfer ? "sent" : ""}
                  </label>
                  <div className={cn("flex gap-2", showCurrency && "items-stretch")}>
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
                    value={accountId || from?.id || ""}
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

                    {/* Fee — applies to any transfer (Wise charges fees even
                        same-currency); deducted from the amount sent. */}
                    {to && (
                      <Field label={`Fee (${fromCurrency}) — optional, e.g. Wise fee`}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={fee}
                          onChange={(e) => onFeeChange(e.target.value)}
                          placeholder="0.00"
                          className={cn(inputCls, "tnum")}
                        />
                      </Field>
                    )}

                    {showRate ? (
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
                            {Number(amount).toFixed(2)} {fromCurrency}
                            {Number(fee) > 0 &&
                              ` − ${Number(fee).toFixed(2)} fee`}{" "}
                            = {Number(destAmount).toFixed(2)} {to?.currency}
                          </p>
                        )}
                      </div>
                    ) : (
                      to &&
                      Number(fee) > 0 &&
                      Number(amount) > 0 && (
                        <p className="text-xs text-ink-500">
                          {Number(amount).toFixed(2)} {fromCurrency} −{" "}
                          {Number(fee).toFixed(2)} fee ={" "}
                          {Math.max(0, Number(amount) - Number(fee)).toFixed(2)}{" "}
                          {to?.currency} received
                        </p>
                      )
                    )}
                  </>
                ) : isAdjustment ? (
                  <>
                    <div className="flex gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
                      <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-violet-400" />
                      <span>
                        Balance adjustment — raises this account's balance
                        without counting as income or expense (e.g. a transfer
                        in, currency conversion, or manual correction).
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

                <Field label="Tags">
                  <TagPicker value={tags} onChange={setTags} />
                </Field>

                {/* Reimbursable toggle — only for expenses */}
                {type === "expense" && (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
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
                      onClick={() => setIsReimbursable((v) => !v)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                        isReimbursable ? "bg-teal-500" : "bg-ink-700",
                      )}
                    >
                      <span
                        className={cn(
                          "block h-4 w-4 rounded-full bg-white shadow transition-transform",
                          isReimbursable ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </label>
                )}

                {create.isError && (
                  <p className="text-xs text-red-400">
                    Couldn't save. {(create.error as Error).message}
                  </p>
                )}

                <Button type="submit" size="sm" className="w-full" disabled={!canSubmit}>
                  {create.isPending ? "Saving…" : "Save transaction"}
                </Button>
              </>
            )}
          </form>
        )}
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
