import {
  useMemo,
  useState,
  useRef,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  FileUp,
  Flag,
  Info,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { categorize } from "@/lib/categorize";
import {
  useBulkImport,
  useDeleteBatch,
  useImportBatches,
  type ImportRow,
} from "@/hooks/useImportBatch";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/account-colors";
import { Button, Card, Spinner } from "@/components/ui";

// ─── shared helpers ───────────────────────────────────────────────────────────

/** Split one CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Heuristic: does a merchant/description string suggest an own-account transfer?
 * Used by CommBank parser to auto-detect internal bank transfers.
 *
 * Keywords are all institution/statement phrasings (never personal names), so
 * detection stays generic for any user:
 *   - "transfer" / "tfr"            → generic bank transfer wording
 *   - "payid" / "osko"             → AU instant-payment rails
 *   - "wise payments"             → money arriving from a Wise account
 *   - "credit to account"         → e.g. "Fast Transfer From <name> CREDIT TO ACCOUNT"
 */
function looksLikeTransfer(merchant: string | null): boolean {
  if (!merchant) return false;
  return /\btransfer\b|\bTFR\b|\bpayid\b|\bosko\b|wise payments|credit to account/i.test(
    merchant,
  );
}

// ─── CommBank CSV ─────────────────────────────────────────────────────────────

/**
 * Strip CommBank card-transaction boilerplate from a description.
 *
 * Before: "COLES 4514 SUNNYBANK QL AUS Card xx7742 Value Date: 27/05/2026"
 * After:  "COLES 4514 SUNNYBANK"
 */
function cleanCommBankDescription(raw: string): string {
  return raw
    .replace(/\s+Card xx\w+.*$/i, "")
    .replace(/\s+Value Date:\s*\S+\s*$/i, "")
    .replace(/\s+[A-Za-z]{2,3}\s+AUS\s*$/i, "")
    .replace(/\s+AUS\s*$/i, "")
    .trim();
}

/**
 * Parse a CommBank transaction CSV export.
 * Column order: Date, Amount, Description[, Balance]
 * Date format: DD/MM/YYYY or DD/MM/YY
 * Negative amount → expense; positive → income.
 *
 * Transfer detection: if the cleaned description contains "transfer", "TFR",
 * or "payid" the row is flagged as an own-account transfer (excluded from net).
 */
function parseCommBankCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  const start = /^date/i.test(lines[0] ?? "") ? 1 : 0;
  const rows: ImportRow[] = [];

  for (let i = start; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]!);
    if (parts.length < 3) continue;
    const [rawDate, rawAmount, description = ""] = parts;

    const amount = parseFloat(rawAmount.replace(/[^-\d.]/g, ""));
    if (!isFinite(amount) || !rawDate) continue;

    const m = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) continue;
    const [, d, mo, yr] = m;
    const year = yr.length === 2 ? "20" + yr : yr;
    const isoDate = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;

    const merchant = cleanCommBankDescription(description) || null;
    const isXfer = looksLikeTransfer(merchant);

    // Transfer-out → "transfer"   (balance ↓, excluded from P&L)
    // Transfer-in  → "adjustment" (balance ↑, excluded from P&L — no extra column needed)
    const type: ImportRow["type"] = isXfer
      ? amount < 0 ? "transfer" : "adjustment"
      : amount < 0 ? "expense" : "income";

    rows.push({
      type,
      date: isoDate,
      amount: Math.abs(amount),
      currency: "",
      account_id: "",
      merchant,
      notes: null,
      external_id: `${isoDate}|${rawAmount.trim()}|${description.trim()}`,
    });
  }
  return rows;
}

// ─── CIMB Clicks CSV ──────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "31-May-2026" → "2026-05-31" */
function parseCIMBDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const [, d, mon, yr] = m;
  const mo = MONTH_MAP[mon.toLowerCase()];
  if (!mo) return null;
  return `${yr}-${mo}-${d.padStart(2, "0")}`;
}

/**
 * Extract a readable merchant name and optional notes from a CIMB
 * pipe-delimited Transaction Details field.
 */
