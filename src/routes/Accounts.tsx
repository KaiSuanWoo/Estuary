import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Archive, GripVertical, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import {
  useAccounts,
  useArchivedAccounts,
  useAccountUsage,
  useCreateAccount,
  useUpdateAccount,
  useArchiveAccount,
  useRestoreAccount,
  useDeleteAccount,
  useReorderAccounts,
} from "@/hooks/useAccounts";
import { useBalancesByAccount } from "@/hooks/useAccountBalances";
import {
  useReconciliations,
  useCreateReconciliation,
} from "@/hooks/useReconciliations";
import { useInvestmentOverrides } from "@/hooks/useInvestmentSnapshot";
import { isMultiCurrency } from "@/lib/balances";
import {
  usePocketsByAccount,
  useAddPocket,
  useUpdatePocket,
  useRemovePocket,
} from "@/hooks/useAccountCurrencies";
import type { BalanceOverride } from "@/lib/investments";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/account-colors";
import { Button, Card, EmptyState, PageHeader, Sheet, Skeleton } from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";
import type { Account, AccountType, AccountUsage } from "@/lib/types";

const inputCls =
  "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

// Credit belongs here: the label, the ink, the `credit_limit` field and the
// available-balance maths all existed for it, but it was missing from the one
// list that decides what you can actually create.
const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "trading",
  "credit",
  "investment",
];

export function Accounts() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: archived = [] } = useArchivedAccounts();
  const overrides = useInvestmentOverrides(accounts);
  const balancesByAccount = useBalancesByAccount(overrides);

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
            balancesByAccount={balancesByAccount}
            overrides={overrides}
            onEdit={setEditing}
          />
        </>
      )}

      {/* Closed accounts are still part of the record — the ledger keeps their
          entries — so they get a way back to them rather than a tab competing
          with the live list for the top of the page. */}
      {archived.length > 0 && (
        <button
          type="button"
          onClick={() => setShowArchive(true)}
          className="tap mt-5 flex w-full items-center justify-center gap-2 border-t border-rule pt-4 text-xs italic text-quill-faint transition-colors hover:text-quill"
        >
          <Archive className="size-3.5" />
          Archived accounts
          <span className="tnum not-italic">({archived.length})</span>
        </button>
      )}

      {adding && <AddAccountSheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditAccountSheet account={editing} onClose={() => setEditing(null)} />
      )}
      {showArchive && (
        <ArchivedAccountsSheet
          accounts={archived}
          balancesByAccount={balancesByAccount}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}

// ─── Archive ──────────────────────────────────────────────────────────────────

/**
 * The closed accounts, with a way to reopen one or remove it for good.
 *
 * Archiving and deleting are not two strengths of the same action. Archiving
 * hides an account and keeps every entry booked to it, so the months it was
 * open still add up. Deleting cascades: the entries go too, and a transfer that
 * landed here keeps its outgoing leg and loses the incoming one — money leaves
 * the funding account and arrives nowhere. So the confirmation names the cost
 * in rows before it offers the button.
 */
function ArchivedAccountsSheet({
  accounts,
  balancesByAccount,
  onClose,
}: {
  accounts: Account[];
  balancesByAccount: Map<string, Record<string, number>>;
  onClose: () => void;
}) {
  const usage = useAccountUsage();
  const restore = useRestoreAccount();
  const del = useDeleteAccount();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Sheet title="Archived accounts" onClose={onClose}>
      <p className="mb-3 text-xs text-quill-faint">
        Hidden from the accounts list, the pickers and net worth. Their entries
        are still in the ledger and still count towards past months.
      </p>

      {accounts.length === 0 && (
        <p className="py-6 text-center text-sm italic text-quill-faint">
          Nothing archived.
        </p>
      )}

      <ul className="divide-y divide-rule">
        {accounts.map((a) => (
          <ArchivedRow
            key={a.id}
            account={a}
            balances={balancesByAccount.get(a.id) ?? {}}
            usage={usage.get(a.id)}
            confirming={confirming === a.id}
            onConfirm={() => setConfirming(a.id)}
            onCancel={() => setConfirming(null)}
            onRestore={() => restore(a.id)}
            onDelete={() => del.mutate(a.id)}
            deleting={del.isPending}
          />
        ))}
      </ul>

      {del.isError && (
        <p className="mt-3 text-xs text-debit">
          Couldn't delete. {(del.error as Error).message}
        </p>
      )}
    </Sheet>
  );
}

