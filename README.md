# Estuary

A dual-currency personal cash-flow tracker — a mobile-first, installable PWA
backed by Supabase. Track every account and currency in one place, with
reimbursements, CSV import, auto-categorisation, and a dashboard that rolls
everything up into one base currency.

> Engineering notes for working in this repo live in [CLAUDE.md](./CLAUDE.md).

## Stack

Vite 6 · React 18 · TypeScript (strict) · Tailwind v4 · Supabase · TanStack
Query · `vite-plugin-pwa`.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev                  # Vite dev server
```

| Command           | What it does                                              |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Dev server with HMR                                      |
| `npm run build`   | `tsc -b` typecheck + emit, then `vite build` → `dist/`   |
| `npm run lint`    | `tsc -b --noEmit` — the only check; treat clean as green |
| `npm run preview` | Serve the production build locally                       |

There is no test runner; a clean `tsc` is the bar for "passing". `strict`,
`noUnusedLocals`, and `noUnusedParameters` are on, so unused imports/vars are
hard errors.

## Environment

Two public client vars, declared in `src/vite-env.d.ts` and read in
`src/lib/supabase.ts` (the app throws on boot if either is missing):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key — safe in the browser; RLS
  scopes every row to the signed-in user)

## Database

The schema lives in `supabase/migrations/` and is the source of truth (RLS on
every table, indexes, the onboarding gate, and the FK/RLS performance pass).

```bash
supabase link --project-ref <ref>
supabase db push            # apply any pending migrations
# after schema changes, regenerate types:
supabase gen types typescript --project-id <ref> --schema public \
  > src/lib/database.types.ts
```

> Note: `database.types.ts` keeps a few hand-written enum aliases
> (`AccountType`, `TransactionType`, …) that the generated output drops. If you
> regenerate wholesale, re-add those (or merge), since `src/lib/types.ts`
> re-exports them.

## Deploying (Vercel / Netlify)

1. Connect the repo. Build command `npm run build`, output dir `dist/`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's env vars.
3. **SPA rewrite is required** so deep links and `/auth/callback` (the OAuth /
   email-confirmation landing) don't 404 on refresh. Already configured:
   - Vercel → `vercel.json`
   - Netlify → `public/_redirects`
4. In **Supabase → Authentication → URL Configuration**, set the **Site URL**
   to your deployed origin and add `https://<your-domain>/auth/callback` to
   **Redirect URLs**. Without this, email-confirmation and Google links bounce
   back to localhost.

## Authentication & beta access control

Sign-in is **email + password** and **Google OAuth** (`src/lib/auth.tsx`,
`src/routes/Login.tsx`). Access to the beta is gated by an admin-approval flow
rather than locking sign-ups:

- Anyone can sign up, but every new user lands in a `profiles` row with
  `status = 'pending'` (created by a DB trigger). The `RequireApproval` gate in
  `src/App.tsx` shows them a holding screen until approved — see
  `src/routes/PendingApproval.tsx`.
- **You approve from inside the app.** Admins get an **Approvals** link in
  Settings → `/admin` (`src/routes/Admin.tsx`), listing pending users with
  Approve / Reject. RLS (`is_admin()`) independently enforces that only admins
  can change status.
- The first admin is set by the `0007` migration (the owner's email). To make
  someone else an admin, flip `is_admin` on their `profiles` row.

Required Supabase dashboard settings:

1. **Authentication → Providers → Email:** keep **"Allow new users to sign up"
   ON** (the approval gate is what controls access now), and keep **"Confirm
   email" ON** so the verification email is sent.
2. **Authentication → Providers → Google:** enable it and paste a Google Cloud
   OAuth **client ID + secret** (create them at console.cloud.google.com →
   Credentials → OAuth client → Web). Add Supabase's callback
   (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised
   redirect URI in Google. Until this is done, the "Continue with Google"
   button will error.
3. **Authentication → Policies:** consider enabling **leaked-password
   protection** (HaveIBeenPwned) now that passwords are in use.

## First-run onboarding

New users are routed through a guided setup (welcome → base currency → first
account → starter categories), gated by `settings.onboarding_completed`.
Existing users were backfilled to `true` and skip it. See `src/routes/Onboarding.tsx`
and the `RequireSetup` gate in `src/App.tsx`.
