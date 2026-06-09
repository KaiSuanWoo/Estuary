import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Plus, Wallet } from "lucide-react";
import { useAccounts, useCreateAccount, useUpdateAccount, useArchiveAccount } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { accountBalancesByCurrency, isMultiCurrency } from "@/lib/balances";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/account-colors";
import { Button, Card, EmptyState, PageHeader, Sheet, Spinner } from "@/components/ui";
import type { Account, AccountType } from "@/lib/types";

const inputCls =
  "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

const ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "cash", "investmentCash"];

export function Accounts() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: txns = [] } = useTransactions();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Accounts"
        action={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        }
      />

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="No accounts yet"
          hint="Add a bank account, cash, or savings to start tracking balances."
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => {
            const col = ACCOUNT_TYPE_COLORS[a.type];
            const balances = accountBalancesByCurrency(a, txns);
            const multi = a.is_multi_currency || isMultiCurrency(balances);
            // Primary currency first, then the rest alphabetically.
            const currencies = [
              a.currency,
              ...Object.keys(balances)
                .filter((c) => c !== a.currency)
                .sort(),
            ];
            return (
              <Card key={a.id} className="flex items-center gap-3">
                {/* Account-type colour dot */}
                <span className={cn("size-2.5 shrink-0 rounded-full", col.dot)} />

                <Link to={`/transactions?account=${a.id}`} className="group min-w-0 flex-1">
                  <p className="font-medium text-ink-100 transition-colors group-hover:text-teal-300">
                    {a.name}
                  </p>
                  <p className="text-sm text-ink-500">
                    <span className={col.text}>{ACCOUNT_TYPE_LABELS[a.type]}</span>
                    {" · "}
                    {multi ? "Multi-currency" : a.currency}
                  </p>
                </Link>

                <Link
                  to={`/transactions?account=${a.id}`}
                  className="group flex flex-col items-end gap-0.5 transition-colors"
                >
                  {currencies.map((c, i) => (
                    <span
                      key={c}
                      className={cn(
                        "tnum font-semibold transition-colors group-hover:text-teal-300",
                        i === 0 ? "text-lg text-ink-50" : "text-xs text-ink-400",
                      )}
                    >
                      {formatMoney(balances[c] ?? 0, c)}
                      {multi && (
                        <span className="ml-1 text-ink-600">{c}</span>
                      )}
                    </span>
                  ))}
                </Link>

                <button
                  onClick={() => setEditing(a)}
                  aria-label={`Edit ${a.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {adding && <AddAccountSheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditAccountSheet account={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ─── Type picker (shared between both sheets) ─────────────────────────────────

function TypePicker({
  value,
  onChange,
}: {
  value: AccountType;
  onChange: (t: AccountType) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-ink-400">Type</span>
      <div className="grid grid-cols-4 gap-1.5">
        {ACCOUNT_TYPES.map((t) => {
          const col = ACCOUNT_TYPE_COLORS[t];
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              className={cn(
                "h-9 rounded-xl border text-xs font-medium transition-colors",
                active
                  ? cn(col.border, col.bg, col.text)
                  : "border-ink-700 text-ink-400 hover:border-ink-600",
              )}
            >
              {t === "investmentCash" ? "Invest" : ACCOUNT_TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Multi-currency toggle (shared between both sheets) ────────────────────────

function MultiCurrencyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
      <div>
        <p className="text-sm font-medium text-ink-200">Multi-currency account</p>
        <p className="text-xs text-ink-500">
          Holds balances in more than one currency (e.g. Wise)
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
          value ? "bg-teal-500" : "bg-ink-700",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white shadow transition-transform",
            value ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

// ─── Edit sheet ───────────────────────────────────────────────────────────────

function EditAccountSheet({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const update = useUpdateAccount();
  const archive = useArchiveAccount();

  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const [opening, setOpening] = useState(String(account.opening_balance));
  const [isMulti, setIsMulti] = useState(account.is_multi_currency);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const smInput =
    "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      id: account.id,
      patch: {
        name: name.trim(),
        type,
        currency: currency.trim().toUpperCase() || account.currency,
        opening_balance: Number(opening) || 0,
        is_multi_currency: isMulti,
      },
    });
    onClose();
  }

  function handleArchive() {
    archive(account.id);
    onClose();
  }

  return (
    <Sheet title="Edit account" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={smInput}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">
                {isMulti ? "Primary" : "Currency"}
              </span>
              <input
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
                className={cn(smInput, "uppercase")}
              />
            </label>
          </div>

          <TypePicker value={type} onChange={setType} />

          <MultiCurrencyToggle value={isMulti} onChange={setIsMulti} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Opening balance{isMulti && ` (${currency.toUpperCase()})`}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0.00"
              className={cn(smInput, "tnum")}
            />
          </label>

          {update.isError && (
            <p className="text-xs text-red-400">
              Couldn't save. {(update.error as Error).message}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={!name.trim() || update.isPending}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>

        <div className="mt-3 border-t border-ink-800 pt-3">
          {confirmArchive ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">Archive this account?</p>
              <button
                onClick={() => setConfirmArchive(false)}
                className="text-xs text-ink-400 hover:text-ink-200"
              >
                Cancel
              </button>
              <Button variant="danger" size="sm" onClick={handleArchive}>
                Archive
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="flex w-full items-center justify-center gap-2 text-xs text-ink-500 transition-colors hover:text-red-400"
            >
              Archive account
            </button>
          )}
        </div>
    </Sheet>
  );
}

// ─── Add sheet ────────────────────────────────────────────────────────────────

function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [currency, setCurrency] = useState("AUD");
  const [opening, setOpening] = useState("");
  const [isMulti, setIsMulti] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      type,
      currency: currency.trim().toUpperCase(),
      opening_balance: Number(opening) || 0,
      is_multi_currency: isMulti,
    });
    onClose();
  }

  return (
    <Sheet title="New account" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Everyday Checking"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">
                {isMulti ? "Primary" : "Currency"}
              </span>
              <input
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
                className={cn(inputCls, "uppercase")}
              />
            </label>
          </div>

          <TypePicker value={type} onChange={setType} />

          <MultiCurrencyToggle value={isMulti} onChange={setIsMulti} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Opening balance{isMulti && ` (${currency.toUpperCase()})`}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0.00"
              className={cn(inputCls, "tnum")}
            />
          </label>

          {create.isError && (
            <p className="text-xs text-red-400">
              Couldn't save. {(create.error as Error).message}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Saving…" : "Add account"}
          </Button>
        </form>
    </Sheet>
  );
}