function ArchivedRow({
  account: a,
  balances,
  usage,
  confirming,
  onConfirm,
  onCancel,
  onRestore,
  onDelete,
  deleting,
}: {
  account: Account;
  balances: Record<string, number>;
  usage: AccountUsage | undefined;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const own = usage?.transaction_count ?? 0;
  const incoming = usage?.incoming_transfer_count ?? 0;
  const isLinked = a.external_source === "zenith";
  const held = Object.entries(balances).filter(([, v]) => Math.abs(v) >= 0.005);

  // What the account is carrying, in one line: how many entries and over what
  // span. An empty shell says so plainly — it is the one safe thing to delete.
  const history =
    own === 0
      ? "No entries"
      : `${own} ${own === 1 ? "entry" : "entries"}${
          usage?.first_entry && usage.last_entry
            ? ` · ${formatDate(usage.first_entry)} – ${formatDate(usage.last_entry)}`
            : ""
        }`;

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex min-w-0 items-baseline gap-2">
          <span
            className="truncate tracking-[0.08em] text-quill"
            style={{ fontVariant: "small-caps" }}
          >
            {a.name}
          </span>
          <span className="shrink-0 text-xs italic text-quill-faint">
            {ACCOUNT_TYPE_LABELS[a.type].toLowerCase()} · {a.currency}
          </span>
          {isLinked && (
            <span className="shrink-0 text-xs italic text-head-5">· Zenith</span>
          )}
        </p>
        {held.length > 0 && (
          <span className="tnum shrink-0 text-sm text-quill-soft">
            {held.map(([c, v]) => formatMoney(v, c)).join(" · ")}
          </span>
        )}
      </div>

      <p className="mt-0.5 text-xs italic text-quill-faint">{history}</p>

      {confirming ? (
        <div className="mt-2 rounded-[2px] border border-debit/40 bg-debit/5 p-2.5">
          <p className="text-xs text-quill-soft">
            {own === 0 && incoming === 0 ? (
              <>Delete {a.name}? It holds no entries, so nothing else changes.</>
            ) : (
              <>
                Deleting {a.name} also deletes{" "}
                <strong className="text-quill">
                  {own} {own === 1 ? "entry" : "entries"}
                </strong>
                {incoming > 0 && (
                  <>
                    {" "}
                    and strands{" "}
                    <strong className="text-quill">
                      {incoming} transfer{incoming === 1 ? "" : "s"}
                    </strong>{" "}
                    into it — the money will leave the funding account and
                    arrive nowhere
                  </>
                )}
                . Past months will change. This can't be undone.
              </>
            )}
          </p>
          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-quill-soft hover:text-quill"
            >
              Cancel
            </button>
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete for good"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-4">
          <button
            type="button"
            onClick={onRestore}
            className="tap text-xs text-quill-faint transition-colors hover:text-quill"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="tap text-xs text-quill-faint transition-colors hover:text-debit"
          >
            Delete
          </button>
          {isLinked && (
            <span className="text-xs italic text-quill-faint">
              Zenith still reports this — the next sync restores it
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Reorderable account list ─────────────────────────────────────────────────

function AccountList({
  accounts,
  balancesByAccount,
  overrides,
  onEdit,
}: {
  accounts: Account[];
  balancesByAccount: Map<string, Record<string, number>>;
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
          balances={balancesByAccount.get(a.id) ?? {}}
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
  balances,
  overrides,
  isDefault,
  onEdit,
  onCommit,
}: {
  account: Account;
  /** Straight from the `account_balances` view, Zenith override applied. */
  balances: Record<string, number>;
  overrides: Map<string, BalanceOverride>;
  isDefault: boolean;
  onEdit: (a: Account) => void;
  onCommit: () => void;
}) {
  const controls = useDragControls();
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
  // Checks are per pocket now, so "reconciled" means every currency held has
  // been checked — a Wise whose AUD matches while its GBP has never been
  // looked at is not reconciled.
  const myChecks = checks.filter((r) => r.account_id === a.id);
  const lastCheck = myChecks.find((r) => r.currency === a.currency) ?? myChecks[0];
  const checkedCurrencies = new Set(myChecks.map((r) => r.currency));
  const unchecked = currencies.filter((c) => !checkedCurrencies.has(c));

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
              className="tap -ml-1 shrink-0 cursor-grab touch-none text-quill-faint transition-colors hover:text-quill active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
            <Link
              to={`/transactions?account=${a.id}`}
              className="tap truncate tracking-[0.08em] text-quill transition-colors hover:text-brass-lo"
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
            className="tap shrink-0 text-quill-faint transition-colors hover:text-quill"
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
                    : `off by ${formatMoney(Math.abs(lastCheck.difference), lastCheck.currency)}`
                }${
                  unchecked.length > 0
                    ? ` · ${unchecked.join(", ")} never checked`
                    : ""
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
              {/* "Credit card" is the only label too long for a third of the
                  row; every other type reads as itself. Shortening one of a
                  pair to "Invest" beside "Investment" is what made them look
                  like the same type twice. */}
              {t === "credit" ? "Credit" : ACCOUNT_TYPE_LABELS[t]}
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
  const pockets = usePocketsByAccount().get(account.id) ?? [];
  const updatePocket = useUpdatePocket();
  const addPocket = useAddPocket();
  const [creditLimit, setCreditLimit] = useState(
    account.credit_limit != null ? String(account.credit_limit) : "",
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  const smInput =
    "h-9 w-full rounded-[2px] border border-rule bg-well px-3 text-sm text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextCurrency = currency.trim().toUpperCase() || account.currency;
    const nextOpening = Number(opening) || 0;
    await update.mutateAsync({
      id: account.id,
      patch: {
        name: name.trim(),
        type,
        currency: nextCurrency,
        opening_balance: nextOpening,
        is_multi_currency: type === "credit" ? false : isMulti,
        credit_limit: type === "credit" ? Number(creditLimit) || null : null,
      },
    });
    // Balances read pockets, so the single opening field has to land on the
    // primary pocket or it would edit a number nothing looks at. A
    // multi-currency account edits its pockets directly and skips this.
    if (!isMulti || type === "credit") {
      const primary = pockets.find((x) => x.currency === nextCurrency);
      if (primary) {
        if (Number(primary.opening_balance) !== nextOpening)
          await updatePocket.mutateAsync({
            id: primary.id,
            patch: { opening_balance: nextOpening },
          });
      } else {
        await addPocket.mutateAsync({
          account_id: account.id,
          currency: nextCurrency,
          opening_balance: nextOpening,
        });
      }
    }
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

          {isMulti && type !== "credit" ? (
            <PocketRegister account={account} />
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-quill-soft">
                {type === "credit"
                  ? "Current balance (negative = owing)"
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
          )}

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
              <p className="flex-1 text-xs text-quill-soft">
                {isLinked
                  ? "Zenith still reports this account — the next sync will bring it back. Archive anyway?"
                  : "Archive this account?"}
              </p>
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

/**
 * The currencies an account holds, each with its own opening figure.
 *
 * A pocket is a declaration, not a consequence: it exists because there is a
 * row, so a Wise can hold GBP at 0.00 from the day you open it and state what
 * was already in each currency when you started tracking. The primary pocket
 * cannot be removed — it is the account's own currency.
 */
function PocketRegister({ account }: { account: Account }) {
  const pockets = usePocketsByAccount().get(account.id) ?? [];
  const add = useAddPocket();
  const update = useUpdatePocket();
  const remove = useRemovePocket();
  const [adding, setAdding] = useState("");

  const held = new Set(pockets.map((p) => p.currency));
  const available = CURRENCIES.filter((c) => !held.has(c));
  const ordered = [...pockets].sort((a, b) =>
    a.currency === account.currency ? -1 : b.currency === account.currency ? 1 : a.currency.localeCompare(b.currency),
  );

  return (
    <div className="rounded-[2px] border border-rule/60 bg-well p-3">
      <p className="mb-1 text-xs font-medium text-quill-soft">Currencies held</p>
      <p className="mb-2 text-xs italic text-quill-faint">
        Opening balance per currency — what was in each the day you started.
      </p>

      {ordered.map((p) => {
        const primary = p.currency === account.currency;
        return (
          <div key={p.id} className="flex items-center gap-2 border-b border-rule py-1.5 last:border-b-0">
            <span className="w-12 shrink-0 text-sm text-quill">{p.currency}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              defaultValue={String(p.opening_balance)}
              aria-label={`Opening balance in ${p.currency}`}
              onBlur={(e) => {
                const next = Number(e.target.value) || 0;
                if (next !== Number(p.opening_balance))
                  update.mutate({ id: p.id, patch: { opening_balance: next } });
              }}
              className={cn(inputCls, "tnum h-8 flex-1")}
            />
            {primary ? (
              <span className="w-16 shrink-0 text-right text-[0.65rem] italic text-quill-faint">
                primary
              </span>
            ) : (
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                aria-label={`Remove the ${p.currency} balance`}
                className="tap w-16 shrink-0 text-right text-xs italic text-quill-faint transition-colors hover:text-debit"
              >
                remove
              </button>
            )}
          </div>
        );
      })}

      {available.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            aria-label="Currency to add"
            className={cn(inputCls, "h-8 w-24 shrink-0")}
          >
            <option value="">Add…</option>
            {available.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!adding || add.isPending}
            onClick={() => {
              if (!adding) return;
              add.mutate(
                { account_id: account.id, currency: adding, display_order: pockets.length },
                { onSuccess: () => setAdding("") },
              );
            }}
          >
            Add currency
          </Button>
        </div>
      )}
    </div>
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
  const { data: checks = [] } = useReconciliations();
  const create = useCreateReconciliation();

  const pockets = usePocketsByAccount().get(account.id) ?? [];
  // The same figure the list shows. A check that compared the statement
  // against a separately derived number could disagree with the balance on
  // screen, which would make the drift it reports meaningless.
  const balances = useBalancesByAccount().get(account.id) ?? {};

  // A statement states a balance in one currency, so a check is against one
  // pocket. The primary leads; the rest follow in the order they are held.
  const held = pockets.length
    ? [...pockets]
        .filter((p) => !p.is_archived)
        .map((p) => p.currency)
        .sort((x, y) =>
          x === account.currency ? -1 : y === account.currency ? 1 : x.localeCompare(y),
        )
    : [account.currency];

  const [currency, setCurrency] = useState(account.currency);
  const [stated, setStated] = useState("");
  const active = held.includes(currency) ? currency : held[0] ?? account.currency;

  const computed = balances[active] ?? 0;
  const last = checks.find(
    (r) => r.account_id === account.id && r.currency === active,
  );
  const justSaved =
    create.data?.account_id === account.id && create.data?.currency === active
      ? create.data
      : null;
  const shown = justSaved ?? last;

  async function reconcile() {
    const bank = Number(stated);
    if (!Number.isFinite(bank)) return;
    await create.mutateAsync({
      account_id: account.id,
      currency: active,
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
          <p className="tnum text-xs text-accent">
            {formatDate(shown.date)} ·{" "}
            {Math.abs(shown.difference) < 0.005
              ? "matched"
              : `off by ${formatMoney(Math.abs(shown.difference), active)}`}
          </p>
        )}
      </div>

      {/* Only worth asking which pocket when there is more than one. */}
      {held.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {held.map((c) => {
            const check = checks.find(
              (r) => r.account_id === account.id && r.currency === c,
            );
            const matched = check ? Math.abs(check.difference) < 0.005 : null;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={c === active}
                onClick={() => {
                  setCurrency(c);
                  setStated("");
                }}
                className={cn(
                  "tap flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs transition-colors",
                  c === active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-quill-soft hover:border-rule-strong hover:text-quill",
                )}
              >
                {c}
                {/* A pocket never checked is worth seeing at a glance. */}
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    matched === null
                      ? "bg-rule-strong"
                      : matched
                        ? "bg-credit"
                        : "bg-debit",
                  )}
                />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={stated}
          onChange={(e) => setStated(e.target.value)}
          placeholder={`Bank shows… (${active})`}
          aria-label={`Balance your bank shows in ${active}`}
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
        Estuary computes {formatMoney(computed, active)}
        {stated.trim() !== "" && Number.isFinite(Number(stated)) && (
          <>
            {" "}· difference {formatMoney(Number(stated) - computed, active)}
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