function parseCIMBDescription(raw: string): { merchant: string; notes: string | null } {
  const parts = raw.split("|").map((s) => s.trim());
  const type = parts[0] ?? "";

  // DUITNOW TO/FROM ACCOUNT and bare DUITNOW (QR) all carry the payee/merchant
  // in parts[3] and a method/reference in parts[4].
  if (type.startsWith("DUITNOW")) {
    const payee = parts[3] ?? "";
    const ref = parts[4] ?? "";
    const notes =
      ref && ref.toLowerCase() !== "fund transfer" ? ref : null;
    return { merchant: payee || type, notes };
  }

  // Instant funds transfer to/from another account.
  //   TO SA   → counterparty in parts[1]
  //   FROM SA → parts[1] empty; name in parts[4], reference in parts[3]
  if (type === "I-FUNDS TR TO SA" || type === "I-FUNDS TR FROM SA") {
    const name = (parts[1] || parts[4] || "").trim();
    const notes =
      [parts[3], parts[5]]
        .map((s) => (s ?? "").trim())
        .find((r) => r && r.toLowerCase() !== "fund transfer") || null;
    return { merchant: name || type, notes };
  }

  if (type === "I-PAYMENT") {
    const payee = (parts[1] ?? "").replace(/^FPXPAY\s+/i, "").trim();
    return { merchant: payee || type, notes: null };
  }

  // POS DEBIT carries an 8-digit posting date prefix in parts[1]; MYDEBIT
  // PURCHASE has the same "<merchant>  <location>" shape without that prefix.
  // The stripping/whitespace-collapse handles both.
  if (type === "POS DEBIT" || type === "MYDEBIT PURCHASE") {
    const merchant = (parts[1] ?? "")
      .replace(/^\d{8}/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { merchant: merchant || type, notes: null };
  }

  return {
    merchant: parts.find((p) => p.length > 0) ?? type,
    notes: null,
  };
}

/**
 * Parse a CIMB Clicks transaction CSV export.
 * Header: Date, Transaction Details, Money In, Money Out, Balance
 */
function parseCIMBCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]!);
    if (parts.length < 4) continue;
    const [rawDate, rawDesc, rawIn, rawOut] = parts;

    const isoDate = parseCIMBDate(rawDate!);
    if (!isoDate) continue;

    const moneyIn = parseFloat((rawIn ?? "").replace(/[^\d.]/g, ""));
    const moneyOut = parseFloat((rawOut ?? "").replace(/[^\d.]/g, ""));
    const isIncome = isFinite(moneyIn) && moneyIn > 0;
    const isExpense = isFinite(moneyOut) && moneyOut > 0;
    if (!isIncome && !isExpense) continue;

    const amount = isIncome ? moneyIn : moneyOut;
    const { merchant, notes } = parseCIMBDescription(rawDesc!);

    rows.push({
      type: isIncome ? "income" : "expense",
      date: isoDate,
      amount,
      currency: "",
      account_id: "",
      merchant: merchant || null,
      notes,
      external_id: `${isoDate}|${(rawIn ?? "").trim()}|${(rawOut ?? "").trim()}|${rawDesc!.trim()}`,
    });
  }
  return rows;
}

// ─── Wise transaction-history CSV ─────────────────────────────────────────────

/**
 * Parse a Wise transaction-history CSV export.
 *
 * Columns: ID, Status, Direction, "Created on", "Finished on",
 *   "Source fee amount", "Source fee currency", "Target fee amount",
 *   "Target fee currency", "Source name", "Source amount (after fees)",
 *   "Source currency", "Target name", "Target amount (after fees)",
 *   "Target currency", "Exchange rate", Reference, Batch, "Created by",
 *   Category, Note
 *
 * Amount/currency perspective (always from the Wise account's POV):
 *   Direction=IN  → amount = Target amount, currency = Target currency
 *   Direction=OUT → amount = Source amount, currency = Source currency
 *
 * TRANSFER-* rows are own-account transfers:
 *   OUT → type "transfer"   (balance ↓, excluded from P&L)
 *   IN  → type "adjustment" (balance ↑, excluded from P&L — no extra column needed)
 *
 * Other rows (card payments, etc.) are income/expense by direction.
 */
function parseWiseCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  // Build a normalised-name → index map from the header row
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = splitCsvLine(lines[0]!).map(norm);
  const ci = (name: string) => headers.indexOf(norm(name));

  const C = {
    id:         ci("id"),
    status:     ci("status"),
    dir:        ci("direction"),
    date:       ci("created on"),
    srcFeeAmt:  ci("source fee amount"),
    srcFeeCur:  ci("source fee currency"),
    srcAmt:     ci("source amount (after fees)"),
    srcCur:     ci("source currency"),
    tgtAmt:     ci("target amount (after fees)"),
    tgtCur:     ci("target currency"),
    tgtName:    ci("target name"),
    srcName:    ci("source name"),
    rate:       ci("exchange rate"),
    ref:        ci("reference"),
    category:   ci("category"),
    note:       ci("note"),
  };

  // Bail if we can't find the essential columns
  if (C.id < 0 || C.dir < 0 || C.date < 0) return [];

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const p = splitCsvLine(lines[i]!);
    const g = (idx: number) => (idx >= 0 ? (p[idx] ?? "") : "");

    const id        = g(C.id);
    const status    = g(C.status).toUpperCase();
    const direction = g(C.dir).toUpperCase();
    const rawDate   = g(C.date).slice(0, 10);   // "2026-05-31 13:19:46" → "2026-05-31"
    const srcFeeAmt = parseFloat(g(C.srcFeeAmt)) || 0;
    const srcFeeCur = g(C.srcFeeCur);
    const srcAmt    = parseFloat(g(C.srcAmt));
    const srcCur    = g(C.srcCur);
    const tgtAmt    = parseFloat(g(C.tgtAmt));
    const tgtCur    = g(C.tgtCur);
    const rate      = parseFloat(g(C.rate)) || 1;
    const ref       = g(C.ref);
    const category  = g(C.category);
    const noteVal   = g(C.note);
    const tgtName   = g(C.tgtName);
    const srcName   = g(C.srcName);

    if (status !== "COMPLETED") continue;
    if (!rawDate) continue;

    const isIn  = direction === "IN";
    const amount   = isIn ? tgtAmt : srcAmt;
    const currency = isIn ? tgtCur : srcCur;

    if (!isFinite(amount) || amount <= 0) continue;

    const isOwnTransfer = id.startsWith("TRANSFER-");
    const isFX = srcCur !== tgtCur;

    // Build human-readable merchant + notes
    let merchant: string;
    let notes: string | null = null;

    if (isIn && isFX) {
      // MYR → AUD conversion arriving at Wise
      merchant = `FX: ${srcCur} → ${tgtCur}`;
      const feeStr =
        srcFeeAmt > 0
          ? ` · fee ${srcFeeAmt.toFixed(2)} ${srcFeeCur}`
          : "";
      notes = `${srcAmt.toFixed(2)} ${srcCur}${feeStr} @ ${rate}`;
    } else if (isIn) {
      merchant = ref || category || (srcName ? `From ${srcName}` : `${srcCur} deposit`);
    } else if (!isFX) {
      // Same-currency OUT (e.g. Wise AUD → CommBank AUD) — name the recipient so
      // it's clear where the money went.
      merchant = ref || (tgtName ? `Transfer to ${tgtName}` : "Transfer out");
      notes = noteVal || null;
    } else {
      // FX OUT (spending in a foreign currency)
      merchant = ref || (tgtName ? `To ${tgtName}` : `${srcCur} → ${tgtCur}`);
      notes = `${tgtAmt.toFixed(2)} ${tgtCur} @ ${rate}`;
    }

    let type: ImportRow["type"];

    if (isOwnTransfer) {
      // IN  → "adjustment": balance ↑, excluded from P&L (no extra DB column needed)
      // OUT → "transfer":   balance ↓, excluded from P&L
      type = isIn ? "adjustment" : "transfer";
    } else {
      type = isIn ? "income" : "expense";
    }

    rows.push({
      type,
      date: rawDate,
      amount,
      currency,
      account_id: "",
      merchant: merchant || null,
      notes,
      external_id: id,
    });
  }
  return rows;
}

