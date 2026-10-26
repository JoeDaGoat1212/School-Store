"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseOrderNumber } from "@/config/brand";
import { ipHashSalt } from "@/lib/env";
import { saveOrder } from "@/lib/my-orders";
import { createClient, createSecretClient } from "@/lib/supabase/server";
import { fieldErrors, orderSchema } from "@/lib/validation";

export type CheckoutState = {
  errors?: Record<string, string>;
  /** A message for the whole form (e.g. "Hot Cheetos just sold out."). */
  message?: string;
  /** Machine-readable reason from the database, e.g. "SOLD_OUT". */
  code?: string;
};

/**
 * Turns the device's IP address into a scrambled code. We can tell when the
 * same device places lots of orders (prank protection) without ever storing
 * the real address.
 */
async function deviceHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ipHashSalt()}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Places an order. Called by the checkout form.
 * The database function place_order does the real checks (stock, cutoff,
 * limits); this just checks the form and passes it along.
 */
export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { message: "Your cart couldn't be read. Please refresh the page." };
  }

  const parsed = orderSchema.safeParse({ ...Object.fromEntries(formData), items });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { errors, message: errors.items ?? "Please fix the highlighted fields." };
  }
  const o = parsed.data;

  // The secret client is needed because students aren't allowed to call
  // place_order directly — only this server code can.
  const supabase = createSecretClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_first_name: o.first_name,
    p_last_name: o.last_name,
    p_grade: o.grade,
    p_pickup_window_id: o.pickup_window_id,
    p_pickup_date: o.pickup_date,
    p_items: o.items,
    p_ip_hash: await deviceHash(),
  });

  if (error) {
    // Our database errors put a friendly sentence in `hint`.
    return {
      code: error.message,
      message: error.hint || "Something went wrong placing your order. Please try again.",
    };
  }

  const orderNumber = (data as { order_number: number }).order_number;
  await saveOrder(orderNumber, o.last_name);
  redirect(`/order/${orderNumber}?new=1`);
}

export type LookupState = { message?: string; number?: string; last?: string };

/** "Find my order": checks the number + last name, then shows the order. */
export async function findOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const rawNumber = String(formData.get("number") ?? "");
  const last = String(formData.get("last_name") ?? "").trim();
  const number = parseOrderNumber(rawNumber);

  if (!number || !last) {
    return { message: "Enter your order number and last name.", number: rawNumber, last };
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("lookup_order", { p_order_number: number, p_last_name: last });

  if (!data) {
    return {
      message: "We couldn't find an order with that number and last name. Check both and try again.",
      number: rawNumber,
      last,
    };
  }

  await saveOrder(number, last);
  redirect(`/order/${number}`);
}
