/**
 * BRAND SETTINGS — the one file to edit to make the site look like your school.
 *
 * Colors are hex codes. Pick your school colors here:
 *   primary  → buttons, links, the sidebar highlight
 *   accent   → price stickers and the order ticket (a bright, cheerful color)
 *
 * After changing colors, check that text is still easy to read:
 * primaryText must be readable on primary, accentText on accent.
 * (A free checker: https://webaim.org/resources/contrastchecker/)
 *
 * Logo: put an image in /public (e.g. /public/logo.png) and set `logo` to
 * "/logo.png". Leave it as null to show the store initials instead.
 *
 * Store hours, pickup location and the banner are NOT here — they're edited
 * on the Settings page so staff can change them without touching code.
 */
export const brand = {
  /** Shown in the header, browser tab and emails. */
  name: "School Store",
  /** One short line under the name on the menu. */
  tagline: "Snacks, drinks and supplies — order ahead, pay at pickup.",
  /** Two letters shown when there is no logo. */
  initials: "SS",
  /** Path to a logo in /public, or null. */
  logo: null as string | null,

  /** Order numbers look like SS-0042. Change the prefix here. */
  orderPrefix: "SS",

  colors: {
    primary: "#2445B5", // royal blue
    primaryText: "#FFFFFF",
    accent: "#FFD23F", // highlighter yellow
    accentText: "#1A1A1A",
  },
} as const;

/** Formats an order number the way students see it: 42 → "SS-0042". */
export function formatOrderNumber(n: number) {
  return `${brand.orderPrefix}-${String(n).padStart(4, "0")}`;
}

/** Reads "SS-0042", "ss42", "#42" or "42" and returns 42 (or null). */
export function parseOrderNumber(input: string): number | null {
  const digits = input.trim().replace(new RegExp(`^${brand.orderPrefix}`, "i"), "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