// ─── Nationwide (FlexDirect) CSV ──────────────────────────────────────────────

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Nationwide dates look like "13 May 2026" → "2026-05-13". */
function parseNationwideDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  const [, d, monName, yr] = m;
  const mo = MONTH_ABBR[monName.slice(0, 3).toLowerCase()];
  if (!mo) return null;
  return `${yr}-${String(mo).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "£1,790.24" → 1790.24 ; "" → 0 (Nationwide amounts are always positive). */
function parseGbpAmount(raw: string): number {
  const n = parseFloat((raw || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

/**
 * Tidy a Nationwide description by dropping the trailing country code and store
 * number that Visa rows carry.
 *   "SAINSBURYS.CO.UK 0800 328 1700 GB"  → "SAINSBURYS.CO.UK 0800 328 1700"
 *   "AMAZON* NH92K0K54 LONDON GB 7853"   → "AMAZON* NH92K0K54 LONDON"
 */
function cleanNationwideDescription(raw: string): string {
  return raw
    .replace(/\s+(GB|US|IE|EU|FR|DE|NL|ES)\s+\d{3,5}\s*$/i, "")
    .replace(/\s+(GB|US|IE|EU|FR|DE|NL|ES)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse a Nationwide FlexDirect statement CSV.
 *
 * The export opens with a few "Account Name:" / balance metadata rows and a
 * blank line, then the real header:
 *   "Date","Transaction type","Description","Paid out","Paid in","Balance"
 *
 * `Paid out` → expense, `Paid in` → income (always GBP). "Transfer to/from"
 * rows are treated as own-account transfers (excluded from cashflow).
 */
function parseNationwideCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headerIdx = lines.findIndex((l) =>
    /^"?Date"?\s*,\s*"?Transaction type"?/i.test(l),
  );
  if (headerIdx < 0) return [];

  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const parts = splitCsvLine(line);
    if (parts.length < 5) continue;

    const [rawDate = "", txTypeRaw = "", description = "", paidOut = "", paidIn = ""] =
      parts;
    const isoDate = parseNationwideDate(rawDate);
    if (!isoDate) continue;

    const txType = txTypeRaw.trim();
    const out = parseGbpAmount(paidOut);
    const inn = parseGbpAmount(paidIn);
    const isOut = out > 0;
    const amount = isOut ? out : inn;
    if (!(amount > 0)) continue;

    let merchant = cleanNationwideDescription(description);
    // Cashback/interest rows just read "Credit <date>" — use the type instead.
    if (!merchant || /^credit\b/i.test(merchant)) merchant = txType;

    const isXfer = /^transfer\b/i.test(txType) || looksLikeTransfer(merchant);
    const type: ImportRow["type"] = isXfer
      ? isOut ? "transfer" : "adjustment"
      : isOut ? "expense" : "income";

    rows.push({
      type,
      date: isoDate,
      amount,
      currency: "GBP",
      account_id: "",
      merchant: merchant || null,
      notes: merchant !== txType ? txType || null : null,
      external_id: `${isoDate}|${(isOut ? paidOut : paidIn).trim()}|${description.trim()}`,
    });
  }
  return rows;
}

// ─── format detection ─────────────────────────────────────────────────────────

type ImportFormat = "commbank" | "cimb" | "wise" | "nationwide" | "generic";

const FORMAT_LABELS: Record<ImportFormat, string> = {
  commbank:   "CommBank",
  cimb:       "CIMB Clicks",
  wise:       "Wise",
  nationwide: "Nationwide",
  generic:    "Custom CSV",
};

const SOURCE_LABELS: Record<string, string> = {
  commbank_csv:   "CommBank",
  cimb_csv:       "CIMB Clicks",
  wise_csv:       "Wise",
  nationwide_csv: "Nationwide",
  generic_csv:    "Custom CSV",
};

/**
 * Pick a fast-path parser ONLY on a positive header/shape signal. Returns null
 * for anything unrecognised so the caller falls back to the generic mapper —
 * never a silent default parser (which silently mangled unknown CSVs).
 */
function detectKnownFormat(text: string): ImportFormat | null {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (/^"?ID"?,\s*"?Status"?,\s*"?Direction"?/i.test(firstLine)) return "wise";
  if (/^"?Date"?,\s*"?Transaction Details/i.test(firstLine)) return "cimb";
  if (
    /^"?Account Name/i.test(firstLine) ||
    /"Transaction type"\s*,\s*"Description"\s*,\s*"Paid out"/i.test(text)
  )
    return "nationwide";
  // CommBank has no header: first field is a dd/mm/yyyy date, ≥3 columns.
  if (/^\d{2}\/\d{2}\/\d{4},/.test(firstLine) && splitCsvLine(firstLine).length >= 3)
    return "commbank";
  return null;
}

function parseKnown(text: string, fmt: ImportFormat): ImportRow[] {
  switch (fmt) {
    case "wise":       return parseWiseCSV(text);
    case "cimb":       return parseCIMBCSV(text);
    case "nationwide": return parseNationwideCSV(text);
    case "commbank":   return parseCommBankCSV(text);
    default:           return [];
  }
}

// ─── generic column-mapper ────────────────────────────────────────────────────

/** Split a CSV into a header row (or synthesised names) + data rows. */
function parseGenericCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = splitCsvLine(lines[0]);
  // First line is a header when every cell is non-empty and non-numeric.
  const looksHeader =
    first.length > 1 &&
    first.every(
      (c) => c.trim() !== "" && isNaN(Number(c.replace(/[,$\s]/g, ""))),
    );
  const headers = looksHeader
    ? first.map((h, i) => h.trim() || `Column ${i + 1}`)
    : first.map((_, i) => `Column ${i + 1}`);
  const body = looksHeader ? lines.slice(1) : lines;
  return { headers, rows: body.map((l) => splitCsvLine(l)) };
}

export const DATE_FORMATS = [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD-MM-YYYY",
  "DD/MM/YY",
  "MM/DD/YY",
  "DD MMM YYYY",
] as const;

const MONTH_ABBR3: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a date string against one of DATE_FORMATS → ISO yyyy-MM-dd, or null. */
function parseGenericDate(raw: string, fmt: string): string | null {
  const parts = raw.trim().split(/[/\-.\s]+/).filter(Boolean);
  const tokens = fmt.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== tokens.length) return null;
  let d = "", m = "", y = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toUpperCase();
    const p = parts[i];
    if (t === "MMM") {
      const mm = MONTH_ABBR3[p.slice(0, 3).toLowerCase()];
      if (!mm) return null;
      m = String(mm);
    } else if (t.startsWith("D")) d = p;
    else if (t.startsWith("M")) m = p;
    else if (t.startsWith("Y")) y = p;
  }
  let yr = parseInt(y, 10);
  const mo = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (!yr || !mo || !day || mo > 12 || day > 31) return null;
  if (yr < 100) yr += 2000;
  return `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse a possibly-formatted money cell to a signed number. */
