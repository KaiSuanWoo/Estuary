import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, LogOut, RefreshCw, ShieldCheck, Tag, Target, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useProfile";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAccounts } from "@/hooks/useAccounts";
import { useFxRates, useLiveRates, useRateMap, useUpsertFxRate } from "@/hooks/useFxRates";
import {
  useInvestmentSnapshot,
  useUpsertInvestmentSnapshot,
  useClearInvestmentSnapshot,
} from "@/hooks/useInvestmentSnapshot";
import { buildRateMap, convert } from "@/lib/fx";
import { investmentTotalInBase, parseZenithSnapshot } from "@/lib/investments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CURRENCIES, PAY_CYCLES } from "@/lib/constants";
import { Button, Card, PageHeader, Spinner } from "@/components/ui";

const controlCls =
  "h-11 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-ink-50 focus:border-teal-500 focus:outline-none";

export function Settings() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />

      {isLoading || !settings ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-300">
                Base currency
              </span>
              <select
                value={settings.base_currency}
                onChange={(e) => update.mutate({ base_currency: e.target.value })}
                className={controlCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-300">
                Pay cycle
              </span>
              <select
                value={settings.pay_cycle}
                onChange={(e) => update.mutate({ pay_cycle: e.target.value })}
                className={controlCls}
              >
                {PAY_CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </Card>

          <Link to="/import">
            <Card className="flex items-center justify-between transition-colors hover:bg-ink-900">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300">
                  <Download className="size-4" />
                </span>
                <div>
                  <p className="font-medium text-ink-100">Import transactions</p>
                  <p className="text-xs text-ink-500">CommBank · CIMB · Wise · Nationwide</p>
                </div>
              </div>
              <ChevronRight className="size-5 text-ink-500" />
            </Card>
          </Link>

          <Link to="/categories">
            <Card className="flex items-center justify-between transition-colors hover:bg-ink-900">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300">
                  <Tag className="size-4" />
                </span>
                <div>
                  <p className="font-medium text-ink-100">Categories</p>
                  <p className="text-xs text-ink-500">Organise spending & budgets</p>
                </div>
              </div>
              <ChevronRight className="size-5 text-ink-500" />
            </Card>
          </Link>

          <Link to="/budgets">
            <Card className="flex items-center justify-between transition-colors hover:bg-ink-900">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300">
                  <Target className="size-4" />
                </span>
                <div>
                  <p className="font-medium text-ink-100">Budgets</p>
                  <p className="text-xs text-ink-500">Monthly limits per category</p>
                </div>
              </div>
              <ChevronRight className="size-5 text-ink-500" />
            </Card>
          </Link>

          {profile?.is_admin && (
            <Link to="/admin">
              <Card className="flex items-center justify-between transition-colors hover:bg-ink-900">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-teal-500/12 text-teal-300">
                    <ShieldCheck className="size-4" />
                  </span>
                  <div>
                    <p className="font-medium text-ink-100">Approvals</p>
                    <p className="text-xs text-ink-500">Review beta sign-ups</p>
                  </div>
                </div>
                <ChevronRight className="size-5 text-ink-500" />
              </Card>
            </Link>
          )}

          <ExchangeRates baseCurrency={settings.base_currency} />

          <ZenithSync baseCurrency={settings.base_currency} />

          <Card className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-200">Signed in as</p>
              <p className="truncate text-sm text-ink-500">{user?.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </Card>

          <p className="px-1 text-center text-xs text-ink-600">
            Estuary · dual-currency cash-flow tracker
          </p>
        </div>
      )}
    </div>
  );
}

/** Investments bridge — reads Zenith's live snapshot, with a manual-paste fallback. */
function ZenithSync({ baseCurrency }: { baseCurrency: string }) {
  const { data: snapshot } = useInvestmentSnapshot();
  const upsert = useUpsertInvestmentSnapshot();
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
          setRaw("");
          setOpen(false);
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/12 text-violet-300">
            <TrendingUp className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-200">Investments · Zenith</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              {snapshot
                ? `${formatMoney(totalBase, baseCurrency)} · ${n} account${n === 1 ? "" : "s"}${
                    snapshot.as_of
                      ? ` · ${new Date(snapshot.as_of).toLocaleDateString()}`
                      : ""
                  }`
                : "Not connected — Zenith syncs your portfolio total here."}
            </p>
          </div>
        </div>
        {snapshot && (
          <button
            onClick={() => clear.mutate("zenith")}
            className="shrink-0 text-xs text-ink-500 transition-colors hover:text-rose-400"
          >
            Disconnect
          </button>
        )}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
      >
        {open ? "Hide manual import" : "Import from a Zenith export…"}
      </button>

      {open && (
        <div className="space-y-2">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={
              '{ "base_currency": "AUD", "total": 42150,\n  "accounts": [ { "name": "IBKR", "currency": "USD", "value": 21000 } ] }'
            }
            className="w-full rounded-xl border border-ink-700 bg-ink-950/60 p-3 font-mono text-xs text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none"
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-600">
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
    </Card>
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
    <Card className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-200">Exchange rates</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {isFetching
              ? "Fetching live rates…"
              : isError
              ? "Live rates unavailable — enter manually."
              : live
              ? `Rates updated · ${live.date}`
              : "Fetching live rates…"}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh rates"
          className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200 disabled:opacity-40"
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
        </button>
      </div>
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
    </Card>
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
        <span className="w-24 text-sm text-ink-300">1 {from} =</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder={liveStr ?? "0.0000"}
          className="tnum h-10 flex-1 rounded-xl border border-ink-700 bg-ink-950/60 px-3 text-ink-50 focus:border-teal-500 focus:outline-none"
        />
        <span className="w-10 text-sm text-ink-400">{to}</span>
        {!hasOverride && live != null && (
          <span className="shrink-0 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-400">
            Live
          </span>
        )}
      </div>
      {showLiveHint && (
        <div className="flex items-center gap-1.5 pl-[6.5rem]">
          <span className="text-xs text-ink-600">live: {liveStr}</span>
          <button
            onClick={resetToLive}
            className="text-xs text-teal-500 transition-colors hover:text-teal-300"
          >
            reset
          </button>
        </div>
      )}
    </div>
  );
}
