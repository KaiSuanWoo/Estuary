import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ChevronDown, Plus, Receipt, Search, X } from "lucide-react";
import { useTransactions, useReimbursedAmountMap } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories, useCategoryMap } from "@/hooks/useCategories";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { convert } from "@/lib/fx";
import { dayLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACCOUNT_TYPE_COLORS } from "@/lib/account-colors";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { FloatingAdd } from "./Dashboard";
import type { Transaction, TransactionType, Category } from "@/lib/types";

// ─── filter types & constants ─────────────────────────────────────────────────

type ActivePanel = "type" | "account" | "date" | "category" | null;
type DateMode = "all" | "this_month" | "last_month" | "last_3m" | "custom";

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
];

const DATE_MODES: { value: DateMode; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3m", label: "3 months" },
  { value: "custom", label: "Custom range" },
];

// ─── pure helpers ─────────────────────────────────────────────────────────────

function getDateBounds(
  mode: DateMode,
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (mode === "all") return null;
  if (mode === "custom") {
    if (!from && !to) return null;
    return { from: from || "0001-01-01", to: to || "9999-12-31" };
  }
  const today = new Date();
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  if (mode === "this_month") return { from: f(startOfMonth(today)), to: f(today) };
  if (mode === "last_month") {
    const last = subMonths(today, 1);
    return { from: f(startOfMonth(last)), to: f(endOfMonth(last)) };
  }
  // last_3m
  return { from: f(startOfMonth(subMonths(today, 2))), to: f(today) };
}

function typeLabel(filters: Set<TransactionType>): string {
  if (filters.size === 0) return "Type";
  if (filters.size === 1) {
    const t = [...filters][0]!;
    return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
  }
  return `${filters.size} types`;
}

function accountLabel(
  filters: Set<string>,
  accounts: { id: string; name: string }[],
): string {
  if (filters.size === 0) return "Account";
  if (filters.size === 1)
    return accounts.find((a) => a.id === [...filters][0])?.name ?? "Account";
  return `${filters.size} accounts`;
}

function categoryLabel(
  filters: Set<string>,
  catMap: Map<string, Category>,
): string {
  if (filters.size === 0) return "Category";
  if (filters.size === 1)
    return catMap.get([...filters][0]!)?.name ?? "Category";
  return `${filters.size} categories`;
}

function dateLabel(mode: DateMode, from: string, to: string): string {
  if (mode === "all") return "Date";
  if (mode === "this_month") return "This month";
  if (mode === "last_month") return "Last month";
  if (mode === "last_3m") return "3 months";
  // custom
  const s = (iso: string) => format(parseISO(iso), "d MMM");
  if (from && to) return `${s(from)} – ${s(to)}`;
  if (from) return `From ${s(from)}`;
  if (to) return `To ${s(to)}`;
  return "Custom";
}

// ─── small UI pieces ──────────────────────────────────────────────────────────

/** The top-level filter chip — shows current selection, opens/closes a panel. */
function FilterChip({
  label,
  active,
  open,
  onClick,
  dotColor,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onClick: () => void;
  /** Optional bg-* class for a coloured type dot shown before the label. */
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        open
          ? "border-teal-500 bg-teal-500/10 text-teal-300"
          : active
            ? "border-teal-500/50 bg-teal-500/5 text-teal-400"
            : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200",
      )}
    >
      {dotColor && (
        <span className={cn("size-2 shrink-0 rounded-full", dotColor)} />
      )}
      {label}
      <ChevronDown
        className={cn("size-3 transition-transform", open && "-rotate-180")}
      />
    </button>
  );
}

