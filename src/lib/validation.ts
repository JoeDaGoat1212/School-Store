/**
 * Form rules, written with zod. The server checks every form with these
 * before touching the database, so bad data can't sneak in even if someone
 * edits the page in their browser.
 */

import { z } from "zod";
import { parseDollarsToCents } from "@/lib/format";

/** "1.50" → 150 cents. Rejects anything that isn't a money amount. */
const money = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const cents = parseDollarsToCents(value);
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: "custom", message: `${label} must be an amount like 1.50` });
        return z.NEVER;
      }
      return cents;
    });

const wholeNumber = (label: string, min = 0, max = 100000) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} can't be less than ${min}`)
    .max(max, `${label} is too big`);

/** Checkboxes and switches send "on" when checked and nothing when not. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const PRODUCT_TAGS = ["new", "limited"] as const;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Give the product a name").max(60, "Keep the name under 60 characters"),
  description: z.string().trim().max(140, "Keep the description under 140 characters").optional().default(""),
  category: z.string().trim().min(1, "Choose or type a category").max(30),
  emoji: z.string().trim().max(8, "Use just one emoji").optional().default(""),
  price: money("Price"),
  cost: money("Cost"),
  reorder_point: wholeNumber("Reorder point"),
  lead_days: wholeNumber("Restock lead time", 0, 60),
  // Only used when creating a product (after that, stock changes go through Inventory).
  starting_stock: wholeNumber("Starting stock").optional(),
  supplier_id: z.string().trim().optional().default(""),
  new_supplier: z.string().trim().max(60).optional().default(""),
  is_perishable: checkbox,
  available_online: checkbox,
  tags: z.array(z.enum(PRODUCT_TAGS)).default([]),
  // One InTouchPay name per line (or comma separated).
  aliases: z
    .string()
    .optional()
    .default("")
    .transform((text) => [
      ...new Set(
        text
          .split(/[\n,]/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]),
  photo_path: z.string().trim().optional().default(""),
});

export type ProductInput = z.infer<typeof productSchema>;

export const GRADES = ["9th", "10th", "11th", "12th", "Staff"] as const;

export const orderSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(40, "First name is too long"),
  last_name: z.string().trim().min(1, "Enter your last name").max(40, "Last name is too long"),
  grade: z.enum(GRADES, { message: "Choose your grade" }),
  pickup_date: z.iso.date({ message: "Choose a pickup day" }),
  pickup_window_id: z.coerce.number({ message: "Choose a pickup time" }).int().positive("Choose a pickup time"),
  items: z
    .array(z.object({ product_id: z.uuid(), quantity: z.number().int().min(1).max(50) }))
    .min(1, "Your cart is empty"),
});

export type OrderInput = z.infer<typeof orderSchema>;

/** Turns zod errors into { fieldName: "message" } for showing under each field. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
