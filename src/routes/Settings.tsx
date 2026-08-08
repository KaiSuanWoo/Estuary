import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, LogOut, RefreshCw, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useProfile";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAccounts } from "@/hooks/useAccounts";
import { useFxRates, useLiveRates, useRateMap, useUpsertFxRate } from "@/hooks/useFxRates";
import {
  useInvestmentSnapshot,
  useUpsertInvestmentSnapshot,
  useMaterializeInvestmentAccounts,
  useClearInvestmentSnapshot,
} from "@/hooks/useInvestmentSnapshot";
import { buildRateMap, convert } from "@/lib/fx";
import { investmentTotalInBase, parseZenithSnapshot } from "@/lib/investments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CURRENCIES, PAY_CYCLES } from "@/lib/constants";
import {
  applyHide,
  applyLamp,
  HIDES,
  HIDE_LABELS,
  HIDE_NOTES,
  HIDE_TONES,
  LAMPS,
  readHide,
  readLamp,
  readShowHomeBudgets,
  writeShowHomeBudgets,
  type Hide,
  type Lamp,
} from "@/lib/ledger";
import { Button, Spinner } from "@/components/ui";
import { PageHead, Register } from "@/components/ledger";

const controlCls =
  "h-11 rounded-[2px] border border-rule bg-well px-3 text-quill focus:border-brass focus:outline-none";

