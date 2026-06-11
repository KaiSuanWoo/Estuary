import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useArchiveCategory,
  useReorderCategories,
  useSeedCategories,
  type SeedCategory,
} from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { spendingByCategory, monthBounds } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, Sheet, Spinner } from "@/components/ui";
import { CategoryIcon } from "@/components/CategoryIcon";
import { CATEGORY_ICONS, CATEGORY_ICON_NAMES } from "@/lib/category-icons";
import type { Category, CategoryKind } from "@/lib/types";

const inputCls =
  "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none";

// Default colours used when seeding categories.
const SWATCHES = ["#7FD1B9", "#3F72AF", "#4F8A6D", "#8AA6C4", "#E0A458", "#C46D6D"];

/** Colour picker: a single swatch that opens the OS colour picker. */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-ink-400">Colour</span>
      <label className="flex w-fit cursor-pointer items-center gap-3">
        <span
          className="relative block size-9 shrink-0 rounded-lg border border-ink-700"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Pick colour"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
        <span className="tnum text-sm uppercase text-ink-400">{value}</span>
      </label>
    </div>
  );
}

/** Grid of selectable category icons; the active one is tinted with the colour. */
function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (name: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-ink-400">Icon</span>
      <div className="grid grid-cols-6 gap-1.5">
        {CATEGORY_ICON_NAMES.map((name) => {
          const Icon = CATEGORY_ICONS[name];
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-label={name}
              aria-pressed={active}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl border transition-colors",
                active
                  ? "border-transparent"
                  : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200",
              )}
              style={active ? { backgroundColor: `${color}26`, color } : undefined}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Default category seed (AU/MY dual-currency lifestyle) ────────────────────
const SEED_CATEGORIES: SeedCategory[] = [
  // ── Expenses ─────────────────────────────────────────────────────────────
  { name: "Groceries",           kind: "expense", color: "#4F8A6D" },
  { name: "Dining & Takeaway",   kind: "expense", color: "#E0A458" },
  { name: "Transport",           kind: "expense", color: "#3F72AF" }, // Grab, bus, Uber, petrol
  { name: "Rent & Housing",      kind: "expense", color: "#8AA6C4" },
  { name: "Utilities & Bills",   kind: "expense", color: "#7FD1B9" },
  { name: "Internet & Phone",    kind: "expense", color: "#7FD1B9" },
  { name: "Health & Medical",    kind: "expense", color: "#C46D6D" },
  { name: "Insurance",           kind: "expense", color: "#8AA6C4" },
  { name: "Shopping",            kind: "expense", color: "#E0A458" },
  { name: "Subscriptions",       kind: "expense", color: "#8AA6C4" },
  { name: "Entertainment",       kind: "expense", color: "#3F72AF" },
  // Travel — split into three since you travel frequently
  { name: "Flights",             kind: "expense", color: "#3F72AF" },
  { name: "Accommodation",       kind: "expense", color: "#8AA6C4" },
  { name: "Travel Expenses",     kind: "expense", color: "#E0A458" }, // food, activities, forex while away
  // Family
  { name: "Family Support",      kind: "expense", color: "#4F8A6D" }, // gifts / non-reimbursed
  { name: "On Behalf of Family", kind: "expense", color: "#C46D6D" }, // paid for family, will be reimbursed — use the Reimbursable toggle
  // Other
  { name: "Personal Care",       kind: "expense", color: "#4F8A6D" },
  { name: "Fees & Charges",      kind: "expense", color: "#C46D6D" }, // bank fees, Wise FX fees
  // ── Income ───────────────────────────────────────────────────────────────
  { name: "Salary",              kind: "income",  color: "#7FD1B9" },
  { name: "Freelance",           kind: "income",  color: "#7FD1B9" },
  { name: "Family Transfer",     kind: "income",  color: "#4F8A6D" }, // monthly MYR from family
  { name: "Interest",            kind: "income",  color: "#4F8A6D" },
  { name: "Reimbursements",      kind: "income",  color: "#8AA6C4" }, // paid back by family / others
];

export function Categories() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [reordering, setReordering] = useState(false);
  const { data = [], isLoading } = useCategories();
  const { data: txns = [] } = useTransactions();
  const archive = useArchiveCategory();
  const seed = useSeedCategories();
  const reorder = useReorderCategories();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  // Persist a group's new order — only the rows whose position changed.
  function persistOrder(ordered: Category[]) {
    const changed = ordered
      .map((c, i) => ({ id: c.id, display_order: i, was: c.display_order }))
      .filter((r) => r.was !== r.display_order)
      .map(({ id, display_order }) => ({ id, display_order }));
    if (changed.length) reorder.mutate(changed);
  }

  const { from, to } = monthBounds();
  const spendMap = new Map(
    spendingByCategory(txns, data, baseCurrency, rates, from, to).map((s) => [
      s.id,
      s.value,
    ]),
  );

  const expense = data.filter((c) => c.kind === "expense");
  const income = data.filter((c) => c.kind === "income");

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:text-ink-200"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            Categories
          </h1>
        </div>
        {reordering ? (
          <Button size="sm" onClick={() => setReordering(false)}>
            <Check className="size-4" /> Done
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {data.length > 1 && (
              <button
                onClick={() => setReordering(true)}
                aria-label="Reorder categories"
                className="flex size-9 items-center justify-center rounded-xl bg-ink-800/60 text-ink-200 transition-colors hover:bg-ink-700/60"
              >
                <ArrowUpDown className="size-4" />
              </button>
            )}
            <Link
              to="/rules"
              aria-label="Auto-categorise rules"
              className="flex size-9 items-center justify-center rounded-xl bg-ink-800/60 text-ink-200 transition-colors hover:bg-ink-700/60"
            >
              <Wand2 className="size-4" />
            </Link>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        )}
      </header>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700/70 px-6 py-12 text-center">
          <div className="mb-3 text-ink-500">
            <Tag className="size-6" />
          </div>
          <p className="font-medium text-ink-200">No categories yet</p>
          <p className="mt-1 max-w-xs text-sm text-ink-500">
            Create categories to organise spending and set monthly budgets.
          </p>
          <Button
            size="sm"
            className="mt-5"
            onClick={() => seed.mutate(SEED_CATEGORIES)}
            disabled={seed.isPending}
          >
            {seed.isPending ? (
              <>
                <Spinner className="size-4" /> Setting up…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Set up default categories
              </>
            )}
          </Button>
          {seed.isError && (
            <p className="mt-2 text-xs text-red-400">
              {(seed.error as Error).message}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Group
            title="Expenses"
            items={expense}
            baseCurrency={baseCurrency}
            spendMap={spendMap}
            reordering={reordering}
            onReorder={persistOrder}
            onEdit={setEditing}
            onArchive={archive}
          />
          <Group
            title="Income"
            items={income}
            baseCurrency={baseCurrency}
            spendMap={spendMap}
            reordering={reordering}
            onReorder={persistOrder}
            onEdit={setEditing}
            onArchive={archive}
          />
        </div>
      )}

      {adding && <AddCategorySheet onClose={() => setAdding(false)} />}
      {editing && (
        <EditCategorySheet
          category={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Group({
  title,
  items,
  baseCurrency,
  spendMap,
  reordering,
  onReorder,
  onEdit,
  onArchive,
}: {
  title: string;
  items: Category[];
  baseCurrency: string;
  spendMap: Map<string, number>;
  reordering: boolean;
  onReorder: (ordered: Category[]) => void;
  onEdit: (c: Category) => void;
  onArchive: (id: string) => void;
}) {
  if (items.length === 0) return null;

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </h2>
      <Card className="divide-y divide-ink-800/70 py-0">
        {items.map((c, i) => {
          const spent = spendMap.get(c.id) ?? 0;
          const budget = c.monthly_budget;
          const pct = budget != null && budget > 0 ? Math.min(spent / budget, 1) : null;
          const over = budget != null && spent > budget;
          return (
            <div key={c.id} className="py-3">
              <div className="flex items-center gap-3">
                <CategoryIcon icon={c.icon} color={c.color} />
                <span className="flex-1 truncate font-medium text-ink-100">
                  {c.name}
                </span>

                {reordering ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${c.name} up`}
                      className="flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-25"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      aria-label={`Move ${c.name} down`}
                      className="flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-25"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    {budget != null ? (
                      <span
                        className={cn(
                          "tnum text-sm",
                          over ? "text-red-400" : "text-ink-400",
                        )}
                      >
                        {formatMoney(spent, baseCurrency)}{" "}
                        <span className="text-ink-600">
                          / {formatMoney(budget, baseCurrency)}
                        </span>
                      </span>
                    ) : spent > 0 ? (
                      <span className="tnum text-sm text-ink-400">
                        {formatMoney(spent, baseCurrency)}
                      </span>
                    ) : null}
                    <button
                      onClick={() => onEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-800 hover:text-ink-200 transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => onArchive(c.id)}
                      aria-label={`Archive ${c.name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
              {!reordering && pct !== null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      over ? "bg-red-500" : "bg-teal-500",
                    )}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function EditCategorySheet({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const update = useUpdateCategory();
  const archive = useArchiveCategory();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? SWATCHES[0]);
  const [icon, setIcon] = useState(category.icon ?? "");
  const [budget, setBudget] = useState(
    category.monthly_budget != null ? String(category.monthly_budget) : "",
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      id: category.id,
      patch: {
        name: name.trim(),
        color,
        icon: icon || null,
        monthly_budget: budget ? Number(budget) : null,
      },
    });
    onClose();
  }

  function handleArchive() {
    archive(category.id);
    onClose();
  }

  return (
    <Sheet title="Edit category" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Name
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </label>

          <ColorPicker value={color} onChange={setColor} />

          <IconPicker value={icon} color={color} onChange={setIcon} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Monthly budget{" "}
              <span className="text-ink-600">(optional)</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              className={cn(inputCls, "tnum")}
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
              <p className="flex-1 text-xs text-ink-400">Archive this category?</p>
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
              Archive category
            </button>
          )}
        </div>
    </Sheet>
  );
}

function AddCategorySheet({ onClose }: { onClose: () => void }) {
  const create = useCreateCategory();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [icon, setIcon] = useState("");
  const [budget, setBudget] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      kind,
      color,
      icon: icon || null,
      monthly_budget: budget ? Number(budget) : null,
    });
    onClose();
  }

  return (
    <Sheet title="New category" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "h-9 rounded-xl border text-xs font-medium capitalize transition-colors",
                  kind === k
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-ink-700 text-ink-400",
                )}
              >
                {k}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Name
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className={inputCls}
            />
          </label>

          <ColorPicker value={color} onChange={setColor} />

          <IconPicker value={icon} color={color} onChange={setIcon} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">
              Monthly budget <span className="text-ink-600">(optional)</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
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
            {create.isPending ? "Saving…" : "Add category"}
          </Button>
        </form>
    </Sheet>
  );
}
