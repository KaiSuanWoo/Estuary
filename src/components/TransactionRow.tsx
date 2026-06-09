import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Ban,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatSignedMoney } from "@/lib/format";
import type { Transaction } from "@/lib/types";

/** True when this income transaction is a cost-share repayment, not real income. */
export function isReimbursement(tx: Transaction): boolean {
  return tx.type === "income" && tx.linked_transaction_id != null;
}

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
  accountName,
  toAccountName,
  reimbursedAmount,
  onClick,
}: {
  tx: Transaction;
  categoryName?: string;
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
  const isExcluded = tx.excluded_from_cashflow;
  const style = TYPE_STYLE[tx.type];

  // Net amount after reimbursements — only meaningful for reimbursable expenses
  const netAmt =
    isSplit && reimbursedAmount && reimbursedAmount > 0
      ? Math.max(0, tx.amount - reimbursedAmount)
      : null;

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
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          reimb ? "bg-ink-800 text-ink-400" : style.icon,
        )}
      >
        <Icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-100">{title}</p>
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
        ) : (
          // Normal display
          <>
            <span
              className={cn(
                "tnum font-medium",
                reimb ? "text-ink-100" : style.amount,
              )}
            >
              {formatSignedMoney(tx.amount, tx.currency, tx.type)}
            </span>
            {isSplit && (
              <span className="rounded-full bg-ink-800 px-1.5 py-px text-[10px] font-medium text-ink-500">
                split
              </span>
            )}
          </>
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
