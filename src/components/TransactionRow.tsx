import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Ban,
  Flag,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatSignedMoney } from "@/lib/format";
import { iconFor } from "@/lib/category-icons";
import { isReimbursement, reimbursementLinks } from "@/lib/reimbursements";
import type { Transaction } from "@/lib/types";

const ICON = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  adjustment: SlidersHorizontal,
} as const;

/** Distinct colour per transaction type so the activity list is scannable. */
const TYPE_STYLE: Record<
  Transaction["type"],
  { icon: string; amount: string }
> = {
  income: { icon: "bg-teal-500/15 text-teal-400", amount: "text-teal-400" },
  expense: { icon: "bg-rose-500/15 text-rose-400", amount: "text-rose-300" },
  transfer: { icon: "bg-sky-500/15 text-sky-400", amount: "text-sky-300" },
  adjustment: {
    icon: "bg-violet-500/15 text-violet-400",
    amount: "text-violet-300",
  },
};

export function TransactionRow({
  tx,
  categoryName,
  categoryIcon,
  categoryColor,
  accountName,
  toAccountName,
  reimbursedAmount,
  onClick,
}: {
  tx: Transaction;
  categoryName?: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  /** Name of the source account (used in transfer subtitle). */
  accountName?: string;
  /** Name of the destination account (used in transfer title). */
  toAccountName?: string;
  /**
   * Total already reimbursed for this expense (sum of linked income txns).
   * When > 0, the gross amount is shown struck-through with the net below.
   */
  reimbursedAmount?: number;
  onClick?: () => void;
}) {
  const Icon = ICON[tx.type];
  const isTransfer = tx.type === "transfer";
  const reimb = isReimbursement(tx);
  const isSplit = tx.type === "expense" && tx.is_reimbursable;
  // A reimbursable expense you haven't marked settled yet → still owed.
  const unsettled = isSplit && tx.reimbursement_status !== "settled";
  const isExcluded = tx.excluded_from_cashflow;
  const style = TYPE_STYLE[tx.type];

  // Show the category's icon (tinted with its colour) as the avatar for
  // categorised income/expense; otherwise fall back to the type icon.
  const showCategory =
    !reimb &&
    (tx.type === "expense" || tx.type === "income") &&
    !!categoryColor;
  const CategoryGlyph = iconFor(categoryIcon);

  // Net amount after reimbursements — only meaningful for reimbursable expenses
  const netAmt =
    isSplit && reimbursedAmount && reimbursedAmount > 0
      ? Math.max(0, tx.amount - reimbursedAmount)
      : null;

  // For a repayment, the "net" income is whatever wasn't allocated to expenses.
  const reimbNet = reimb
    ? Math.max(
        0,
        tx.amount -
          reimbursementLinks(tx).reduce((s, l) => s + l.amount, 0),
      )
    : 0;

  const title = isTransfer
    ? // Prefer the imported description so you know what the transfer was for;
      // fall back to the linked destination account, then a generic label.
      tx.merchant?.trim() ||
      (toAccountName ? `→ ${toAccountName}` : "Transfer")
    : tx.merchant || categoryName || labelFor(tx.type);

  // Secondary detail (category / notes / reimbursement) shown before the account.
  const detail = isTransfer
    ? tx.notes || null
    : reimb
      ? "Reimbursement"
      : categoryName && tx.merchant
        ? categoryName
        : tx.notes || null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3",
        isExcluded && "opacity-40",
        onClick &&
          "cursor-pointer rounded-lg transition-colors hover:bg-ink-800/30 active:bg-ink-800/50",
      )}
      onClick={onClick}
    >
      {showCategory ? (
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `${categoryColor}26`,
            color: categoryColor ?? undefined,
          }}
        >
          <CategoryGlyph className="size-5" />
        </div>
      ) : (
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            reimb ? "bg-ink-800 text-ink-400" : style.icon,
          )}
        >
          <Icon className="size-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {tx.flagged && (
            <Flag
              className="size-3 shrink-0 text-amber-400"
              fill="currentColor"
              aria-label="Flagged for review"
            />
          )}
          <p className="truncate font-medium text-ink-100">{title}</p>
        </div>
        {(detail || accountName) && (
          <p className="truncate text-sm text-ink-500">
            {detail && (
              <>
                {detail}
                {accountName && <span className="text-ink-700"> · </span>}
              </>
            )}
            {accountName && (
              <span className="text-ink-400">{accountName}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {isExcluded ? (
          // Excluded — amount shown struck through with cancel icon
          <>
            <span className="tnum font-medium text-ink-500 line-through">
              {formatSignedMoney(tx.amount, tx.currency, tx.type)}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-ink-600">
              <Ban className="size-3" /> excluded
            </span>
          </>
        ) : netAmt !== null ? (
          // Reimbursable expense with some money back — gross struck through + net
          <>
            <span className="tnum text-xs font-medium text-ink-600 line-through">
              {formatSignedMoney(tx.amount, tx.currency, tx.type)}
            </span>
            <span className="tnum font-medium text-ink-100">
              {formatSignedMoney(netAmt, tx.currency, tx.type)}
            </span>
            <span className="text-[10px] text-ink-500">net</span>
          </>
        ) : reimb ? (
          // Repayment — gross struck through, net (unallocated) income below
          <>
            <span className="tnum text-xs font-medium text-ink-600 line-through">
              {formatSignedMoney(tx.amount, tx.currency, tx.type)}
            </span>
            <span
              className={cn(
                "tnum font-medium",
                reimbNet > 0 ? "text-teal-400" : "text-ink-400",
              )}
            >
              {formatSignedMoney(reimbNet, tx.currency, tx.type)}
            </span>
            <span className="text-[10px] text-ink-500">net</span>
          </>
        ) : (
          // Normal display
          <span className={cn("tnum font-medium", style.amount)}>
            {formatSignedMoney(tx.amount, tx.currency, tx.type)}
          </span>
        )}
        {unsettled && (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-400">
            owed
          </span>
        )}
      </div>
    </div>
  );
}

function labelFor(type: Transaction["type"]): string {
  return type === "transfer"
    ? "Transfer"
    : type === "adjustment"
      ? "Adjustment"
      : type[0].toUpperCase() + type.slice(1);
}
