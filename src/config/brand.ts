/**
 * BRAND SETTINGS — the one file to edit to make the site look like your school.
 *
 * Colors are hex codes:
 *   primary  → buttons, the flame in the logo, prices (Firebirds orange)
 *   accent   → the status strip, cart count, banner (Firebirds teal)
 *   accentDeep → teal used for text and links on white (darker, so it's readable)
 *
 * After changing colors, check that text is still easy to read:
 * primaryText must be readable on primary, accentText on accent.
 * (A free checker: https://webaim.org/resources/contrastchecker/)
 *
 * Logo: put an image in /public (e.g. /public/logo.png) and set `logo` to
 * "/logo.png". Leave it as null to show the built-in flame mark instead.
 *
 * Store hours, pickup location and the banner are NOT here — they're edited
 * on the Settings page so staff can change them without touching code.
 */
export const brand = {
  /** Shown in the header, browser tab and emails. */
  name: "Firebirds Nest",
  /** One short line under the name on the menu. */
  tagline: "Order between classes. Pay when you pick up.",
  /** Two letters used where a logo won't fit. */
  initials: "FN",
  /** Path to a logo in /public, or null. */
  logo: null as string | null,

  /** Order numbers look like FN-0042. Change the prefix here. */
  orderPrefix: "FN",

  colors: {
    primary: "#FF5A1F", // Firebirds orange
    primaryText: "#000000", // black on orange is easier to read than white
    accent: "#13A8A0", // Firebirds teal
    accentText: "#000000",
    accentDeep: "#0A6E6E", // teal for text on white
    ink: "#000000",
  },
} as const;

/** Formats an order number the way students see it: 42 → "FN-0042". */
export function formatOrderNumber(n: number) {
  return `${brand.orderPrefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Reads "FN-0042", "fn42", "#42" or "42" and returns 42 (or null).
 * Any letters in front are ignored, so older tickets (like "SS-0042") still work.
 */
export function parseOrderNumber(input: string): number | null {
  const digits = input.trim().replace(/^[a-z]+/i, "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
