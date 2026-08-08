import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Coins,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useUpdateSettings } from "@/hooks/useSettings";
import { useCreateAccount } from "@/hooks/useAccounts";
import { useSeedCategories } from "@/hooks/useCategories";
import {
  ACCOUNT_TYPES,
  CURRENCIES,
  CURRENCY_LABELS,
  SEED_CATEGORIES,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { springSnappy, useReducedMotion } from "@/lib/motion";
import { Button, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";

const inputCls =
  "h-11 w-full rounded-[2px] border border-rule bg-well px-3 text-quill placeholder:text-quill-faint focus:border-accent focus:outline-none";

type StepId = "welcome" | "currency" | "account" | "categories" | "done";
const STEPS: StepId[] = ["welcome", "currency", "account", "categories", "done"];

type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

/**
 * First-run guided setup. Gated by `settings.onboarding_completed` in App.tsx —
 * only ever shown to brand-new users. Choices are collected locally and written
 * in one commit on the final step, so going back and forth never creates
 * duplicate accounts or categories.
 */
export function Onboarding() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const updateSettings = useUpdateSettings();
  const createAccount = useCreateAccount();
  const seedCategories = useSeedCategories();

  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const step = STEPS[stepIdx];

  // Collected setup
  const [currency, setCurrency] = useState("AUD");
  const [acctName, setAcctName] = useState("");
  const [acctType, setAcctType] = useState<AccountType>("checking");
  const [opening, setOpening] = useState("");
  const [seed, setSeed] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const committing =
    updateSettings.isPending ||
    createAccount.isPending ||
    seedCategories.isPending;

  const go = (delta: 1 | -1) => {
    setDir(delta);
    setStepIdx((i) => Math.min(Math.max(i + delta, 0), STEPS.length - 1));
  };

  async function finish() {
    setError(null);
    try {
      if (acctName.trim()) {
        await createAccount.mutateAsync({
          name: acctName.trim(),
          type: acctType,
          currency: currency,
          opening_balance: opening ? Number(opening) : 0,
        });
      }
      if (seed) {
        await seedCategories.mutateAsync(SEED_CATEGORIES);
      }
      // Persist base currency + flip the gate last, so a failure above leaves
      // the user still in onboarding rather than half-set-up.
      await updateSettings.mutateAsync({
        base_currency: currency,
        onboarding_completed: true,
      });
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message ?? "Something went wrong. Please retry.");
    }
  }

  const variants = reduce
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
      }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 40 }),
        center: { opacity: 1, x: 0 },
      };

  return (
    <div className="flex min-h-full flex-col px-5 py-6 sm:items-center sm:p-8">
      {/* Responsive panel: full-bleed column on phones, centered card on desktop.
          my-auto centers it vertically when it fits and lets the page scroll
          when the viewport is short, so the primary button is always reachable. */}
      <div className="flex w-full flex-1 flex-col sm:my-auto sm:max-w-md sm:flex-none sm:min-h-[34rem] sm:rounded-[28px] sm:border sm:border-rule/70 sm:bg-page-edge sm:p-8 sm:shadow-[var(--shadow-sheet)]">
        {/* Brand + progress */}
        <div className="w-full">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-end">
              <Logo className="h-8 w-auto" />
              <span className="-ml-1 font-serif text-2xl font-medium leading-none tracking-tight text-quill">
                stuary
              </span>
            </div>
            {step !== "welcome" && step !== "done" && (
              <button
                onClick={finish}
                className="text-xs font-medium text-quill-faint transition-colors hover:text-quill-soft"
              >
                Skip setup
              </button>
            )}
          </div>
          <Dots count={STEPS.length} active={stepIdx} />
        </div>

        {/* Steps */}
        <div className="flex w-full flex-1 flex-col">
          {/* Enter-only keyed remount: the step keys the div so React swaps it
              immediately — no AnimatePresence exit that could stall to a blank. */}
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            transition={reduce ? { duration: 0.12 } : springSnappy}
            className="flex flex-1 flex-col pt-7 sm:pt-6"
          >
            {step === "welcome" && (
              <StepShell
                icon={<Sparkles className="size-7" />}
                title="Welcome to Estuary"
                blurb="Track every account and currency in one calm place. Let's get you set up — it takes about a minute."
              >
                <Button className="w-full" onClick={() => go(1)}>
                  Get started <ArrowRight className="size-4" />
                </Button>
              </StepShell>
            )}

            {step === "currency" && (
              <StepShell
                icon={<Coins className="size-7" />}
                title="Your base currency"
                blurb="Balances and totals across every account roll up into this one. You can change it later in Settings."
              >
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pb-1 sm:max-h-80 sm:grid-cols-3">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={cn(
                        "flex flex-col items-start rounded-[2px] border px-3 py-2.5 text-left transition-colors",
                        currency === c
                          ? "border-accent bg-accent/10"
                          : "border-rule hover:border-rule-strong",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          currency === c ? "text-accent" : "text-quill",
                        )}
                      >
                        {c}
                      </span>
                      <span className="truncate text-xs text-quill-faint">
                        {CURRENCY_LABELS[c] ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
                <NavRow onBack={() => go(-1)} onNext={() => go(1)} />
              </StepShell>
            )}

            {step === "account" && (
              <StepShell
                icon={<Wallet className="size-7" />}
                title="Add your first account"
                blurb="Where does your money live? Add one to start — you can add more anytime."
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-quill-soft">
                      Account name
                    </span>
                    <input
                      value={acctName}
                      onChange={(e) => setAcctName(e.target.value)}
                      placeholder="e.g. Everyday Checking"
                      className={inputCls}
                      autoFocus
                    />
                  </label>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-quill-soft">
                      Type
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {ACCOUNT_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setAcctType(t.value)}
                          className={cn(
                            "h-9 rounded-[2px] border text-xs font-medium transition-colors",
                            acctType === t.value
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-rule text-quill-soft",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-quill-soft">
                        Currency
                      </span>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className={inputCls}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-quill-soft">
                        Opening balance
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={opening}
                        onChange={(e) => setOpening(e.target.value)}
                        placeholder="0.00"
                        className={cn(inputCls, "tnum")}
                      />
                    </label>
                  </div>
                </div>
                <NavRow
                  onBack={() => go(-1)}
                  onNext={() => go(1)}
                  nextLabel={acctName.trim() ? "Continue" : "Skip for now"}
                />
              </StepShell>
            )}

            {step === "categories" && (
              <StepShell
                icon={<Sparkles className="size-7" />}
                title="Starter categories"
                blurb="We can add a ready-made set covering groceries, transport, travel, family transfers and more. Tidy them up later in Categories."
              >
                <button
                  type="button"
                  onClick={() => setSeed((v) => !v)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[2px] border p-3.5 text-left transition-colors",
                    seed
                      ? "border-accent bg-accent/10"
                      : "border-rule hover:border-rule-strong",
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-quill">
                      Add {SEED_CATEGORIES.length} starter categories
                    </p>
                    <p className="text-xs text-quill-faint">
                      Recommended — a good base to edit
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      seed
                        ? "border-accent bg-accent text-page"
                        : "border-rule",
                    )}
                  >
                    {seed && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
                <NavRow
                  onBack={() => go(-1)}
                  onNext={() => go(1)}
                  nextLabel="Continue"
                />
              </StepShell>
            )}

            {step === "done" && (
              <StepShell
                icon={<Check className="size-7" />}
                title="You're all set"
                blurb={
                  acctName.trim()
                    ? `We'll create ${acctName.trim()}${seed ? " and your starter categories" : ""}, then take you to your dashboard.`
                    : "Jump into your dashboard — add an account whenever you're ready."
                }
              >
                {error && (
                  <p className="mb-3 text-sm text-debit">{error}</p>
                )}
                <Button
                  className="w-full"
                  onClick={finish}
                  disabled={committing}
                >
                  {committing ? (
                    <>
                      <Spinner className="size-4" /> Setting up…
                    </>
                  ) : (
                    <>
                      Enter Estuary <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
                {!committing && (
                  <button
                    onClick={() => go(-1)}
                    className="mt-3 w-full text-center text-xs text-quill-faint transition-colors hover:text-quill-soft"
                  >
                    Back
                  </button>
                )}
              </StepShell>
            )}
          </motion.div>
        </div>

        {/* Signed-in hint */}
        {user?.email && (
          <p className="mt-6 w-full text-center text-xs text-quill-faint">
            Signed in as {user.email}
          </p>
        )}
      </div>
    </div>
  );
}

function StepShell({
  icon,
  title,
  blurb,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-5">
        <div className="mb-4 flex size-14 items-center justify-center rounded-[2px] bg-accent/12 text-accent ring-1 ring-inset ring-accent/20">
          {icon}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-quill">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-quill-soft">{blurb}</p>
      </div>
      <div className="mt-auto space-y-4 pt-4">{children}</div>
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  nextLabel = "Continue",
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" className="flex-1" onClick={onBack}>
        Back
      </Button>
      <Button className="flex-[2]" onClick={onNext}>
        {nextLabel} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === active
              ? "w-6 bg-accent"
              : i < active
                ? "w-1.5 bg-accent/50"
                : "w-1.5 bg-rule",
          )}
        />
      ))}
    </div>
  );
}