/** A settings entry: what it is on the left, what it's set to on the right. */
function Line({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-quill">{label}</p>
        {note && <p className="text-xs italic text-quill-faint">{note}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** A settings entry that is itself a way onward. */
function LinkLine({ to, label, note }: { to: string; label: string; note: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0"
    >
      <div className="min-w-0">
        <p className="text-quill">{label}</p>
        <p className="text-xs italic text-quill-faint">{note}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-quill-faint transition-transform group-hover:translate-x-1 group-hover:text-quill" />
    </Link>
  );
}

export function Settings() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="Settings" note="How the book is kept, and how it is bound" />

      {isLoading || !settings ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <Register title="The account">
            <Line label="Base currency" note="Everything is totalled in this">
              <select
                aria-label="Base currency"
                value={settings.base_currency}
                onChange={(e) => update.mutate({ base_currency: e.target.value })}
                className={cn(controlCls, "w-28")}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Line>
            <Line label="Pay cycle" note="Paces a budget against its period">
              <select
                aria-label="Pay cycle"
                value={settings.pay_cycle}
                onChange={(e) => update.mutate({ pay_cycle: e.target.value })}
                className={cn(controlCls, "w-36 capitalize")}
              >
                {PAY_CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Line>
          </Register>

          <TheBook />

          <Register title="Kept elsewhere">
            <LinkLine
              to="/import"
              label="Import transactions"
              note="CommBank · CIMB · Wise · Nationwide"
            />
            <LinkLine
              to="/categories"
              label="Categories"
              note="The heads every entry is filed under"
            />
            <LinkLine
              to="/merchants"
              label="Merchants"
              note="Group and rename bank descriptors"
            />
            {profile?.is_admin && (
              <LinkLine to="/admin" label="Approvals" note="Review beta sign-ups" />
            )}
          </Register>

          <ExchangeRates baseCurrency={settings.base_currency} />

          <ZenithSync baseCurrency={settings.base_currency} />

          <Register title="Signed in">
            <Line label={user?.email ?? "—"}>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </Line>
          </Register>

          <p className="mt-8 text-center text-xs italic text-quill-faint">
            Estuary · dual-currency cash-flow tracker
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The physical book: the light it's read under, the hide it's bound in, and
 * what its first page carries.
 *
 * All three are stored per device rather than per account — a phone in bed
 * wants a different lamp from a desk at noon, and a phone has a screenful less
 * room for a budget line.
 */
function TheBook() {
  const [lamp, setLamp] = useState<Lamp>(readLamp);
  const [hide, setHide] = useState<Hide>(readHide);
  const [showBudgets, setShowBudgets] = useState(readShowHomeBudgets);

  return (
    <Register
      title="The book"
      note="This device only — your other screens keep their own"
    >
      <Line label="Lamp" note="Day, night, or whatever the device is doing">
        <div className="flex overflow-hidden rounded-[2px] border border-rule">
          {LAMPS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lamp === l}
              onClick={() => {
                setLamp(l);
                applyLamp(l);
              }}
              className={cn(
                "px-3 py-1.5 text-xs capitalize transition-colors",
                lamp === l ? "brass-face" : "text-quill-soft hover:text-quill",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </Line>

      <Line label="Binding" note={HIDE_NOTES[hide]}>
        <div className="flex items-center gap-2">
          {HIDES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={HIDE_LABELS[h]}
              aria-pressed={hide === h}
              onClick={() => {
                setHide(h);
                applyHide(h);
              }}
              // The swatch is a scrap of the hide itself — grain, sheen and all —
              // so the choice is made against the material, not a colour name.
              // The tones are set on the element because the `data-hide` rules
              // in the stylesheet only ever match :root.
              style={
                {
                  "--color-hide-a": HIDE_TONES[h][0],
                  "--color-hide-b": HIDE_TONES[h][1],
                } as React.CSSProperties
              }
              className={cn(
                "surface-hide size-7 rounded-[2px] transition-transform",
                hide === h
                  ? "ring-2 ring-brass ring-offset-2 ring-offset-page"
                  : "hover:-translate-y-0.5",
              )}
            />
          ))}
        </div>
      </Line>

      <Line label="Budgets on Home" note="One line: spent, limit, what's left">
        <button
          type="button"
          role="switch"
          aria-checked={showBudgets}
          aria-label="Show budgets on Home"
          onClick={() => {
            const next = !showBudgets;
            setShowBudgets(next);
            writeShowHomeBudgets(next);
          }}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
            showBudgets ? "border-brass bg-brass/30" : "border-rule",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-4 rounded-full transition-all",
              showBudgets ? "left-[1.55rem] bg-brass" : "left-0.5 bg-quill-faint",
            )}
          />
        </button>
      </Line>
    </Register>
  );
}

/** Investments bridge — reads Zenith's live snapshot, with a manual-paste fallback. */
function ZenithSync({ baseCurrency }: { baseCurrency: string }) {
  const { data: snapshot } = useInvestmentSnapshot();
  const upsert = useUpsertInvestmentSnapshot();
  const materialize = useMaterializeInvestmentAccounts();
  const clear = useClearInvestmentSnapshot();
  const rates = useRateMap();

  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalBase = investmentTotalInBase(snapshot, baseCurrency, rates);
  const n = snapshot?.accounts.length ?? 0;

  function onImport() {
    setError(null);
    let parsed;
    try {
      parsed = parseZenithSnapshot(raw);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    upsert.mutate(
      {
        source: "zenith",
        base_currency: parsed.base_currency,
        total: parsed.total,
        as_of: parsed.as_of,
        accounts: parsed.accounts,
      },
      {
        onSuccess: () => {
          // Keep the manual path equivalent to the live push: mirror snapshot
          // accounts into real investment accounts.
          materialize.mutate(parsed.accounts);
          setRaw("");
          setOpen(false);
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <Register
      title="Investments · Zenith"
      action={
        snapshot && (
          <button
            onClick={() => clear.mutate("zenith")}
            className="text-xs italic text-quill-faint transition-colors hover:text-debit"
          >
            disconnect
          </button>
        )
      }
    >
      <div className="flex items-center gap-3 border-b border-rule pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border border-rule text-head-5">
          <TrendingUp className="size-4" />
        </span>
        <p className="text-sm text-quill-soft">
          {snapshot
            ? `${formatMoney(totalBase, baseCurrency)} · ${n} account${n === 1 ? "" : "s"}${
                snapshot.as_of
                  ? ` · ${new Date(snapshot.as_of).toLocaleDateString()}`
                  : ""
              }`
            : "Not linked yet — open Zenith once and it syncs automatically."}
        </p>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs italic text-quill-faint underline decoration-rule underline-offset-4 transition-colors hover:text-quill"
      >
        {open ? "hide manual import" : "import from a Zenith export…"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={
              '{ "base_currency": "AUD", "total": 42150,\n  "accounts": [ { "name": "IBKR", "currency": "USD", "value": 21000 } ] }'
            }
            className="w-full rounded-[2px] border border-rule bg-well p-3 font-mono text-xs text-quill placeholder:text-quill-faint focus:border-brass focus:outline-none"
          />
          {error && <p className="text-xs text-debit">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs italic text-quill-faint">
              Zenith writes this live; paste an export to sync manually.
            </p>
            <Button
              size="sm"
              onClick={onImport}
              disabled={!raw.trim() || upsert.isPending}
            >
              {upsert.isPending ? "Saving…" : "Import"}
            </Button>
          </div>
        </div>
      )}
    </Register>
  );
}

function ExchangeRates({ baseCurrency }: { baseCurrency: string }) {
  const { data: accounts = [] } = useAccounts();
  const { data: stored = [] } = useFxRates();
  const { data: live, isFetching, isError, refetch } = useLiveRates(baseCurrency);

  const storedMap = buildRateMap(stored);
  const foreign = [
    ...new Set(accounts.map((a) => a.currency).filter((c) => c !== baseCurrency)),
  ];

  if (foreign.length === 0) return null;

  return (
    <Register
      title="Exchange rates"
      note={
        isFetching
          ? "Fetching live rates…"
          : isError
            ? "Live rates unavailable — enter them by hand."
            : live
              ? `Rates updated · ${live.date}`
              : "Fetching live rates…"
      }
      action={
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh rates"
          className="flex size-7 items-center justify-center rounded-[2px] text-quill-faint transition-colors hover:text-quill disabled:opacity-40"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        </button>
      }
    >
      <div className="space-y-2">
        {foreign.map((currency) => {
          const storedRate = convert(1, currency, baseCurrency, storedMap);
          // Frankfurter returns "1 base = X quote", so invert to get "1 foreign = ? base"
          const liveRate =
            live?.rates[currency] != null && live.rates[currency] > 0
              ? 1 / live.rates[currency]
              : undefined;
          return (
            <RateRow
              key={currency}
              from={currency}
              to={baseCurrency}
              stored={storedRate}
              live={liveRate}
            />
          );
        })}
      </div>
    </Register>
  );
}

function RateRow({
  from,
  to,
  stored,
  live,
}: {
  from: string;
  to: string;
  stored: number | null;
  live: number | undefined;
}) {
  const upsert = useUpsertFxRate();
  // Initialise from stored rate; fall back to live once it arrives
  const [value, setValue] = useState(stored != null ? stored.toFixed(4) : "");

  // When live rate first arrives, pre-fill if there's no stored rate yet
  useEffect(() => {
    if (stored == null && live != null && value === "") {
      setValue(live.toFixed(4));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const liveStr = live != null ? live.toFixed(4) : null;
  const hasOverride = stored != null;
  // Show "live: X  reset" hint when the user has a stored rate that differs from live
  const showLiveHint =
    hasOverride && liveStr != null && stored.toFixed(4) !== liveStr;

  function save() {
    const rate = Number(value);
    if (rate > 0) upsert.mutate({ base: from, quote: to, rate });
  }

  function resetToLive() {
    if (live == null) return;
    setValue(live.toFixed(4));
    upsert.mutate({ base: from, quote: to, rate: live });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-24 text-sm text-quill-soft">1 {from} =</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder={liveStr ?? "0.0000"}
          aria-label={`Rate from ${from} to ${to}`}
          className="tnum h-10 flex-1 rounded-[2px] border border-rule bg-well px-3 text-quill focus:border-brass focus:outline-none"
        />
        <span className="w-10 text-sm text-quill-soft">{to}</span>
        {!hasOverride && live != null && (
          <span className="shrink-0 rounded-[2px] border border-rule px-1.5 py-0.5 text-[10px] italic text-quill-faint">
            live
          </span>
        )}
      </div>
      {showLiveHint && (
        <div className="flex items-center gap-1.5 pl-[6.5rem]">
          <span className="text-xs italic text-quill-faint">live: {liveStr}</span>
          <button
            onClick={resetToLive}
            className="text-xs italic text-quill-faint underline decoration-rule underline-offset-4 transition-colors hover:text-quill"
          >
            reset
          </button>
        </div>
      )}
    </div>
  );
}
