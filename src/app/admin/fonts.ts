import { Courier_Prime, Plus_Jakarta_Sans } from "next/font/google";

/*
 * The staff pages' type:
 *   Plus Jakarta Sans  headings, numbers and labels: clean and modern
 *   Courier Prime      receipts (order tickets)
 *
 * The CSS variable names (--font-slab, --font-receipt) are kept so older
 * styles keep working. Handwriting (--font-hand) now uses the heading font
 * too; see globals.css → "The back room".
 */
export const slab = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-slab", display: "swap" });
export const receipt = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-receipt", display: "swap" });

export const backroomFonts = `${slab.variable} ${receipt.variable}`;
