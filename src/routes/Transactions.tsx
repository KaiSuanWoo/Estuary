import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useReimbursedAmountMap } from "@/hooks/useTransactions";
import {
  PAGE_SIZE,
  useInfiniteTransactions,
  usePagedTransactions,
  useTransactionSearch,
  type ActivityFilters,
} from "@/hooks/usePagedTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useTags, useAllTransactionTags } from "@/hooks/useTags";
import { useCategories, useCategoryMap } from "@/hooks/useCategories";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { convert } from "@/lib/fx";
import { dayLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  listContainerVariants,
  listItemVariants,
  useReducedMotion,
} from "@/lib/motion";
import { ACCOUNT_TYPE_COLORS } from "@/lib/account-colors";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SkeletonRow,
  Spinner,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { FloatingAdd } from "./Dashboard";
import type { Transaction, TransactionType, Category } from "@/lib/types";

// ─── filter types & constants ─────────────────────────────────────────────────

type ActivePanel = "type" | "account" | "date" | "category" | "tag" | null;
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

function tagLabel(
  filters: Set<string>,
  tagMap: Map<string, string>,
): string {
  if (filters.size === 0) return "Tag";
  if (filters.size === 1) return `#${tagMap.get([...filters][0]!) ?? "tag"}`;
  return `${filters.size} tags`;
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

/** Desktop page navigator. Windowed numbers around the current page. */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  // Show a small window of page numbers around the current page.
  const window = 2;
  const start = Math.max(0, Math.min(page - window, pageCount - (window * 2 + 1)));
  const end = Math.min(pageCount, start + window * 2 + 1);
  const nums = [];
  for (let i = start; i < end; i++) nums.push(i);

  const navBtn =
    "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      className="mt-6 flex items-center justify-center gap-1.5"
      aria-label="Pagination"
    >
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        aria-label="Previous page"
        className={cn(navBtn, "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100")}
      >
        <ChevronLeft className="size-4" />
      </button>
      {start > 0 && <span className="px-1 text-sm text-ink-600">…</span>}
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onPage(n)}
          aria-current={n === page ? "page" : undefined}
          className={cn(
            navBtn,
            n === page
              ? "border-teal-500 bg-teal-500/10 text-teal-300"
              : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100",
          )}
        >
          {n + 1}
        </button>
      ))}
      {end < pageCount && <span className="px-1 text-sm text-ink-600">…</span>}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label="Next page"
        className={cn(navBtn, "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100")}
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/** A loading placeholder: a couple of day-group cards full of skeleton rows. */
function ListSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1].map((g) => (
        <section key={g}>
          <div className="mb-1 h-3 w-24 px-1">
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <Card className="divide-y divide-ink-800/70 py-0">
            {[0, 1, 2].map((r) => (
              <SkeletonRow key={r} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export function Transactions() {
  // URL param must be read before the useState that references it
  const [searchParams] = useSearchParams();
  const reduce = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [page, setPage] = useState(0);

  // Reveal the floating search button once the top search bar has scrolled away.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Multi-select filters — empty Set means "all" (no restriction)
  const [typeFilters, setTypeFilters] = useState<Set<TransactionType>>(new Set());
  const [accountFilters, setAccountFilters] = useState<Set<string>>(() => {
    const param = searchParams.get("account");
    return param ? new Set([param]) : new Set();
  });
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  // Quick toggle: only reimbursable expenses (money you've fronted).
  const [owedOnly, setOwedOnly] = useState(false);
  // Quick toggle: only transactions flagged for review.
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // Date filter — preset period or custom range
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: accounts = [] } = useAccounts();
  const { data: tags = [] } = useTags();
  const { data: txTags = [] } = useAllTransactionTags();
  const categories = useCategoryMap();
  const { data: allCategories = [] } = useCategories();
  const reimbursedMap = useReimbursedAmountMap();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  const debouncedSearch = useDebouncedValue(search, 300);
  const bounds = getDateBounds(dateMode, customFrom, customTo);

  const tagMap = useMemo(
    () => new Map(tags.map((t) => [t.id, t.name])),
    [tags],
  );

  // Tags live in a join table, so resolve the selected tags to the union of
  // transaction ids that carry any of them. `undefined` = no tag filter.
  const taggedIds = useMemo<string[] | undefined>(() => {
    if (tagFilters.size === 0) return undefined;
    const ids = new Set<string>();
    for (const tt of txTags) {
      if (tagFilters.has(tt.tag_id)) ids.add(tt.transaction_id);
    }
    return [...ids].sort();
  }, [tagFilters, txTags]);

  // All filters are DB-expressible → pushed server-side so each page is already
  // narrowed. Arrays are sorted for stable query-key hashing.
  const filters = useMemo<ActivityFilters>(
    () => ({
      types: typeFilters.size ? [...typeFilters].sort() : undefined,
      accountIds: accountFilters.size ? [...accountFilters].sort() : undefined,
      categoryIds: categoryFilters.size ? [...categoryFilters].sort() : undefined,
      transactionIds: taggedIds,
      from: bounds?.from,
      to: bounds?.to,
      flaggedOnly: flaggedOnly || undefined,
      owedOnly: owedOnly || undefined,
      search: debouncedSearch.trim() || undefined,
    }),
    [
      typeFilters,
      accountFilters,
      categoryFilters,
      taggedIds,
      bounds?.from,
      bounds?.to,
      flaggedOnly,
      owedOnly,
      debouncedSearch,
    ],
  );

  // Reset to the first page whenever the filter set changes (desktop pager).
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(0);
  }, [filtersKey]);

  // Hybrid loading: infinite scroll on mobile, page-indexed on desktop. Only the
  // active hook fetches — the other is disabled.
  const infinite = useInfiniteTransactions(filters, !isDesktop);
  const paged = usePagedTransactions(filters, page, PAGE_SIZE, isDesktop);

  const rows: Transaction[] = isDesktop
    ? paged.data?.rows ?? []
    : infinite.data?.pages.flatMap((p) => p.rows) ?? [];
  const count = isDesktop
    ? paged.data?.count ?? 0
    : infinite.data?.pages[0]?.count ?? 0;
  const isLoading = isDesktop ? paged.isLoading : infinite.isLoading;
  const pageCount = Math.ceil(count / PAGE_SIZE);

  // Broad overlay search (up to 50 across all pages) — only runs while open.
  const searchQuery = useTransactionSearch(searchOpen ? debouncedSearch : "", filters);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const reimbursedInTxCurrency = useMemo(() => {
    const out = new Map<string, number>();
    for (const tx of rows) {
      const base = reimbursedMap.get(tx.id);
      if (!base) continue;
      out.set(tx.id, convert(base, baseCurrency, tx.currency, rates) ?? base);
    }
    return out;
  }, [rows, reimbursedMap, baseCurrency, rates]);

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

  function toggleTag(id: string) {
    setTagFilters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const groups = groupByDay(rows);

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
    owedOnly ||
    flaggedOnly ||
    typeFilters.size > 0 ||
    accountFilters.size > 0 ||
    categoryFilters.size > 0 ||
    tagFilters.size > 0 ||
    isDateActive;

  // "Has data" = either rows match now, or filters are active (so the user has
  // transactions but the current filter excludes them). Used to gate the filter
  // UI and the "nothing here yet" empty state without fetching all rows.
  const hasData = count > 0 || hasFilters;

  // ── infinite-scroll sentinel (mobile only) ─────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isDesktop) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          infinite.hasNextPage &&
          !infinite.isFetchingNextPage
        ) {
          infinite.fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isDesktop, infinite.hasNextPage, infinite.isFetchingNextPage, infinite.fetchNextPage]);

  function clearAll() {
    setSearch("");
    setOwedOnly(false);
    setFlaggedOnly(false);
    setTypeFilters(new Set());
    setAccountFilters(new Set());
    setCategoryFilters(new Set());
    setTagFilters(new Set());
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
                aria-label="Clear search"
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
              {tags.length > 0 && (
                <FilterChip
                  label={tagLabel(tagFilters, tagMap)}
                  active={tagFilters.size > 0}
                  open={activePanel === "tag"}
                  onClick={() => togglePanel("tag")}
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

          {activePanel === "tag" && tags.length > 0 && (
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/90 p-3">
              <div className="flex flex-wrap gap-2">
                <OptionChip
                  label="All tags"
                  selected={tagFilters.size === 0}
                  onClick={() => setTagFilters(new Set())}
                />
                {tags.map((t) => (
                  <OptionChip
                    key={t.id}
                    label={`#${t.name}`}
                    selected={tagFilters.has(t.id)}
                    onClick={() => toggleTag(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Result count — visible when any filter is active */}
          {hasFilters && !isLoading && (
            <p className="text-right text-xs text-ink-600">
              {rows.length >= count
                ? `${count} transactions`
                : `${rows.length} of ${count} transactions`}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
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
        <>
          <motion.div
            className="space-y-5"
            variants={reduce ? undefined : listContainerVariants}
            initial={reduce ? undefined : "hidden"}
            animate={reduce ? undefined : "show"}
          >
            {groups.map(([day, txns]) => (
              <motion.section
                key={day}
                variants={reduce ? undefined : listItemVariants}
              >
                <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {dayLabel(day)}
                </h2>
                <Card className="divide-y divide-ink-800/70 py-0">
                  {txns.map((tx) => {
                    const cat = tx.category_id
                      ? categories.get(tx.category_id)
                      : undefined;
                    return (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        categoryName={cat?.name}
                        categoryIcon={cat?.icon}
                        categoryColor={cat?.color}
                        accountName={accountMap.get(tx.account_id)}
                        toAccountName={
                          tx.destination_account_id
                            ? accountMap.get(tx.destination_account_id)
                            : undefined
                        }
                        reimbursedAmount={reimbursedInTxCurrency.get(tx.id)}
                        onClick={() => setEditing(tx)}
                      />
                    );
                  })}
                </Card>
              </motion.section>
            ))}
          </motion.div>

          {/* Desktop: numbered pager. Mobile: auto-loading sentinel. */}
          {isDesktop ? (
            <Pager page={page} pageCount={pageCount} onPage={setPage} />
          ) : (
            <div ref={sentinelRef} className="pt-2">
              {infinite.isFetchingNextPage && (
                <Card className="divide-y divide-ink-800/70 py-0">
                  <SkeletonRow />
                  <SkeletonRow />
                </Card>
              )}
              {!infinite.hasNextPage && count > PAGE_SIZE && (
                <p className="py-4 text-center text-xs text-ink-600">
                  You’re all caught up
                </p>
              )}
            </div>
          )}
        </>
      )}

      {hasData && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search transactions"
          tabIndex={scrolled ? 0 : -1}
          className={cn(
            "fixed bottom-56 left-5 z-30 flex size-11 items-center justify-center rounded-full",
            "border border-ink-700 bg-ink-900/90 text-ink-200 shadow-lg shadow-ink-950/40 backdrop-blur",
            "transition-all hover:bg-ink-800 hover:text-ink-50",
            "lg:bottom-40 lg:left-auto lg:right-8",
            scrolled
              ? "opacity-100"
              : "pointer-events-none translate-y-1 opacity-0",
          )}
        >
          <Search className="size-5" />
        </button>
      )}

      {hasData && (
        <button
          type="button"
          onClick={() => setOwedOnly((v) => !v)}
          aria-pressed={owedOnly}
          aria-label="Show only what I'm owed (unsettled reimbursable)"
          title="What I'm owed"
          className={cn(
            "fixed bottom-24 left-5 z-30 flex size-11 items-center justify-center rounded-full shadow-lg shadow-ink-950/40 backdrop-blur transition-colors",
            "lg:bottom-8 lg:left-auto lg:right-8",
            owedOnly
              ? "border border-teal-500/60 bg-teal-500/15 text-teal-300 hover:bg-teal-500/25"
              : "border border-ink-700 bg-ink-900/90 text-ink-200 hover:bg-ink-800 hover:text-ink-50",
          )}
        >
          <Receipt className="size-5" />
        </button>
      )}

      {hasData && (
        <button
          type="button"
          onClick={() => setFlaggedOnly((v) => !v)}
          aria-pressed={flaggedOnly}
          aria-label="Show flagged only"
          className={cn(
            "fixed bottom-40 left-5 z-30 flex size-11 items-center justify-center rounded-full shadow-lg shadow-ink-950/40 backdrop-blur transition-colors",
            "lg:bottom-24 lg:left-auto lg:right-8",
            flaggedOnly
              ? "border border-amber-500/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              : "border border-ink-700 bg-ink-900/90 text-ink-200 hover:bg-ink-800 hover:text-ink-50",
          )}
        >
          <Flag className="size-5" />
        </button>
      )}

      {searchOpen && (
        <SearchOverlay
          search={search}
          onSearch={setSearch}
          results={searchQuery.data ?? []}
          loading={searchQuery.isFetching}
          categories={categories}
          accountMap={accountMap}
          reimbursedInTxCurrency={reimbursedInTxCurrency}
          onPick={(tx) => {
            setSearchOpen(false);
            setEditing(tx);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Top slot of the desktop right-edge stack (Receipt 8 · Flag 24 · Search 40). */}
      <FloatingAdd onClick={() => setAdding(true)} className="lg:bottom-56" />
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

// ─── Pop-up search ─────────────────────────────────────────────────────────────

/** A focused search overlay — type and pick a result without leaving your spot. */
function SearchOverlay({
  search,
  onSearch,
  results,
  loading,
  categories,
  accountMap,
  reimbursedInTxCurrency,
  onPick,
  onClose,
}: {
  search: string;
  onSearch: (q: string) => void;
  results: Transaction[];
  loading: boolean;
  categories: Map<string, Category>;
  accountMap: Map<string, string>;
  reimbursedInTxCurrency: Map<string, number>;
  onPick: (tx: Transaction) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search transactions"
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pb-24 pt-10 lg:items-center lg:py-8"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
      />
      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-ink-800 bg-ink-900 shadow-2xl shadow-ink-950/40 lg:max-w-lg">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
          <Search className="size-4 shrink-0 text-ink-500" />
          <input
            autoFocus
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search transactions…"
            aria-label="Search transactions"
            className="w-full bg-transparent text-sm text-ink-50 placeholder:text-ink-600 focus:outline-none"
          />
          {loading && <Spinner className="size-4" />}
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              aria-label="Clear search"
              className="text-ink-500 transition-colors hover:text-ink-200"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {results.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-ink-500">
              {search.trim()
                ? loading
                  ? "Searching…"
                  : `No matches for “${search}”.`
                : "Type to search your transactions."}
            </p>
          ) : (
            <div className="divide-y divide-ink-800/70">
              {results.slice(0, 50).map((tx) => {
                const cat = tx.category_id
                  ? categories.get(tx.category_id)
                  : undefined;
                return (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    categoryName={cat?.name}
                    categoryIcon={cat?.icon}
                    categoryColor={cat?.color}
                    accountName={accountMap.get(tx.account_id)}
                    toAccountName={
                      tx.destination_account_id
                        ? accountMap.get(tx.destination_account_id)
                        : undefined
                    }
                    reimbursedAmount={reimbursedInTxCurrency.get(tx.id)}
                    onClick={() => onPick(tx)}
                  />
                );
              })}
              {results.length >= 50 && (
                <p className="py-3 text-center text-xs text-ink-500">
                  Showing the first 50 — refine your search
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
