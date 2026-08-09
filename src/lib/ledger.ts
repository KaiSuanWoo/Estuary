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

/**
 * How large the hand is, and how heavily it presses.
 *
 * Scale multiplies the root font size, so every rem-based size in the app —
 * type, spacing, the fore-edge tabs, the dock — grows together rather than
 * type alone outgrowing the boxes holding it.
 */
export const TEXT_SCALES = [0.9, 1, 1.1, 1.25, 1.4] as const;
export const TEXT_SCALE_LABELS = ["Small", "Normal", "Large", "Larger", "Largest"];

const HIDE_KEY = "estuary.hide";
const LAMP_KEY = "estuary.lamp";
const SCALE_KEY = "estuary.text.scale";
const BOLD_KEY = "estuary.text.bold";

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

/** Stored text scale, falling back to normal. */
export function readTextScale(): number {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    return (TEXT_SCALES as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function readBoldText(): boolean {
  try {
    return localStorage.getItem(BOLD_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Scale is applied to the root font size rather than to a set of type classes,
 * so everything measured in rem grows with it — the fore-edge tabs and the dock
 * included. Anything left in px would otherwise stay put and start clipping the
 * larger type.
 */
export function applyTextScale(scale: number): void {
  document.documentElement.style.fontSize =
    scale === 1 ? "" : `${(scale * 100).toFixed(2)}%`;
  try {
    localStorage.setItem(SCALE_KEY, String(scale));
  } catch {
    // Storage unavailable — the choice simply won't survive a reload.
  }
}

export function applyBoldText(bold: boolean): void {
  const root = document.documentElement;
  if (bold) root.setAttribute("data-bold", "on");
  else root.removeAttribute("data-bold");
  try {
    localStorage.setItem(BOLD_KEY, bold ? "1" : "0");
  } catch {
    // As above.
  }
}

/**
 * Put the book in its stored binding, light and hand. Call once before first
 * paint so the page never flashes the wrong one.
 */
export function initLedger(): void {
  const hide = readHide();
  const lamp = readLamp();
  if (hide !== DEFAULT_HIDE) document.documentElement.setAttribute("data-hide", hide);
  if (lamp !== "system") document.documentElement.setAttribute("data-lamp", lamp);
  applyTextScale(readTextScale());
  applyBoldText(readBoldText());
}
