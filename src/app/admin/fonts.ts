import { Big_Shoulders, Courier_Prime } from "next/font/google";

/*
 * The staff pages' type (globals.css → "The back room"):
 *   Archivo        everything you read (loaded once in app/layout.tsx)
 *   Big Shoulders  the scoreboard numbers: sales, spending, counts (.score)
 *   Courier Prime  receipts (order tickets)
 */
export const score = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-score",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "sans-serif"],
});
export const receipt = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-receipt", display: "swap" });

export const backroomFonts = `${score.variable} ${receipt.variable}`;
