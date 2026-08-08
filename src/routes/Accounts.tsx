import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { GripVertical, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useArchiveAccount,
  useReorderAccounts,
} from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import {
  useReconciliations,
  useCreateReconciliation,
} from "@/hooks/useReconciliations";
import { useInvestmentOverrides } from "@/hooks/useInvestmentSnapshot";
import { accountBalancesByCurrency, isMultiCurrency } from "@/lib/balances";
import type { BalanceOverride } from "@/lib/investments";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/account-colors";
import { Button, Card, EmptyState, PageHeader, Sheet, Skeleton } from "@/components/ui";
import type { Account, AccountType } from "@/lib/types";
import type { Transaction } from "@/lib/types";

const inputCls =
  "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "investment",
  "investmentCash",
];

export function Accounts() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: txns = [] } = useTransactions();
  const overrides = useInvestmentOverrides(accounts);

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
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-20" />
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="No accounts yet"
          hint="Add a bank account, cash, or savings to start tracking balances."
        />
      ) : (
        <>
          {accounts.length > 1 && (
            <p className="mb-3 text-xs text-quill-faint">
              Drag to reorder — the top account is your default for new
              transactions.
            </p>
          )}
          <AccountList
            accounts={accounts}
            txns={txns}
            overrides={overrides}
            onEdit={setEditing}
          />
        </>
      )}

      {adding && <AddAccountSheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditAccountSheet account={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ─── Reorderable account list ─────────────────────────────────────────────────

function AccountList({
  accounts,
  txns,
  overrides,
  onEdit,
}: {
  accounts: Account[];
  txns: Transaction[];
  overrides: Map<string, BalanceOverride>;
  onEdit: (a: Account) => void;
}) {
  const reorder = useReorderAccounts();
  // Local order drives rendering during a drag; resynced when the query updates.
  const [order, setOrder] = useState<Account[]>(accounts);
  const orderRef = useRef(order);

  useEffect(() => {
    setOrder(accounts);
  }, [accounts]);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // On drop, persist only if the order actually changed from the server's.
  function commit() {
    const ids = orderRef.current.map((a) => a.id);
    const serverIds = accounts.map((a) => a.id);
    if (ids.join() !== serverIds.join()) reorder.mutate(ids);
  }

  return (
    <Reorder.Group
      axis="y"
      values={order}
      onReorder={setOrder}
      className="space-y-3"
    >
      {order.map((a, i) => (
        <AccountRow
          key={a.id}
          account={a}
          txns={txns}
          overrides={overrides}
          isDefault={i === 0}
          onEdit={onEdit}
          onCommit={commit}
        />
      ))}
    </Reorder.Group>
  );
}

/**
 * A folio per account: its heading, what it holds, how it has moved, and when
 * it was last checked against the bank. Ruled off rather than boxed.
 */
function AccountRow({
  account: a,
  txns,
  overrides,
  isDefault,
  onEdit,
  onCommit,
}: {
  account: Account;
  txns: Transaction[];
  overrides: Map<string, BalanceOverride>;
  isDefault: boolean;
  onEdit: (a: Account) => void;
  onCommit: () => void;
}) {
  const controls = useDragControls();
  const balances = accountBalancesByCurrency(a, txns, overrides);
  const multi = a.is_multi_currency || isMultiCurrency(balances);
  const isCredit = a.type === "credit";
  const owed = isCredit ? -(balances[a.currency] ?? 0) : 0;
  const available =
    isCredit && a.credit_limit != null ? a.credit_limit - owed : null;
  const currencies = [
    a.currency,
    ...Object.keys(balances).filter((c) => c !== a.currency).sort(),
  ];

  const { data: checks = [] } = useReconciliations();
  const lastCheck = checks.find((r) => r.account_id === a.id);

  // A Zenith-valued account has no local movement to trace — its worth is
  // whatever the snapshot last said.
  const externallyValued = overrides.has(a.id);

  return (
    <Reorder.Item
      value={a}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
    >
      <section className="border-b border-rule pb-4 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="flex min-w-0 items-baseline gap-2">
            <button
              type="button"
              aria-label={`Reorder ${a.name}`}
              onPointerDown={(e) => controls.start(e)}
              className="-ml-1 shrink-0 cursor-grab touch-none text-quill-faint transition-colors hover:text-quill active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
            <Link
              to={`/transactions?account=${a.id}`}
              className="truncate tracking-[0.08em] text-quill transition-colors hover:text-brass-lo"
              style={{ fontVariant: "small-caps" }}
            >
              {a.name}
            </Link>
            <span className="shrink-0 text-xs italic text-quill-faint">
              {ACCOUNT_TYPE_LABELS[a.type].toLowerCase()} · {a.currency}
            </span>
            {isDefault && (
              <span className="shrink-0 text-xs italic text-quill-faint">· default</span>
            )}
            {a.external_source === "zenith" && (
              <span className="shrink-0 text-xs italic text-head-5">· Zenith</span>
            )}
          </h2>
          <button
            onClick={() => onEdit(a)}
            aria-label={`Edit ${a.name}`}
            className="shrink-0 text-quill-faint transition-colors hover:text-quill"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            {currencies.map((c, i) => (
              <p
                key={c}
                className={cn(
                  "tnum leading-tight",
                  i === 0
                    ? isCredit
                      ? "text-2xl text-debit"
                      : "text-2xl text-quill"
                    : "text-sm text-quill-soft",
                )}
              >
                {formatMoney(balances[c] ?? 0, c)}
                {multi && <span className="ml-1 text-xs text-quill-faint">{c}</span>}
              </p>
            ))}
            {available != null && (
              <p className="text-xs italic text-quill-faint">
                {formatMoney(available, a.currency)} available
              </p>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-xs italic text-quill-faint">
          {externallyValued
            ? "Valued by Zenith"
            : lastCheck
              ? `Reconciled ${formatDate(lastCheck.date)} · ${
                  Math.abs(lastCheck.difference) < 0.005
                    ? "matched"
                    : `off by ${formatMoney(Math.abs(lastCheck.difference), a.currency)}`
                }`
              : "Never reconciled"}
        </p>
      </section>
    </Reorder.Item>
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
      <span className="mb-1 block text-xs font-medium text-quill-soft">Type</span>
      <div className="grid grid-cols-3 gap-1.5">
        {ACCOUNT_TYPES.map((t) => {
          const col = ACCOUNT_TYPE_COLORS[t];
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              className={cn(
                "h-9 rounded-[2px] border text-xs font-medium transition-colors",
                active
                  ? cn(col.border, col.bg, col.text)
                  : "border-rule text-quill-soft hover:border-rule-strong",
              )}
            >
              {t === "investmentCash"
                ? "Invest"
                : t === "credit"
                  ? "Credit"
                  : ACCOUNT_TYPE_LABELS[t]}
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
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[2px] border border-rule/60 bg-well p-3">
      <div>
        <p className="text-sm font-medium text-quill">Multi-currency account</p>
        <p className="text-xs text-quill-faint">
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
          value ? "bg-accent" : "bg-rule",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-page shadow transition-transform",
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
  const [creditLimit, setCreditLimit] = useState(
    account.credit_limit != null ? String(account.credit_limit) : "",
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  const smInput =
    "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      id: account.id,
      patch: {
        name: name.trim(),
        type,
        currency: currency.trim().toUpperCase() || account.currency,
        opening_balance: Number(opening) || 0,
        is_multi_currency: type === "credit" ? false : isMulti,
        credit_limit: type === "credit" ? Number(creditLimit) || null : null,
      },
    });
    onClose();
  }

  function handleArchive() {
    archive(account.id);
    onClose();
  }

  const isLinked = account.external_source === "zenith";

  return (
    <Sheet title="Edit account" onClose={onClose}>
        {isLinked && (
          <p className="mb-3 rounded-[2px] bg-head-5/10 px-3 py-2 text-xs text-head-5">
            Synced from Zenith — the balance mirrors your live portfolio value,
            and the name follows Zenith's. Transfers you record here move the
            other account's cash only.
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={smInput}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">
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

          {type === "credit" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">
                Credit limit (optional)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="e.g. 5000"
                className={cn(smInput, "tnum")}
              />
            </label>
          ) : (
            <MultiCurrencyToggle value={isMulti} onChange={setIsMulti} />
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-quill-soft">
              {type === "credit"
                ? "Current balance (negative = owing)"
                : isMulti
                  ? `Opening balance (${currency.toUpperCase()})`
                  : "Opening balance"}
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
            <p className="text-xs text-debit">
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

        {/* Linked accounts are valued by Zenith — nothing local to reconcile. */}
        {!isLinked && <ReconcileSection account={account} />}

        <div className="mt-3 border-t border-rule pt-3">
          {confirmArchive ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-quill-soft">Archive this account?</p>
              <button
                onClick={() => setConfirmArchive(false)}
                className="text-xs text-quill-soft hover:text-quill"
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
              className="flex w-full items-center justify-center gap-2 text-xs text-quill-faint transition-colors hover:text-debit"
            >
              Archive account
            </button>
          )}
        </div>
    </Sheet>
  );
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Statement check: type what the bank shows, Estuary compares it against its
 * computed balance and stores the checkpoint — drift gets caught monthly
 * instead of a year later. Multi-currency accounts reconcile their primary
 * currency.
 */
function ReconcileSection({ account }: { account: Account }) {
  const { data: txns = [] } = useTransactions();
  const { data: checks = [] } = useReconciliations();
  const create = useCreateReconciliation();

  const [stated, setStated] = useState("");

  const computed =
    accountBalancesByCurrency(account, txns)[account.currency] ?? 0;
  const last = checks.find((r) => r.account_id === account.id);
  const justSaved = create.data?.account_id === account.id ? create.data : null;
  const shown = justSaved ?? last;

  async function reconcile() {
    const bank = Number(stated);
    if (!Number.isFinite(bank)) return;
    await create.mutateAsync({
      account_id: account.id,
      date: todayISO(),
      stated_balance: bank,
      computed_balance: computed,
      difference: bank - computed,
    });
    setStated("");
  }

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-quill-soft">Reconcile with your bank</p>
        {shown && (
          <p
            className={cn(
              "tnum text-xs",
              Math.abs(shown.difference) < 0.005 ? "text-accent" : "text-head-3",
            )}
          >
            {formatDate(shown.date)} ·{" "}
            {Math.abs(shown.difference) < 0.005
              ? "matched"
              : `off by ${formatMoney(Math.abs(shown.difference), account.currency)}`}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={stated}
          onChange={(e) => setStated(e.target.value)}
          placeholder={`Bank shows… (${account.currency})`}
          className="tnum h-9 flex-1 rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={reconcile}
          disabled={stated.trim() === "" || create.isPending}
          className="shrink-0"
        >
          {create.isPending ? "Checking…" : "Check"}
        </Button>
      </div>
      <p className="tnum mt-1.5 text-xs text-quill-faint">
        Estuary computes {formatMoney(computed, account.currency)}
        {stated.trim() !== "" && Number.isFinite(Number(stated)) && (
          <>
            {" "}· difference{" "}
            {formatMoney(Number(stated) - computed, account.currency)}
          </>
        )}
      </p>
    </div>
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
  const [creditLimit, setCreditLimit] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      type,
      currency: currency.trim().toUpperCase(),
      opening_balance: Number(opening) || 0,
      is_multi_currency: type === "credit" ? false : isMulti,
      credit_limit: type === "credit" ? Number(creditLimit) || null : null,
    });
    onClose();
  }

  return (
    <Sheet title="New account" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Everyday Checking"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">
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

          {type === "credit" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">
                Credit limit (optional)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="e.g. 5000"
                className={cn(inputCls, "tnum")}
              />
            </label>
          ) : (
            <MultiCurrencyToggle value={isMulti} onChange={setIsMulti} />
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-quill-soft">
              {type === "credit"
                ? "Current balance (negative = owing)"
                : isMulti
                  ? `Opening balance (${currency.toUpperCase()})`
                  : "Opening balance"}
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
            <p className="text-xs text-debit">
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
