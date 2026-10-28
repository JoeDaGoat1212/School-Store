import { Caveat, Courier_Prime, Zilla_Slab } from "next/font/google";

/*
 * The staff pages' "back room" type:
 *   Zilla Slab    headings, like an old grocery-store flyer
 *   Courier Prime receipts (order tickets, the register tape)
 *   Caveat        handwritten notes on charts
 */
export const slab = Zilla_Slab({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-slab", display: "swap" });
export const receipt = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-receipt", display: "swap" });
export const hand = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-hand", display: "swap" });

export const backroomFonts = `${slab.variable} ${receipt.variable} ${hand.variable}`;
