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

- **Schema lives in `supabase/migrations/`** — the source of truth (10 tables, RLS, indexes). `0005` adds the `settings.onboarding_completed` gate; `0006` is a performance pass (wraps `auth.uid()` as `(select auth.uid())` in every RLS policy + adds covering FK indexes). To bring up a fresh backend: create a project, `supabase db push`, then update `.env.local`.
- **First-run onboarding** (`src/routes/Onboarding.tsx`) is gated by `settings.onboarding_completed`; the `RequireSetup` gate in `App.tsx` bounces new users to `/onboarding`. Routes are code-split via `React.lazy`.
- **`src/lib/database.types.ts` is hand-written to match that migration.** After a real project exists, regenerate it instead of editing by hand: `supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts` (or the Supabase MCP `generate_typescript_types` tool). `src/lib/types.ts` re-exports friendly row aliases (`Account`, `Transaction`, …) — import domain types from there.
- **PWA icons** (`public/icon.svg`, `icon-192.png`, `icon-512.png`) are generated; the PNGs come from `/tmp/genicons.mjs`-style raster generation (no SVG rasterizer is installed locally — only `sips`, which can't read SVG).

### App structure
- **Entry**: `src/main.tsx` → `QueryClientProvider` → `AuthProvider` → `App`. `src/App.tsx` holds the `BrowserRouter`, a `RequireAuth` gate, and the route table.
- **Auth**: email+password and Google OAuth via `src/lib/auth.tsx` (`useAuth()`); the callback route is `/auth/callback` (kept under `/auth` so the SW nav-fallback ignores it). Access is admin-approval-gated: a `profiles` row (`status`, `is_admin`) is auto-created per user; `App.tsx` chains `RequireAuth → RequireApproval → RequireSetup`, and admins approve from `/admin`. RLS uses a `public.is_admin()` SECURITY DEFINER helper.
- **Data layer**: feature hooks in `src/hooks/` (`useAccounts`, `useTransactions`, `useCategories`, `useSettings`) wrap Supabase calls in TanStack Query. Query keys are centralised in `src/lib/query.ts` (`qk`). Inserts stamp `user_id` from the session; RLS enforces ownership.
- **Money**: amounts are stored positive; `type` carries the sign. Format via `src/lib/format.ts` (`formatMoney`, `formatSignedMoney`, `signOf`). Balances are derived client-side in `src/lib/balances.ts` (opening balance ± transactions, per currency — no server-side rollup). Use `.tnum` on any money display.
- **UI**: shared primitives in `src/components/ui.tsx` (`Card`, `Button`, `PageHeader`, `EmptyState`, `Spinner`); mobile frame + bottom tab bar in `src/components/AppShell.tsx`; screens in `src/routes/` (`Dashboard`, `Transactions`, `Accounts`, `Settings`). Add/entry forms are bottom-sheet components.

## TypeScript project layout

Uses the canonical Vite 3-config split: root `tsconfig.json` is a solution file (`files: []` + references) pointing at `tsconfig.app.json` (the `src` app, composite, `noEmit`) and `tsconfig.node.json` (`vite.config.ts`, composite, `@types/node`). Both leaf configs must stay `composite: true` for `tsc -b` to work — don't collapse them back into one config.

## Architecture & conventions

- **Stack**: Vite 6 + React 18 + TypeScript, Tailwind CSS **v4**, Supabase, PWA via `vite-plugin-pwa`.
- **Path alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`). Prefer `@/...` imports over deep relative paths.
- **Supabase**: the single shared client lives in `src/lib/supabase.ts` and is typed with the generated `Database` type. Sessions persist and auto-refresh; `detectSessionInUrl` is on for magic-link / OAuth callbacks. Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `.env.local` (gitignored) and are declared in `src/vite-env.d.ts` — add new `VITE_*` vars to that interface so they're typed.
- **Styling**: Tailwind v4 with the CSS-first config in `src/index.css` — design tokens are defined in an `@theme` block (`--color-ink-*` neutral and `--color-teal-*` brand palettes, `--font-sans` = Inter). Reference them as Tailwind utilities (e.g. `bg-ink-950`, `text-teal-400`). The app is **dark-mode only** (`color-scheme: dark`). Use the `cn()` helper from `src/lib/cn.ts` (clsx + tailwind-merge) to compose conditional/conflicting classes. Use the `.tnum` class for tabular-figure money displays.
- **PWA / mobile**: built to be installed on an iPhone home screen — `index.html` and `index.css` set up safe-area insets, standalone display, and portrait orientation. Supabase API calls use a NetworkFirst service-worker cache (`vite.config.ts`); `/auth` routes are excluded from the navigation fallback, so keep auth callback paths under `/auth`.
