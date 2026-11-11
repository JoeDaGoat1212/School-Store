import { Platform } from "react-native";

/*
 * Night: the app is always dark, like a stadium at a night game. Firebirds
 * orange = do something; nest teal = you're on the clock, done, money.
 */
const night = {
  board: "#101215",
  paper: "#191c21",
  raised: "#23272e",
  ink: "#f3f2ee",
  muted: "#9aa1ab",
  rule: "#2a2f37",
  input: "#383e48",
  track: "#23272e",
  orange: "#ff5a1f",
  orangeSoft: "#ff9a6e",
  onOrange: "#0b0b0b",
  green: "#2fd0c2",
  teal: "#2fd0c2",
  tealDeep: "#0f2a28",
  red: "#ff6b57",
  dark: "#191c21",
};

export type Colors = typeof night;

export function useColors(): Colors {
  return night;
}

/** A steady color per person, from their name (same idea as the website's avatars). */
export function personColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 38%, 40%)`;
}

/** Scoreboard numbers: Roboto Condensed on Android, Avenir Next Condensed on iPhone. */
export const score = Platform.select({
  android: { fontFamily: "sans-serif-condensed", fontWeight: "700" as const },
  default: { fontFamily: "AvenirNextCondensed-Bold", fontWeight: "700" as const },
});

export const radius = { sheet: 24, card: 18, control: 14 };
