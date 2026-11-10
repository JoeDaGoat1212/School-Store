import { Platform, useColorScheme } from "react-native";

/*
 * The same look as the website's staff pages: a gray-green board, white sheets
 * with ruled lines, ink buttons, Firebirds orange for "you are here" and the
 * discount, green for money and being on the clock. Big numbers use the
 * phone's own condensed face, like a scoreboard.
 */

const light = {
  board: "#f1f2ee",
  paper: "#ffffff",
  ink: "#17191c",
  muted: "#60666f",
  rule: "#e1e3de",
  input: "#cfd2cb",
  track: "#ebece8",
  orange: "#ff5a1f",
  onOrange: "#000000",
  green: "#18794e",
  red: "#c4321c",
  dark: "#17191c",
};

const dark: typeof light = {
  board: "#111213",
  paper: "#191b1d",
  ink: "#ecedea",
  muted: "#9a9fa7",
  rule: "#2a2d30",
  input: "#3a3e43",
  track: "#232528",
  orange: "#ff5a1f",
  onOrange: "#000000",
  green: "#3dd68c",
  red: "#ff6b57",
  dark: "#000000",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** Scoreboard numbers: Roboto Condensed on Android, Avenir Next Condensed on iPhone. */
export const score = Platform.select({
  android: { fontFamily: "sans-serif-condensed", fontWeight: "700" as const },
  default: { fontFamily: "AvenirNextCondensed-Bold", fontWeight: "700" as const },
});

export const radius = { sheet: 12, control: 8 };
