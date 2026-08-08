/**
 * The book's physical settings: which hide it's bound in, and what light it's
 * read under.
 *
 * Both are expressed as attributes on <html> (`data-hide`, `data-lamp`) that
 * the token layer in `index.css` responds to. Neither is stored server-side —
 * they describe this device, not the account, so a phone can sit in night while
 * a desktop stays in day.
 */

export const HIDES = ["oxblood", "navy", "forest", "tan", "black"] as const;
export type Hide = (typeof HIDES)[number];

/** Oxblood needs no attribute — it is what the tokens already declare. */
const DEFAULT_HIDE: Hide = "oxblood";

export const HIDE_LABELS: Record<Hide, string> = {
  oxblood: "Oxblood",
  navy: "Navy",
  forest: "Forest",
  tan: "Tan",
  black: "Black",
};

/**
 * The two leather tones each binding is built from, mirroring the `data-hide`
 * blocks in `index.css`.
 *
 * They are duplicated here because that CSS keys off `:root` — a swatch that
 * wants to show a hide it is *not* currently bound in has to declare the two
 * variables on itself, and only JS can hand them over.
 */
export const HIDE_TONES: Record<Hide, [string, string]> = {
  oxblood: ["#5a1826", "#330d16"],
  navy: ["#243c5c", "#101e31"],
  forest: ["#254032", "#122018"],
  tan: ["#9a6538", "#5e3b1e"],
  black: ["#2a2320", "#100d0b"],
};

export const HIDE_NOTES: Record<Hide, string> = {
  oxblood: "Traditional banking red. Warm, formal, slightly severe.",
  navy: "Iron-gall blue-black. The coolest of the five, sharpest against brass.",
  forest: "Quieter and cooler. Reads as a private diary more than an institution.",
  tan: "Most obviously leather — the grain shows best. Warmest, least formal.",
  black: "Brass does all the talking. The most restrained, and the most modern.",
};

/**
 * "system" defers to the device's appearance setting; the other two pin the
 * light regardless of it.
 */
export const LAMPS = ["system", "day", "night"] as const;
export type Lamp = (typeof LAMPS)[number];

const HIDE_KEY = "estuary.hide";
const LAMP_KEY = "estuary.lamp";
const HOME_BUDGETS_KEY = "estuary.home.budgets";

function isHide(v: unknown): v is Hide {
  return typeof v === "string" && (HIDES as readonly string[]).includes(v);
}
function isLamp(v: unknown): v is Lamp {
  return typeof v === "string" && (LAMPS as readonly string[]).includes(v);
}

/** Stored binding, falling back to oxblood. Safe in private-mode Safari. */
export function readHide(): Hide {
  try {
    const v = localStorage.getItem(HIDE_KEY);
    return isHide(v) ? v : DEFAULT_HIDE;
  } catch {
    return DEFAULT_HIDE;
  }
}

export function readLamp(): Lamp {
  try {
    const v = localStorage.getItem(LAMP_KEY);
    return isLamp(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function applyHide(hide: Hide): void {
  const root = document.documentElement;
  if (hide === DEFAULT_HIDE) root.removeAttribute("data-hide");
  else root.setAttribute("data-hide", hide);
  try {
    localStorage.setItem(HIDE_KEY, hide);
  } catch {
    // Storage unavailable — the choice simply won't survive a reload.
  }
}

export function applyLamp(lamp: Lamp): void {
  const root = document.documentElement;
  if (lamp === "system") root.removeAttribute("data-lamp");
  else root.setAttribute("data-lamp", lamp);
  try {
    localStorage.setItem(LAMP_KEY, lamp);
  } catch {
    // As above.
  }
}

/**
 * Whether Home carries the budget line. Per device on purpose: a phone has a
 * screenful less room than a desktop, so it's reasonable to want budgets on one
 * and not the other. Defaults to shown.
 */
export function readShowHomeBudgets(): boolean {
  try {
    return localStorage.getItem(HOME_BUDGETS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeShowHomeBudgets(show: boolean): void {
  try {
    localStorage.setItem(HOME_BUDGETS_KEY, show ? "1" : "0");
  } catch {
    // Storage unavailable — the choice won't survive a reload.
  }
}

/**
 * Put the book in its stored binding and light. Call once before first paint
 * so the page never flashes the wrong hide.
 */
export function initLedger(): void {
  const hide = readHide();
  const lamp = readLamp();
  if (hide !== DEFAULT_HIDE) document.documentElement.setAttribute("data-hide", hide);
  if (lamp !== "system") document.documentElement.setAttribute("data-lamp", lamp);
}
