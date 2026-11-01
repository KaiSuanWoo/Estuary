# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Estuary is a **dual-currency personal cash-flow tracker** — a mobile-first, installable PWA backed by Supabase. It is in an early scaffold stage: tooling, styling, and the Supabase client are wired up, but the application itself has not been built yet (see "Current state" below).

## Commands

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b (typecheck + emit project refs) then vite build → dist/
npm run lint     # tsc -b --noEmit — this is the ONLY check; there is no ESLint/Prettier
npm run preview  # serve the production build locally
```

There is **no test runner configured**. `npm run lint` is purely a TypeScript typecheck, so treat a clean `tsc` as the bar for "passing". `strict`, `noUnusedLocals`, and `noUnusedParameters` are all on, so unused imports/vars are hard errors.

## Current state (important)

The app is wired end-to-end, builds clean, and runs against a **live Supabase backend** (project ref in `.env.local`) holding real data. Security/perf advisors are clean (the only remaining lints are benign "unused index" INFOs on freshly-created FK indexes). See `README.md` for the deploy + closed-beta runbook.

- **Schema lives in `supabase/migrations/`** — the source of truth (10 tables, RLS, indexes, views, functions). `0005` adds the `settings.onboarding_completed` gate; `0006` is a performance pass (wraps `auth.uid()` as `(select auth.uid())` in every RLS policy + adds covering FK indexes). `0026`–`0036` move every derived figure into Postgres (see "Derived figures" below). To bring up a fresh backend: create a project, `supabase db push`, then update `.env.local`.
- **First-run onboarding** (`src/routes/Onboarding.tsx`) is gated by `settings.onboarding_completed`; the `RequireSetup` gate in `App.tsx` bounces new users to `/onboarding`. Routes are code-split via `React.lazy`.
- **`src/lib/database.types.ts` is hand-written, and stays that way.** `supabase gen types` widens every CHECK-constrained column to `string`, so the domain unions the app relies on (`TransactionType`, `BudgetPeriod`, `Cadence`, …) do not survive a regeneration. When the schema changes, read the generated output and reconcile by hand rather than overwriting. `src/lib/types.ts` re-exports friendly row aliases (`Account`, `Transaction`, …) — import domain types from there.
- **PWA icons** (`public/icon.svg`, `icon-192.png`, `icon-512.png`) are generated; the PNGs come from `/tmp/genicons.mjs`-style raster generation (no SVG rasterizer is installed locally — only `sips`, which can't read SVG).

### App structure
- **Entry**: `src/main.tsx` → `QueryClientProvider` → `AuthProvider` → `App`. `src/App.tsx` holds the `BrowserRouter`, a `RequireAuth` gate, and the route table.
- **Auth**: email+password and Google OAuth via `src/lib/auth.tsx` (`useAuth()`); the callback route is `/auth/callback` (kept under `/auth` so the SW nav-fallback ignores it). Access is admin-approval-gated: a `profiles` row (`status`, `is_admin`) is auto-created per user; `App.tsx` chains `RequireAuth → RequireApproval → RequireSetup`, and admins approve from `/admin`. RLS uses a `public.is_admin()` SECURITY DEFINER helper.
- **Data layer**: feature hooks in `src/hooks/` wrap Supabase calls in TanStack Query. Query keys are centralised in `src/lib/query.ts` (`qk`). Inserts stamp `user_id` from the session; RLS enforces ownership. Views use `security_invoker = on`, so the base tables' policies scope them per caller. Any unbounded multi-row read must page via `fetchAllPages` in `src/lib/supabase.ts`.
- **Money**: amounts are stored positive; `type` carries the sign. Format via `src/lib/format.ts` (`formatMoney`, `formatSignedMoney`, `signOf`). Use `.tnum` on any money display.

### Derived figures live in Postgres

**Nothing that aggregates the ledger runs in the browser.** This is load-bearing, not a preference: PostgREST silently caps an unbounded `select()` at 1000 rows, so a client-side total quietly drifts once the ledger passes a thousand entries — and the cost of re-deriving everything on each render grew as ledger × history.

The chain is `fx_to_base` → `reimbursement_allocation` → **`transaction_net`** → everything else. `transaction_net` is the keystone: it resolves each expense's net-of-reimbursement value once, which is what lets every other aggregate be scoped to a date range. Without it, a repayment filed in March could cancel a January expense, so no total could be computed from a date window alone.

- **Views**: `account_balances` (per pocket), `transaction_net`, `reimbursement_allocation`, `monthly_cashflow`, `category_spend_by_month`, `ledger_months`, `merchant_groups`, `account_running_balance`.
- **Functions**: `cashflow_by_month`, `category_spend`, `daily_spend`, `budget_spend`, `budget_category_spend`, `budget_cycles`, `goal_funding`, `recurring_expenses`, `normalize_merchant`, `canonical_merchant`, `budget_window`.
- Anything calendar-dependent takes the caller's local date (`p_now`). `current_date` is UTC: on the first of the month in Australia the server is still on the last of the previous one, which would give a budget the wrong window.
- Cashflow and category aggregates return **both modes side by side** (`*_gross` and `*_net`), so the page's toggle costs no round trip.
- Hooks: `useCashflow.ts`, `useBudgetSpend.ts`, `useAccountBalances.ts`, `useMerchantGroups.ts`. Every derived query key is listed in `DERIVED_KEYS` in `src/lib/query.ts` and invalidated after *any* successful mutation — enumerating the writers instead would be two dozen call sites, and the one that got missed would look exactly like the bug this replaced.
- `src/lib/analytics.ts` keeps only statistics over the aggregates (means, standard deviations, a linear extrapolation) and `buildMoneyFlow`, which reshapes a dozen already-aggregated slices. `budget-metrics.ts` keeps the pacing judgement and takes the sums as arguments.
- **`normalize_merchant` is the only copy of the merchant grouping rule.** The TypeScript version was deleted, not deprecated: two copies drifting apart would split every per-merchant figure with no error to show for it.
- **FX**: `sync_fx_rates()` runs daily on `pg_cron` (job `sync-fx-rates`) and stores dated rates, so an entry with no stamped `fx_rate` converts at the rate current *at its own date* rather than today's — a closed month no longer restates itself as the market moves. It never overwrites a `source = 'manual'` rate. It is `SECURITY DEFINER` and `EXECUTE` is revoked from `authenticated`.
- **Rows, when a screen genuinely needs them**, are asked for directly: `useTransactionsByIds`, `useTransferIns`, `useCategoryEntries`, and the paged Activity list. There is deliberately no whole-ledger hook — see the note where `useTransactions` used to be in `src/hooks/useTransactions.ts`.
- **UI**: shared primitives in `src/components/ui.tsx` (`Card`, `Button`, `PageHeader`, `EmptyState`, `Spinner`); mobile frame + bottom tab bar in `src/components/AppShell.tsx`; screens in `src/routes/` (`Dashboard`, `Transactions`, `Accounts`, `Settings`). Add/entry forms are bottom-sheet components.

## TypeScript project layout

Uses the canonical Vite 3-config split: root `tsconfig.json` is a solution file (`files: []` + references) pointing at `tsconfig.app.json` (the `src` app, composite, `noEmit`) and `tsconfig.node.json` (`vite.config.ts`, composite, `@types/node`). Both leaf configs must stay `composite: true` for `tsc -b` to work — don't collapse them back into one config.

## Architecture & conventions

- **Stack**: Vite 6 + React 18 + TypeScript, Tailwind CSS **v4**, Supabase, PWA via `vite-plugin-pwa`.
- **Path alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`). Prefer `@/...` imports over deep relative paths.
- **Supabase**: the single shared client lives in `src/lib/supabase.ts` and is typed with the generated `Database` type. Sessions persist and auto-refresh; `detectSessionInUrl` is on for magic-link / OAuth callbacks. Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `.env.local` (gitignored) and are declared in `src/vite-env.d.ts` — add new `VITE_*` vars to that interface so they're typed.
- **Styling**: Tailwind v4 with the CSS-first config in `src/index.css` — design tokens are defined in an `@theme` block (`--color-ink-*` neutral and `--color-teal-*` brand palettes, `--font-sans` = Inter). Reference them as Tailwind utilities (e.g. `bg-ink-950`, `text-teal-400`). The app is **dark-mode only** (`color-scheme: dark`). Use the `cn()` helper from `src/lib/cn.ts` (clsx + tailwind-merge) to compose conditional/conflicting classes. Use the `.tnum` class for tabular-figure money displays.
- **PWA / mobile**: built to be installed on an iPhone home screen — `index.html` and `index.css` set up safe-area insets, standalone display, and portrait orientation. Supabase API calls use a NetworkFirst service-worker cache (`vite.config.ts`); `/auth` routes are excluded from the navigation fallback, so keep auth callback paths under `/auth`.
