import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  "h-9 w-full rounded-xl border border-rule bg-ink-950/60 px-3 text-sm text-quill placeholder:text-quill-faint focus:border-teal-500 focus:outline-none";

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
  const col = ACCOUNT_TYPE_COLORS[a.type];
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
  // whatever the snapshot last said, so a line drawn from transactions would
  // be a flat lie.
  const externallyValued = overrides.has(a.id);
  const series = useMemo(
    () => (externallyValued ? [] : dailyBalances(a, txns, 30)),
    [a, txns, externallyValued],
  );

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

          {/* A flat line says "no movement" less clearly than nothing does. */}
          {series.length > 1 && Math.min(...series) !== Math.max(...series) && (
            <Sparkline points={series} className={col.text} />
          )}
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

/**
 * Daily closing balance for the last `days` days, in the account's own
 * currency. Walks forward from the opening balance so each day records where
 * the account actually stood.
 */
function dailyBalances(account: Account, txns: Transaction[], days: number): number[] {
  const effect = (t: Transaction): number => {
    if (t.destination_account_id === account.id && t.type === "transfer")
      return t.destination_amount ?? t.amount;
    if (t.account_id !== account.id) return 0;
    if (t.type === "income" || t.type === "adjustment") return t.amount;
    return -t.amount;
  };

  const mine = txns
    .filter((t) => t.account_id === account.id || t.destination_account_id === account.id)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  // Everything before the window collapses into the opening figure.
  let running = account.opening_balance;
  const byDay = new Map<string, number>();
  for (const t of mine) {
    running += effect(t);
    if (t.date >= cutoffISO) byDay.set(t.date, running);
  }

  const out: number[] = [];
  let last = account.opening_balance;
  for (const t of mine) {
    if (t.date >= cutoffISO) break;
    last += effect(t);
  }
  for (let i = 0; i <= days; i++) {
    const d = new Date(cutoff);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (byDay.has(iso)) last = byDay.get(iso)!;
    out.push(last);
  }
  return out;
}

/** A plain polyline — no chart library, so nothing can fail to animate in. */
function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const w = 96;
  const h = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.75" />
    </svg>
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
                "h-9 rounded-xl border text-xs font-medium transition-colors",
                active
                  ? cn(col.border, col.bg, col.text)
                  : "border-rule text-quill-soft hover:border-rule",
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
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-rule/60 bg-ink-950/30 p-3">
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
  const [creditLimit, setCreditLimit] = useState(
    account.credit_limit != null ? String(account.credit_limit) : "",
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  const smInput =
    "h-9 w-full rounded-xl border border-rule bg-ink-950/60 px-3 text-sm text-quill placeholder:text-quill-faint focus:border-teal-500 focus:outline-none";

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
          <p className="mb-3 rounded-xl bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
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
              className="flex w-full items-center justify-center gap-2 text-xs text-quill-faint transition-colors hover:text-red-400"
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
              Math.abs(shown.difference) < 0.005 ? "text-teal-400" : "text-amber-400",
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
          className="tnum h-9 flex-1 rounded-xl border border-rule bg-ink-950/60 px-3 text-sm text-quill placeholder:text-quill-faint focus:border-teal-500 focus:outline-none"
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