/** A selectable option chip inside a filter panel. */
function OptionChip({
  label,
  selected,
  onClick,
  dotColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Optional bg-* class for a coloured type dot shown before the label. */
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        selected
          ? "border-teal-500 bg-teal-500/10 text-teal-300"
          : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200",
      )}
    >
      {dotColor && (
        <span className={cn("size-2 shrink-0 rounded-full", dotColor)} />
      )}
      {label}
    </button>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export function Transactions() {
  // URL param must be read before the useState that references it
  const [searchParams] = useSearchParams();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Multi-select filters — empty Set means "all" (no restriction)
  const [typeFilters, setTypeFilters] = useState<Set<TransactionType>>(new Set());
  const [accountFilters, setAccountFilters] = useState<Set<string>>(() => {
    const param = searchParams.get("account");
    return param ? new Set([param]) : new Set();
  });
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());

  // Date filter — preset period or custom range
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data, isLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const categories = useCategoryMap();
  const { data: allCategories = [] } = useCategories();
  const reimbursedMap = useReimbursedAmountMap();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const reimbursedInTxCurrency = useMemo(() => {
    const out = new Map<string, number>();
    for (const tx of data ?? []) {
      const base = reimbursedMap.get(tx.id);
      if (!base) continue;
      out.set(tx.id, convert(base, baseCurrency, tx.currency, rates) ?? base);
    }
    return out;
  }, [data, reimbursedMap, baseCurrency, rates]);

  // Scope category options to the active type selection
  const visibleCategories = useMemo(() => {
    const active = allCategories.filter((c) => !c.is_archived);
    if (typeFilters.size === 0) return active;
    const exp = typeFilters.has("expense");
    const inc = typeFilters.has("income");
    if (exp && inc) return active;
    if (exp) return active.filter((c) => c.kind === "expense");
    if (inc) return active.filter((c) => c.kind === "income");
    return []; // only transfers/adjustments — no categories
  }, [allCategories, typeFilters]);

  // ── toggle helpers ────────────────────────────────────────────────────────────
  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function toggleType(v: TransactionType) {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  function toggleAccount(id: string) {
    setAccountFilters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCategory(id: string) {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── filtered list ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let txns = data ?? [];
    if (typeFilters.size > 0)
      txns = txns.filter((t) => typeFilters.has(t.type));
    if (accountFilters.size > 0)
      txns = txns.filter(
        (t) =>
          accountFilters.has(t.account_id) ||
          (t.destination_account_id != null &&
            accountFilters.has(t.destination_account_id)),
      );
    if (categoryFilters.size > 0)
      txns = txns.filter(
        (t) => t.category_id != null && categoryFilters.has(t.category_id),
      );
    const bounds = getDateBounds(dateMode, customFrom, customTo);
    if (bounds)
      txns = txns.filter((t) => t.date >= bounds.from && t.date <= bounds.to);
    if (search.trim()) {
      const q = search.toLowerCase();
      txns = txns.filter(
        (t) =>
          t.merchant?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q) ||
          (t.category_id &&
            categories.get(t.category_id)?.name.toLowerCase().includes(q)),
      );
    }
    return txns;
  }, [
    data,
    typeFilters,
    accountFilters,
    categoryFilters,
    dateMode,
    customFrom,
    customTo,
    search,
    categories,
  ]);

  const groups = groupByDay(filtered);
  const total = (data ?? []).length;
  const hasData = total > 0;

  // Dot colour for the account FilterChip when exactly one account is selected
  const singleAccountDot =
    accountFilters.size === 1
      ? ACCOUNT_TYPE_COLORS[
          accounts.find((a) => a.id === [...accountFilters][0])?.type ??
            "checking"
        ]?.dot
      : undefined;

  const isDateActive =
    dateMode !== "all" && !(dateMode === "custom" && !customFrom && !customTo);
  const hasFilters =
    search.trim() !== "" ||
    typeFilters.size > 0 ||
    accountFilters.size > 0 ||
    categoryFilters.size > 0 ||
    isDateActive;

  function clearAll() {
    setSearch("");
    setTypeFilters(new Set());
    setAccountFilters(new Set());
    setCategoryFilters(new Set());
    setDateMode("all");
    setCustomFrom("");
    setCustomTo("");
    setActivePanel(null);
  }

  const dateInputCls =
    "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 focus:border-teal-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Activity"
        action={
          <Button
            className="hidden lg:inline-flex"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" /> New
          </Button>
        }
      />

      {hasData && (
        <div className="mb-4 space-y-2">
          {/* ── Search ── */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
            <input
              type="search"
              placeholder="Search transactions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-ink-700 bg-ink-900/60 pl-9 pr-9 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* ── Filter chips row ── */}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <FilterChip
                label={typeLabel(typeFilters)}
                active={typeFilters.size > 0}
                open={activePanel === "type"}
                onClick={() => togglePanel("type")}
              />
              {accounts.length > 1 && (
                <FilterChip
                  label={accountLabel(accountFilters, accounts)}
                  active={accountFilters.size > 0}
                  open={activePanel === "account"}
                  onClick={() => togglePanel("account")}
                  dotColor={singleAccountDot}
                />
              )}
              <FilterChip
                label={dateLabel(dateMode, customFrom, customTo)}
                active={isDateActive}
                open={activePanel === "date"}
                onClick={() => togglePanel("date")}
              />
              {visibleCategories.length > 0 && (
                <FilterChip
                  label={categoryLabel(categoryFilters, categories)}
                  active={categoryFilters.size > 0}
                  open={activePanel === "category"}
                  onClick={() => togglePanel("category")}
                />
              )}
            </div>

            {/* Clear-all × — appears only when any filter is active */}
            {hasFilters && (
              <button
                onClick={clearAll}
                aria-label="Clear all filters"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink-700 text-ink-500 transition-colors hover:border-ink-600 hover:text-ink-200"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* ── Active filter panel ── */}

          {activePanel === "type" && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/90 p-3">
              <div className="flex flex-wrap gap-2">
                <OptionChip
                  label="All"
                  selected={typeFilters.size === 0}
                  onClick={() => setTypeFilters(new Set())}
                />
                {TYPE_OPTIONS.map(({ value, label }) => (
                  <OptionChip
                    key={value}
                    label={label}
                    selected={typeFilters.has(value)}
                    onClick={() => toggleType(value)}
                  />
                ))}
              </div>
            </div>
          )}

          {activePanel === "account" && accounts.length > 1 && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/90 p-3">
              <div className="flex flex-wrap gap-2">
                <OptionChip
                  label="All accounts"
                  selected={accountFilters.size === 0}
                  onClick={() => setAccountFilters(new Set())}
                />
                {accounts.map((a) => (
                  <OptionChip
                    key={a.id}
                    label={`${a.name} (${a.currency})`}
                    selected={accountFilters.has(a.id)}
                    onClick={() => toggleAccount(a.id)}
                    dotColor={ACCOUNT_TYPE_COLORS[a.type].dot}
                  />
                ))}
              </div>
            </div>
          )}

          {activePanel === "date" && (
            <div className="space-y-3 rounded-xl border border-ink-700/60 bg-ink-900/90 p-3">
              <div className="flex flex-wrap gap-2">
                {DATE_MODES.map(({ value, label }) => (
                  <OptionChip
                    key={value}
                    label={label}
                    selected={dateMode === value}
                    onClick={() => setDateMode(value)}
                  />
                ))}
              </div>
              {dateMode === "custom" && (
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs text-ink-600">From</span>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className={dateInputCls}
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 block text-xs text-ink-600">To</span>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className={dateInputCls}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {activePanel === "category" && visibleCategories.length > 0 && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/90 p-3">
              <div className="flex flex-wrap gap-2">
                <OptionChip
                  label="All categories"
                  selected={categoryFilters.size === 0}
                  onClick={() => setCategoryFilters(new Set())}
                />
                {visibleCategories.map((c) => (
                  <OptionChip
                    key={c.id}
                    label={c.name}
                    selected={categoryFilters.has(c.id)}
                    onClick={() => toggleCategory(c.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Result count — visible when any filter is active */}
          {hasFilters && (
            <p className="text-right text-xs text-ink-600">
              {filtered.length === total
                ? `${filtered.length} transactions`
                : `${filtered.length} of ${total} transactions`}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : !hasData ? (
        <EmptyState
          icon={<Receipt className="size-6" />}
          title="Nothing here yet"
          hint="Your transactions will appear here, newest first."
        />
      ) : groups.length === 0 ? (
        <div>
          <EmptyState
            icon={<Search className="size-6" />}
            title="No matches"
            hint="Try a different search or filter."
          />
          {hasFilters && (
            <button
              onClick={clearAll}
              className="mt-3 w-full text-center text-sm text-teal-400 hover:text-teal-300"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, txns]) => (
            <section key={day}>
              <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {dayLabel(day)}
              </h2>
              <Card className="divide-y divide-ink-800/70 py-0">
                {txns.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    categoryName={
                      tx.category_id
                        ? categories.get(tx.category_id)?.name
                        : undefined
                    }
                    accountName={accountMap.get(tx.account_id)}
                    toAccountName={
                      tx.destination_account_id
                        ? accountMap.get(tx.destination_account_id)
                        : undefined
                    }
                    reimbursedAmount={reimbursedInTxCurrency.get(tx.id)}
                    onClick={() => setEditing(tx)}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <FloatingAdd onClick={() => setAdding(true)} />
      {adding && <AddTransactionSheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/** Preserve the query's date-desc order while bucketing into days. */
function groupByDay(txns: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const tx of txns) {
    const list = map.get(tx.date);
    if (list) list.push(tx);
    else map.set(tx.date, [tx]);
  }
  return [...map.entries()];
}
