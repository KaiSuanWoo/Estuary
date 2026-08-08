import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Coins,
  Download,
  LayoutDashboard,
  Repeat,
  ShieldCheck,
  Share,
  Plus,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/motion";
import { isStandalone } from "@/lib/pwa";
import { Button } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** The browser's install prompt event (not in the standard DOM lib types). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS reports as Mac; disambiguate via touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export function Landing() {
  const { session } = useAuth();
  const reduce = useReducedMotion();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const platform = detectPlatform();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  const fadeUp = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  // The installed app should never show the marketing landing — straight to app.
  if (isStandalone()) return <Navigate to="/login" replace />;

  return (
    <div
      className="min-h-full"
      style={{
        background:
          "linear-gradient(170deg, var(--color-desk-a), var(--color-desk-b))",
      }}
    >
    <div className="surface-leaf mx-auto min-h-full max-w-5xl">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-end">
          <Logo className="h-8 w-auto" />
          <span className="-ml-1 font-serif text-2xl font-medium leading-none tracking-tight text-quill">
            stuary
          </span>
        </div>
        <Link to={session ? "/" : "/login"}>
          <Button variant="ghost" size="sm">
            {session ? "Open app" : "Sign in"}
          </Button>
        </Link>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-8 pt-8 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:pt-16">
        <motion.div {...fadeUp(0)}>
          <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-rule/70 bg-page-edge px-3 py-1 text-xs font-medium text-quill-soft">
            <span className="size-1.5 rounded-full bg-accent" />
            Installable web app · no app store
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-quill sm:text-5xl">
            From many streams,
            <br />
            <span className="font-serif font-medium text-accent">one flow.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-quill-soft sm:text-lg">
            Estuary is a calm, dual-currency tracker for every account you own —
            balances, reimbursements, and cashflow in one private place. Install
            it on your phone and desktop in seconds.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to={session ? "/" : "/login"}>
              <Button className="px-5">
                {session ? "Open Estuary" : "Get started"}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <a href="#install">
              <Button variant="outline" className="px-5">
                <Download className="size-4" /> Install the app
              </Button>
            </a>
          </div>
          <p className="mt-3 text-xs text-quill-faint">
            Free during beta · new accounts are reviewed before access.
          </p>
        </motion.div>

        {/* Device mockup */}
        <motion.div
          className="flex justify-center lg:justify-end"
          {...fadeUp(0.1)}
        >
          <PhoneMockup />
        </motion.div>
      </section>

      {/* ── Install ─────────────────────────────────────────────────────── */}
      <section id="install" className="mx-auto max-w-5xl scroll-mt-6 px-5 py-12 sm:px-8">
        <motion.div {...fadeUp(0)}>
          <h2 className="text-2xl font-semibold tracking-tight text-quill">
            Get the app
          </h2>
          <p className="mt-1 text-sm text-quill-soft">
            Add Estuary to your home screen or dock — it runs fullscreen, just
            like a native app.
          </p>
        </motion.div>

        {installed ? (
          <div className="mt-6 flex items-center gap-3 rounded-[2px] border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
            <Check className="size-5 shrink-0" />
            Estuary is installed on this device — you're all set.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InstallCard
              active={platform === "desktop"}
              icon={<LayoutDashboard className="size-5" />}
              title="Desktop"
              steps={
                <>
                  Open in Chrome or Edge, then click the{" "}
                  <strong className="text-quill">install icon</strong> in the
                  address bar — or use the button below.
                </>
              }
            >
              {installEvent && (
                <Button size="sm" className="mt-3 w-full" onClick={install}>
                  <Download className="size-4" /> Install now
                </Button>
              )}
            </InstallCard>

            <InstallCard
              active={platform === "android"}
              icon={<Plus className="size-5" />}
              title="Android"
              steps={
                <>
                  In Chrome, tap{" "}
                  <strong className="text-quill">⋮ → Install app</strong>, or
                  use the button below.
                </>
              }
            >
              {installEvent && (
                <Button size="sm" className="mt-3 w-full" onClick={install}>
                  <Download className="size-4" /> Install now
                </Button>
              )}
            </InstallCard>

            <InstallCard
              active={platform === "ios"}
              icon={<Share className="size-5" />}
              title="iPhone & iPad"
              steps={
                <>
                  In Safari, tap the{" "}
                  <strong className="text-quill">Share</strong> button, then{" "}
                  <strong className="text-quill">Add to Home Screen</strong>.
                </>
              }
            />
          </div>
        )}
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<Coins className="size-5" />}
            title="Dual-currency"
            body="Hold balances in any currency; everything rolls up into your base currency with live rates."
          />
          <Feature
            icon={<Repeat className="size-5" />}
            title="Reimbursements"
            body="Flag what you're owed and link repayments — even across currencies — so your cashflow stays honest."
          />
          <Feature
            icon={<LayoutDashboard className="size-5" />}
            title="Clear dashboard"
            body="Net worth, monthly cashflow, and spending by category at a glance."
          />
          <Feature
            icon={<ShieldCheck className="size-5" />}
            title="Private by design"
            body="Your data is yours alone, isolated per account and never shared."
          />
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-5 py-10 text-center sm:px-8">
        <div className="flex items-end opacity-80">
          <Logo className="h-6 w-auto" />
          <span className="-ml-0.5 font-serif text-lg font-medium leading-none tracking-tight text-quill">
            stuary
          </span>
        </div>
        <p className="text-xs text-quill-faint">
          Estuary · dual-currency cash-flow tracker
        </p>
      </footer>
    </div>
    </div>
  );
}