function genericAmount(s: string): number {
  if (!s) return 0;
  let str = s.trim();
  const neg = /^\(.*\)$/.test(str) || str.includes("-") || /DR$/i.test(str);
  str = str.replace(/[^0-9.]/g, "");
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

export interface ColumnMapping {
  dateCol: number;
  descCol: number;
  notesCol: number | null;
  amountMode: "single" | "split";
  amountCol: number | null;
  inCol: number | null;
  outCol: number | null;
  dateFmt: string;
  /** Single-amount mode: treat a positive value as an expense (some exports do). */
  invert: boolean;
}

/** Build ImportRows from raw data + a column mapping. Skips unparseable rows. */
function buildGenericRows(
  data: { rows: string[][] },
  m: ColumnMapping,
): ImportRow[] {
  const out: ImportRow[] = [];
  for (const cells of data.rows) {
    const date = parseGenericDate(cells[m.dateCol] ?? "", m.dateFmt);
    if (!date) continue;

    let amount = 0;
    let type: ImportRow["type"];
    if (m.amountMode === "single" && m.amountCol != null) {
      const v = genericAmount(cells[m.amountCol] ?? "");
      if (v === 0) continue;
      const isExpense = m.invert ? v > 0 : v < 0;
      amount = Math.abs(v);
      type = isExpense ? "expense" : "income";
    } else {
      const inV = m.inCol != null ? Math.abs(genericAmount(cells[m.inCol] ?? "")) : 0;
      const outV = m.outCol != null ? Math.abs(genericAmount(cells[m.outCol] ?? "")) : 0;
      if (outV > 0) { amount = outV; type = "expense"; }
      else if (inV > 0) { amount = inV; type = "income"; }
      else continue;
    }

    const merchant = (cells[m.descCol] ?? "").trim() || null;
    const notes =
      m.notesCol != null ? (cells[m.notesCol] ?? "").trim() || null : null;
    out.push({
      type,
      date,
      amount,
      currency: "",
      account_id: "",
      merchant,
      notes,
      external_id: `${date}|${amount.toFixed(2)}|${(merchant ?? "").slice(0, 24)}`,
    });
  }
  return out;
}

// ─── component ───────────────────────────────────────────────────────────────

export function Import() {
  const { data: accounts = [] } = useAccounts();
  const { data: rules = [] } = useCategorizationRules();
  const { data: categories = [] } = useCategories();
  const bulk = useBulkImport();
  const deleteBatch = useDeleteBatch();
  const { data: batches = [] } = useImportBatches();
  const { data: allTxns = [] } = useTransactions();

  const categoryKind = useMemo(
    () => new Map(categories.map((c) => [c.id, c.kind])),
    [categories],
  );

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapper, setMapper] = useState<{ headers: string[]; rows: string[][] } | null>(
    null,
  );
  const [emptyParse, setEmptyParse] = useState(false);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<ImportFormat>("commbank");
  const [accountId, setAccountId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileName(file.name);
      setConfirming(false);
      const known = detectKnownFormat(text);
      if (known) {
        const parsed = parseKnown(text, known);
        setRows(parsed);
        setMapper(null);
        setEmptyParse(parsed.length === 0);
        setFormat(known);
      } else {
        // Unrecognised bank → hand off to the generic column mapper.
        const g = parseGenericCSV(text);
        setRows([]);
        setEmptyParse(g.rows.length === 0);
        setMapper(g.rows.length > 0 ? g : null);
      }
    };
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  }

  // No default account — the user must consciously pick one before importing.
  const acct = accounts.find((a) => a.id === accountId);
  const ready = rows.length > 0 && !!acct && !bulk.isPending;

  // ── Confirm-step stats ──────────────────────────────────────────────────────
  const sortedDates = useMemo(() => [...rows.map((r) => r.date)].sort(), [rows]);

  // transfer + adjustment = own-account moves, excluded from income/expense net
  const transferCount = useMemo(
    () => rows.filter((r) => r.type === "transfer" || r.type === "adjustment").length,
    [rows],
  );
  const expenseCount = useMemo(
    () => rows.filter((r) => r.type === "expense").length,
    [rows],
  );
  const incomeCount = useMemo(
    () => rows.filter((r) => r.type === "income").length,
    [rows],
  );
  const expenseTotal = useMemo(
    () => rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0),
    [rows],
  );
  const incomeTotal = useMemo(
    () => rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0),
    [rows],
  );

  // Auto-categorisation: the effect an enabled rule would apply to a row, or null.
  // Account-field rules need the chosen account, so this depends on `acct`.
  // Transfer-ins already recorded into the chosen account — used to auto-flag
  // likely duplicates (e.g. a Wise→CommBank top-up the bank CSV also lists as a
  // "CREDIT TO ACCOUNT" credit, which would double-count the balance).
  const transferIns = useMemo(
    () =>
      allTxns
        .filter((t) => t.type === "transfer" && t.destination_account_id === accountId)
        .map((t) => ({ amt: Number(t.destination_amount ?? t.amount), date: t.date })),
    [allTxns, accountId],
  );

  function isLikelyTransferDup(r: ImportRow): boolean {
    if (r.type !== "income" && r.type !== "adjustment") return false;
    const rd = Date.parse(r.date);
    return transferIns.some(
      (ti) =>
        Math.abs(ti.amt - r.amount) < 0.01 &&
        Math.abs(Date.parse(ti.date) - rd) <= 3 * 86_400_000,
    );
  }

  const flaggedCount = useMemo(
    () => (accountId ? rows.filter(isLikelyTransferDup).length : 0),
    // isLikelyTransferDup is derived from transferIns
    [rows, transferIns, accountId],
  );

  function ruleEffectFor(
    r: ImportRow,
  ): { category_id: string; reimbursable: boolean } | null {
    if ((r.type !== "expense" && r.type !== "income") || !acct) return null;
    const eff = categorize(
      { merchant: r.merchant, notes: r.notes, amount: r.amount, account_id: acct.id },
      rules,
    );
    if (!eff || !eff.categoryId) return null;
    const wanted = r.type === "income" ? "income" : "expense";
    const k = categoryKind.get(eff.categoryId);
    if (k && k !== wanted) return null;
    return {
      category_id: eff.categoryId,
      reimbursable: r.type === "expense" && eff.reimbursable === true,
    };
  }

  const categorizedCount = useMemo(
    () => (acct ? rows.filter((r) => ruleEffectFor(r) != null).length : 0),
    [rows, rules, acct, categoryKind], // ruleEffectFor is derived from these
  );

  async function doImport() {
    if (!acct) return;
    const withAccount = rows.map((r) => {
      // Preserve a per-row currency when the source provides one (Wise carries
      // MYR/AUD per row); CommBank/CIMB rows have no currency → use the account's.
      const row: ImportRow = {
        ...r,
        currency: r.currency || acct.currency,
        account_id: acct.id,
      };
      const eff = ruleEffectFor(r);
      if (eff) {
        row.category_id = eff.category_id;
        if (eff.reimbursable) row.is_reimbursable = true;
      }
      if (isLikelyTransferDup(r)) row.flagged = true;
      return row;
    });
    const source =
      format === "cimb" ? "cimb_csv"
      : format === "wise" ? "wise_csv"
      : format === "nationwide" ? "nationwide_csv"
      : format === "generic" ? "generic_csv"
      : "commbank_csv";
    await bulk.mutateAsync({ fileName, source, rows: withAccount });
  }

  async function undoImport() {
    if (!bulk.data?.batchId) return;
    await deleteBatch.mutateAsync(bulk.data.batchId);
    bulk.reset();
    setRows([]);
    setMapper(null);
    setEmptyParse(false);
  }

  const isDone = bulk.isSuccess;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-2">
        <Link
          to="/settings"
          className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:text-ink-200"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Import transactions
        </h1>
      </header>

      <div className="space-y-4">
        {/* How-to hint */}
        <Card className="flex gap-3 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-500" />
          <div className="space-y-1 text-sm text-ink-400">
            <p>
              <span className="text-ink-300">CommBank:</span> My accounts →
              select account → Export → date range → CSV
            </p>
            <p>
              <span className="text-ink-300">CIMB Clicks:</span> Account →
              Transaction History → Download → CSV
            </p>
            <p>
              <span className="text-ink-300">Wise:</span> Statements → All →
              Download → CSV (transaction history)
            </p>
          </div>
        </Card>

        {/* ── Drop zone ─────────────────────────────────────────────────────── */}
        {rows.length === 0 && !isDone && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed py-14 transition-colors",
              dragging
                ? "border-teal-500 bg-teal-500/5"
                : "border-ink-700 hover:border-ink-600",
            )}
          >
            <FileUp className="size-8 text-ink-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-ink-300">
                Drop any bank CSV here
              </p>
              <p className="mt-0.5 text-xs text-ink-600">
                CommBank · CIMB · Wise · Nationwide auto-detected — any other CSV
                maps by column · or tap to browse
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* Loaded a file but parsed nothing usable */}
        {emptyParse && !isDone && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertCircle className="size-4 shrink-0 text-amber-400" />
            <span className="text-sm text-amber-200">
              Couldn't read any rows from{" "}
              <span className="font-medium">{fileName}</span>. Make sure it's a
              CSV file with a row per transaction.
            </span>
          </div>
        )}

        {/* Unrecognised bank → map the columns yourself */}
        {mapper && rows.length === 0 && !isDone && (
          <ColumnMapper
            data={mapper}
            fileName={fileName}
            onApply={(built) => {
              setRows(built);
              setFormat("generic");
              setMapper(null);
              setEmptyParse(built.length === 0);
            }}
            onCancel={() => {
              setMapper(null);
              setFileName("");
            }}
          />
        )}

        {/* ── Preview + account selector ──────────────────────────────────── */}
        {rows.length > 0 && !isDone && !confirming && (
          <>
            <Card className="space-y-3">
              <div className="flex items-end gap-3">
                <label className="block flex-1">
                  <span className="mb-1 block text-xs font-medium text-ink-400">
                    Account
                  </span>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-sm text-ink-50 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="" disabled>
                      Select account…
                    </option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  onClick={() => setConfirming(true)}
                  disabled={!ready}
                  className="shrink-0"
                >
                  Review {rows.length}
                </Button>
              </div>

              {/* Account type indicator */}
              {acct && (
                <div className="flex items-center gap-1.5 pl-0.5">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      ACCOUNT_TYPE_COLORS[acct.type].dot,
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      ACCOUNT_TYPE_COLORS[acct.type].text,
                    )}
                  >
                    {ACCOUNT_TYPE_LABELS[acct.type]}
                  </span>
                  {transferCount > 0 && (
                    <span className="ml-2 flex items-center gap-1 text-xs text-ink-500">
                      <ArrowLeftRight className="size-3" />
                      {transferCount} transfer{transferCount !== 1 ? "s" : ""} detected
                    </span>
                  )}
                </div>
              )}
            </Card>

            {/* Transaction preview */}
            <Card className="divide-y divide-ink-800/70 py-0">
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3 text-xs font-medium text-ink-600">
                  <span className="w-10 shrink-0">Date</span>
                  <span className="flex-1">Description</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-400">
                    {FORMAT_LABELS[format]}
                  </span>
                  <span className="tnum w-20 shrink-0 text-right text-xs font-medium text-ink-600">
                    Amount
                  </span>
                </div>
              </div>

              {rows.slice(0, 200).map((row, i) => {
                // transfer = out (−), adjustment = in (+), both shown with ↔
                const isXfer = row.type === "transfer" || row.type === "adjustment";
                const sign = row.type === "transfer" ? "−" : "+";
                const amtCls = row.type === "transfer"
                  ? "text-ink-500"
                  : row.type === "adjustment"
                    ? "text-sky-400/70"
                    : row.type === "income"
                      ? "text-teal-400"
                      : "text-ink-300";

                return (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 text-xs text-ink-500">
                      {row.date.slice(5).replace("-", "/")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-300">
                      {row.merchant ?? ""}
                      {row.notes && (
                        <span className="ml-1.5 text-xs text-ink-600">
                          {row.notes}
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isXfer && (
                        <ArrowLeftRight className="size-3 text-ink-600" />
                      )}
                      <span className={cn("tnum w-20 text-right text-sm font-medium", amtCls)}>
                        {sign}{row.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {rows.length > 200 && (
                <p className="py-3 text-center text-xs text-ink-500">
                  +{rows.length - 200} more rows
                </p>
              )}
            </Card>
          </>
        )}

        {/* ── Confirm step ─────────────────────────────────────────────────── */}
        {rows.length > 0 && !isDone && confirming && (
          <Card className="space-y-4">
            <div>
              <p className="font-semibold text-ink-100">Confirm import</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Importing into{" "}
                <span
                  className={cn(
                    "font-medium",
                    acct ? ACCOUNT_TYPE_COLORS[acct.type].text : "text-ink-200",
                  )}
                >
                  {acct?.name}
                </span>
                {acct && (
                  <span className="text-ink-400"> ({acct.currency})</span>
                )}
                . Double-check the account is correct before proceeding.
              </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2">
              {/* Date range */}
              <div className="rounded-xl bg-ink-900/80 p-3">
                <p className="text-xs text-ink-600">Date range</p>
                {sortedDates.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-ink-300">
                    {formatDate(sortedDates[0]!)}
                    {sortedDates.length > 1 &&
                      sortedDates[0] !== sortedDates[sortedDates.length - 1] && (
                        <>
                          {" → "}
                          {formatDate(sortedDates[sortedDates.length - 1]!)}
                        </>
                      )}
                  </p>
                )}
              </div>

              {/* Format + total count */}
              <div className="rounded-xl bg-ink-900/80 p-3">
                <p className="text-xs text-ink-600">Source</p>
                <p className="mt-1 text-sm font-semibold text-ink-100">
                  {FORMAT_LABELS[format]}
                </p>
                <p className="text-xs text-ink-500">{rows.length} transactions</p>
              </div>

              {/* Expenses */}
              <div className="rounded-xl bg-ink-900/80 p-3">
                <p className="text-xs text-ink-600">Expenses</p>
                <p className="mt-1 text-sm font-semibold text-ink-100">
                  {expenseCount}
                </p>
                {acct && expenseTotal > 0 && (
                  <p className="text-xs text-ink-500">
                    {formatMoney(expenseTotal, acct.currency)}
                  </p>
                )}
              </div>

              {/* Income */}
              <div className="rounded-xl bg-ink-900/80 p-3">
                <p className="text-xs text-ink-600">Income</p>
                <p className="mt-1 text-sm font-semibold text-teal-400">
                  {incomeCount}
                </p>
                {acct && incomeTotal > 0 && (
                  <p className="text-xs text-ink-500">
                    {formatMoney(incomeTotal, acct.currency)}
                  </p>
                )}
              </div>
            </div>

            {/* Transfer notice — shown only when transfers were detected */}
            {transferCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-ink-700/50 bg-ink-900/60 px-3 py-2.5">
                <ArrowLeftRight className="size-4 shrink-0 text-ink-500" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink-300">
                    {transferCount} transfer{transferCount !== 1 ? "s" : ""} detected
                  </span>
                  <span className="ml-2 text-xs text-ink-600">
                    · excluded from income/expense net
                  </span>
                </div>
              </div>
            )}

            {/* Auto-categorisation notice */}
            {categorizedCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-2.5">
                <Wand2 className="size-4 shrink-0 text-teal-400/80" />
                <span className="text-sm font-medium text-ink-300">
                  {categorizedCount} auto-categorised by rules
                </span>
              </div>
            )}

            {/* Duplicate-transfer warning */}
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <Flag className="size-4 shrink-0 text-amber-400" />
                <span className="text-sm font-medium text-amber-200">
                  {flaggedCount} flagged as a possible duplicate transfer — review
                  in Activity (flag filter) after importing.
                </span>
              </div>
            )}

            {bulk.isError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                {(bulk.error as Error).message}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={bulk.isPending}
                className="flex-1"
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                size="sm"
                onClick={doImport}
                disabled={bulk.isPending}
                className="flex-1"
              >
                {bulk.isPending ? "Importing…" : `Import ${rows.length} transactions`}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Success state ─────────────────────────────────────────────────── */}
        {isDone && (
          <Card className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="size-10 text-teal-400" />
            <div className="text-center">
              <p className="font-semibold text-ink-100">
                {bulk.data?.count === 0
                  ? "Nothing new to import"
                  : `${bulk.data?.count} transactions imported`}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {bulk.data && bulk.data.skipped > 0 ? (
                  <>
                    {bulk.data.skipped} already-imported{" "}
                    {bulk.data.skipped === 1 ? "row was" : "rows were"} skipped.
                  </>
                ) : (
                  "Grouped as one batch — assign categories in Activity."
                )}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/transactions">
                <Button size="sm">View in Activity</Button>
              </Link>
              {bulk.data?.batchId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={undoImport}
                  disabled={deleteBatch.isPending}
                >
                  {deleteBatch.isPending ? (
                    <>
                      <Spinner className="size-4" /> Undoing…
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" /> Undo import
                    </>
                  )}
                </Button>
              )}
            </div>

            {deleteBatch.isError && (
              <p className="text-xs text-red-400">
                {(deleteBatch.error as Error).message}
              </p>
            )}
          </Card>
        )}

        {/* ── Import history ────────────────────────────────────────────────── */}
        {batches.length > 0 && (
          <div className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
              Recent imports
            </h2>
            <Card className="divide-y divide-ink-800/70 py-0">
              {batches.map((batch) =>
                deletingId === batch.id ? (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <p className="text-sm text-ink-300">
                      Delete{" "}
                      <span className="font-medium text-ink-100">
                        {batch.row_count} transactions
                      </span>
                      ?
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setDeletingId(null)}
                        disabled={deleteBatch.isPending}
                        className="rounded-lg px-2 py-1 text-xs text-ink-500 hover:text-ink-200 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          await deleteBatch.mutateAsync(batch.id);
                          setDeletingId(null);
                        }}
                        disabled={deleteBatch.isPending}
                        className="rounded-lg bg-red-950/60 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/60 disabled:opacity-50"
                      >
                        {deleteBatch.isPending ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={batch.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                          {SOURCE_LABELS[batch.source ?? ""] ?? batch.source ?? "CSV"}
                        </span>
                        <span className="truncate text-sm text-ink-300">
                          {batch.file_name ?? "Unknown file"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-600">
                        {batch.row_count} transactions ·{" "}
                        {formatDistanceToNow(new Date(batch.imported_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeletingId(batch.id)}
                      aria-label="Delete import"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-red-950/40 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ),
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── generic column-mapper UI ─────────────────────────────────────────────────

const mapSelectCls =
  "h-9 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-2 text-sm text-ink-50 focus:border-teal-500 focus:outline-none";

function guessCol(headers: string[], re: RegExp, fallback = -1): number {
  const i = headers.findIndex((h) => re.test(h));
  return i >= 0 ? i : fallback;
}

function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  allowNone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  headers: string[];
  allowNone?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={mapSelectCls}
      >
        {allowNone && <option value={-1}>None</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Map an unrecognised bank CSV's columns onto transaction fields. */
function ColumnMapper({
  data,
  fileName,
  onApply,
  onCancel,
}: {
  data: { headers: string[]; rows: string[][] };
  fileName: string;
  onApply: (rows: ImportRow[]) => void;
  onCancel: () => void;
}) {
  const headers = data.headers;
  const gOut = guessCol(headers, /paid\s*out|debit|withdraw|money\s*out/i);
  const gIn = guessCol(headers, /paid\s*in|credit|deposit|money\s*in/i);

  const [dateCol, setDateCol] = useState(() =>
    Math.max(0, guessCol(headers, /date/i, 0)),
  );
  const [descCol, setDescCol] = useState(() =>
    Math.max(
      0,
      guessCol(
        headers,
        /desc|detail|narrat|payee|merchant|reference|name/i,
        headers.length > 1 ? 1 : 0,
      ),
    ),
  );
  const [notesCol, setNotesCol] = useState(-1);
  const [amountMode, setAmountMode] = useState<"single" | "split">(
    gOut >= 0 && gIn >= 0 ? "split" : "single",
  );
  const [amountCol, setAmountCol] = useState(() =>
    Math.max(0, guessCol(headers, /amount|value/i, headers.length - 1)),
  );
  const [inCol, setInCol] = useState(gIn);
  const [outCol, setOutCol] = useState(gOut);
  const [dateFmt, setDateFmt] = useState<string>(DATE_FORMATS[0]);
  const [invert, setInvert] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = useMemo(
    () =>
      buildGenericRows(data, {
        dateCol,
        descCol,
        notesCol: notesCol < 0 ? null : notesCol,
        amountMode,
        amountCol: amountMode === "single" ? amountCol : null,
        inCol: amountMode === "split" ? (inCol < 0 ? null : inCol) : null,
        outCol: amountMode === "split" ? (outCol < 0 ? null : outCol) : null,
        dateFmt,
        invert,
      }),
    [data, dateCol, descCol, notesCol, amountMode, amountCol, inCol, outCol, dateFmt, invert],
  );
  const preview = built.slice(0, 5);

  function apply() {
    if (built.length === 0) {
      setError(
        "No rows parsed — check the date column, date format, and amount column.",
      );
      return;
    }
    onApply(built);
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-200">Map the columns</h2>
          <p className="truncate text-xs text-ink-500">
            {fileName} · unrecognised format · {data.rows.length} rows
          </p>
        </div>
        <button
          onClick={onCancel}
          className="shrink-0 text-xs text-ink-500 transition-colors hover:text-ink-300"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColumnSelect label="Date column" value={dateCol} onChange={setDateCol} headers={headers} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Date format</span>
          <select
            value={dateFmt}
            onChange={(e) => setDateFmt(e.target.value)}
            className={mapSelectCls}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <ColumnSelect label="Description" value={descCol} onChange={setDescCol} headers={headers} />
        <ColumnSelect label="Notes (optional)" value={notesCol} onChange={setNotesCol} headers={headers} allowNone />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-ink-400">Amount columns</span>
        <div className="grid grid-cols-2 gap-2">
          {(["single", "split"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAmountMode(mode)}
              className={cn(
                "h-9 rounded-xl border text-xs font-medium transition-colors",
                amountMode === mode
                  ? "border-teal-500 bg-teal-500/10 text-teal-300"
                  : "border-ink-700 text-ink-400",
              )}
            >
              {mode === "single" ? "One amount column" : "Separate in / out"}
            </button>
          ))}
        </div>
      </div>

      {amountMode === "single" ? (
        <div className="grid grid-cols-2 gap-2">
          <ColumnSelect label="Amount" value={amountCol} onChange={setAmountCol} headers={headers} />
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-ink-700/60 bg-ink-950/30 px-3">
            <span className="text-xs text-ink-400">Positive = spent</span>
            <button
              type="button"
              role="switch"
              aria-checked={invert}
              onClick={() => setInvert((v) => !v)}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                invert ? "bg-teal-500" : "bg-ink-700",
              )}
            >
              <span
                className={cn(
                  "block size-3.5 rounded-full bg-white transition-transform",
                  invert ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ColumnSelect label="Money out (spent)" value={outCol} onChange={setOutCol} headers={headers} allowNone />
          <ColumnSelect label="Money in (received)" value={inCol} onChange={setInCol} headers={headers} allowNone />
        </div>
      )}

      <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-2">
        <p className="mb-1 px-1 text-xs font-medium text-ink-500">
          Preview · {built.length} row{built.length === 1 ? "" : "s"} parsed
        </p>
        {preview.length === 0 ? (
          <p className="px-1 py-2 text-xs text-ink-500">
            Nothing parsed yet — adjust the columns above.
          </p>
        ) : (
          <ul className="divide-y divide-ink-800/70">
            {preview.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-1 py-1.5 text-xs">
                <span className="tnum w-16 shrink-0 text-ink-500">{r.date}</span>
                <span className="min-w-0 flex-1 truncate text-ink-300">
                  {r.merchant ?? "—"}
                </span>
                <span
                  className={cn(
                    "tnum shrink-0",
                    r.type === "income" ? "text-teal-400" : "text-ink-300",
                  )}
                >
                  {r.type === "expense" ? "−" : "+"}
                  {r.amount.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Button size="sm" className="w-full" onClick={apply} disabled={built.length === 0}>
        Use these columns · {built.length}
      </Button>
    </Card>
  );
}
