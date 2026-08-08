import { Ban, Flag } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { isReimbursement, reimbursementLinks } from "@/lib/reimbursements";
import { pressDown, useReducedMotion } from "@/lib/motion";
import type { Transaction } from "@/lib/types";

/**
 * One entry in the register.
 *
 * A ledger has no avatars and no coloured pills — it has columns. Money out and
 * money in sit under their own headings so a glance down either column answers
 * "what did I spend" without reading a sign, and the particulars carry the
 * merchant with its category and account beneath.
 */
export function TransactionRow({
  tx,
  categoryName,
  accountName,
  toAccountName,
  reimbursedAmount,
  balance,
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
   * When > 0, the gross is shown struck through with the net beneath.
   */
  reimbursedAmount?: number;
  /**
   * Running balance after this entry, in the account's currency. Only supplied
   * when it is arithmetically true — one account, in date order, unfiltered.
   */
  balance?: number;
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const isTransfer = tx.type === "transfer";
  const reimb = isReimbursement(tx);
  const isSplit = tx.type === "expense" && tx.is_reimbursable;
  const unsettled = isSplit && tx.reimbursement_status !== "settled";
  const isExcluded = tx.excluded_from_cashflow;

  // Net cost after reimbursements — only meaningful for reimbursable expenses.
  const netAmt =
    isSplit && reimbursedAmount && reimbursedAmount > 0
      ? Math.max(0, tx.amount - reimbursedAmount)
      : null;

  // For a repayment, the "net" income is whatever wasn't allocated to expenses.
  const reimbNet = reimb
    ? Math.max(
        0,
        tx.amount - reimbursementLinks(tx).reduce((s, l) => s + l.amount, 0),
      )
    : 0;

  const title = isTransfer
    ? tx.merchant?.trim() || (toAccountName ? `→ ${toAccountName}` : "Transfer")
    : tx.merchant || categoryName || labelFor(tx.type);

  const detail = isTransfer
    ? tx.notes || null
    : reimb
      ? "Reimbursement"
      : categoryName && tx.merchant
        ? categoryName
        : tx.notes || null;

  // Which column the figure belongs in. Transfers leave the account they're
  // filed against, so they sit under "out".
  const outward = tx.type === "expense" || tx.type === "transfer";
  const gross = tx.amount;
  const net = netAmt ?? (reimb ? reimbNet : null);

  const figure = (value: number) => formatMoney(value, tx.currency);

  return (
    <motion.div
      // An entry presses under a finger. Only entries you can actually open do,
      // so the feedback always means something happened.
      whileTap={onClick && !reduce ? { scale: 0.99 } : undefined}
      transition={pressDown}
      className={cn(
        "grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-rule py-2.5 last:border-b-0",
        balance !== undefined && "sm:grid-cols-[1fr_auto_auto]",
        isExcluded && "opacity-45",
        onClick && "cursor-pointer transition-colors hover:bg-[color-mix(in_oklab,var(--color-quill)_4%,transparent)]",
      )}
      onClick={onClick}
    >
      {/* Particulars */}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-quill">
          {tx.flagged && (
            <Flag
              className="size-3 shrink-0 text-head-3"
              fill="currentColor"
              aria-label="Flagged for review"
            />
          )}
          <span className="truncate">{title}</span>
        </p>
        {(detail || accountName) && (
          <p className="truncate text-xs italic text-quill-faint">
            {detail}
            {detail && accountName && " · "}
            {accountName}
          </p>
        )}
      </div>

      {/* The figure, in the column its direction belongs to */}
      <div className="flex flex-col items-end">
        {net !== null ? (
          <>
            <span className="tnum text-xs text-quill-faint line-through">
              {figure(gross)}
            </span>
            <span className={cn("tnum", outward ? "text-debit" : "text-credit")}>
              {figure(net)}
            </span>
          </>
        ) : (
          <span
            className={cn(
              "tnum",
              isExcluded
                ? "text-quill-faint line-through"
                : outward
                  ? "text-debit"
                  : "text-credit",
            )}
          >
            {figure(gross)}
          </span>
        )}
        {isExcluded && (
          <span className="flex items-center gap-1 text-[10px] text-quill-faint">
            <Ban className="size-3" /> excluded
          </span>
        )}
        {unsettled && (
          <span className="text-[10px] italic text-head-3">owed</span>
        )}
      </div>

      {/* Running balance — only rendered when it's true (see `balance`). */}
      {balance !== undefined && (
        <span className="tnum hidden text-quill-soft sm:block sm:min-w-[6.5rem] sm:text-right">
          {figure(balance)}
        </span>
      )}
    </motion.div>
  );
}

function labelFor(type: Transaction["type"]): string {
  return type === "transfer"
    ? "Transfer"
    : type === "adjustment"
      ? "Adjustment"
      : type[0].toUpperCase() + type.slice(1);
}