function InstallCard({
  active,
  icon,
  title,
  steps,
  children,
}: {
  active?: boolean;
  icon: ReactNode;
  title: string;
  steps: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[2px] border p-4 transition-colors",
        active
          ? "border-accent/40 bg-accent/[0.06]"
          : "border-rule/80 bg-page-edge",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-[2px]",
            active ? "bg-accent/15 text-accent" : "bg-page-edge text-quill-soft",
          )}
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-quill">{title}</h3>
        {active && (
          <span className="ml-auto rounded-[2px] bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            You
          </span>
        )}
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-quill-soft">{steps}</p>
      {children}
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[2px] border border-rule/80 bg-page-edge p-4">
      <span className="flex size-9 items-center justify-center rounded-[2px] bg-page-edge text-accent">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-quill">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-quill-faint">{body}</p>
    </div>
  );
}

/** A lightweight, on-brand phone mock showing a stylised dashboard. */
function PhoneMockup() {
  return (
    <div className="relative w-[230px] shrink-0 rounded-[2.2rem] border border-rule/70 bg-well p-2.5 shadow-[var(--shadow-float)] sm:w-[260px]">
      <div className="overflow-hidden rounded-[1.7rem] border border-rule/80 bg-page-edge">
        {/* status strip */}
        <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-quill-faint">
          <span>9:41</span>
          <span className="flex gap-1">
            <span className="size-1 rounded-full bg-rule" />
            <span className="size-1 rounded-full bg-rule" />
            <span className="size-1 rounded-full bg-rule" />
          </span>
        </div>
        <div className="px-4 pb-5 pt-2">
          <p className="text-[11px] text-quill-faint">Net worth</p>
          <p className="tnum text-2xl font-semibold tracking-tight text-quill">
            $48,920
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="Income" value="$6,240" tone="up" />
            <MiniStat label="Expenses" value="$3,180" tone="down" />
          </div>
          {/* mini bar chart */}
          <div className="mt-4 flex h-20 items-end gap-1.5">
            {[40, 62, 35, 78, 52, 68].map((h, i) => (
              <div key={i} className="flex flex-1 flex-col justify-end gap-0.5">
                <div
                  className="rounded-sm bg-accent/80"
                  style={{ height: `${h}%` }}
                />
                <div
                  className="rounded-sm bg-debit/70"
                  style={{ height: `${h * 0.5}%` }}
                />
              </div>
            ))}
          </div>
          {/* account rows */}
          <div className="mt-4 space-y-2">
            {[
              ["Everyday", "$2,410"],
              ["Wise · multi", "MYR 5,300"],
            ].map(([name, amt]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-[2px] bg-page-edge px-3 py-2"
              >
                <span className="text-[11px] text-quill-soft">{name}</span>
                <span className="tnum text-[11px] font-medium text-quill">
                  {amt}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "up" | "down";
}) {
  return (
    <div className="rounded-[2px] bg-page-edge px-2.5 py-2">
      <p className="text-[10px] text-quill-faint">{label}</p>
      <p
        className={cn(
          "tnum text-sm font-semibold",
          tone === "up" ? "text-accent" : "text-debit",
        )}
      >
        {value}
      </p>
    </div>
  );
}
