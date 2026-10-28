"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseOrderNumber } from "@/config/brand";
import { ipHashSalt } from "@/lib/env";
import { getAccount, isTeacher } from "@/lib/member";
import { saveOrder } from "@/lib/my-orders";
import { createClient, createSecretClient } from "@/lib/supabase/server";
import { fieldErrors, orderSchema, teacherOrderSchema } from "@/lib/validation";

export type CheckoutState = {
  errors?: Record<string, string>;
  /** A message for the whole form (e.g. "Hot Cheetos just sold out."). */
  message?: string;
  /** Machine-readable reason from the database, e.g. "SOLD_OUT". */
  code?: string;
  /** Set when the order went through (checkout inside the 3D store). */
  placed?: { orderNumber: number };
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
 * Places an order. Called by the checkout form on the cart page; when it works,
 * it goes to the order's page.
 */
export async function placeOrder(prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const result = await submitOrder(formData);
  if (!result.placed) return result;
  redirect(`/order/${result.placed.orderNumber}?new=1`);
}

/**
 * The same, for the checkout counter in the 3D store: stays on the page and
 * hands back the order number, so the sidebar can show it.
 */
export async function placeOrderHere(prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  return submitOrder(formData);
}

/**
 * Checks the form and places the order. The database function place_order
 * does the real checks (stock, cutoff, limits); this just checks the form and
 * passes it along.
 */
async function submitOrder(formData: FormData): Promise<CheckoutState> {
  let items: unknown = [];
  let bundles: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
    bundles = JSON.parse(String(formData.get("bundles") ?? "[]"));
  } catch {
    return { message: "Your cart couldn't be read. Please refresh the page." };
  }

  // An approved teacher? (Checked here from the login cookie, never from the form.)
  const { data: login } = await (await createClient()).auth.getClaims();
  const userId = (login?.claims?.sub as string | undefined) ?? undefined;
  const account = userId ? await getAccount() : null;
  if (userId && isTeacher(account)) return submitTeacherOrder(formData, userId, items, bundles);

  const parsed = orderSchema.safeParse({ ...Object.fromEntries(formData), items, bundles });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { errors, message: errors.items ?? "Please fix the highlighted fields." };
  }
  const o = parsed.data;

  // Signed in to rewards? The login cookie is checked here on the server, so
  // nobody can claim to be someone else's account.
  const memberId = account?.profile && !account.staff ? userId : undefined;

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
    p_bundles: o.bundles,
    p_ip_hash: await deviceHash(),
    p_customer_id: memberId,
    p_reward_id: memberId && o.reward_id ? o.reward_id : undefined,
  });

  if (error) {
    // Our database errors put a friendly sentence in `hint`.
    return {
      code: error.message,
      message: error.hint || "Something went wrong placing your order. Please try again.",
    };
  }

  const orderNumber = (data as { order_number: number }).order_number;
  // Remembered on this device, so the order page opens without asking for the last name.
  await saveOrder(orderNumber, o.last_name);
  return { placed: { orderNumber } };
}

/**
 * A teacher's order: teacher prices, and room service (brought to their room
 * during a class hour) or pickup. The database checks the teacher is approved.
 */
async function submitTeacherOrder(formData: FormData, teacherId: string, items: unknown, bundles: unknown): Promise<CheckoutState> {
  const parsed = teacherOrderSchema.safeParse({ ...Object.fromEntries(formData), items, bundles });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { errors, message: errors.items ?? "Please fix the highlighted fields." };
  }
  const o = parsed.data;

  const { data, error } = await createSecretClient().rpc("place_order", {
    p_first_name: o.first_name,
    p_last_name: o.last_name,
    p_grade: "Teacher",
    p_pickup_window_id: o.pickup_window_id,
    p_pickup_date: o.pickup_date,
    p_items: o.items,
    p_bundles: o.bundles,
    p_ip_hash: await deviceHash(),
    p_teacher_id: teacherId,
    p_delivery_room: o.delivery === "room" ? o.room : undefined,
  });
  if (error) {
    return { code: error.message, message: error.hint || "Something went wrong placing your order. Please try again." };
  }

  const orderNumber = (data as { order_number: number }).order_number;
  await saveOrder(orderNumber, o.last_name);
  return { placed: { orderNumber } };
}

/** What the cart costs right now, from the database (deals, bundles, rewards). */
export type Quote = {
  lines: {
    product_id: string;
    name: string;
    quantity: number;
    regular_price_cents: number;
    unit_price_cents: number;
    deal_title: string | null;
    is_reward: boolean;
  }[];
  bundles: { bundle_id: string; name: string; quantity: number; unit_price_cents: number }[];
  discounts: { label: string; amount_cents: number; kind: "buy_get" | "reward" | "combo" }[];
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  member: boolean;
  /** Priced as an approved teacher. */
  teacher?: boolean;
  points_balance: number;
  points_earned: number;
  points_if_member: number;
};

export async function quoteCart(input: {
  items: { product_id: string; quantity: number }[];
  bundles: { bundle_id: string; quantity: number }[];
  rewardId: string | null;
}): Promise<{ quote?: Quote; message?: string; code?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_cart", {
    p_items: input.items,
    p_bundles: input.bundles,
    p_reward_id: input.rewardId ?? undefined,
  });
  if (error) return { code: error.message, message: error.hint || "Couldn't work out the price. Please refresh." };
  return { quote: data as unknown as Quote };
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

// ---- Item requests ("please sell …") -------------------------------------------------------

export type RequestState = {
  /** Set once it's saved. */
  done?: { item: string; count: number; already: boolean; status: string };
  errors?: Record<string, string>;
  message?: string;
};

const requestSchema = z.object({
  item: z.string().trim().min(2, "Tell us what you'd like us to sell").max(60, "Keep it under 60 characters"),
  category: z.string().trim().max(30).optional().default(""),
  note: z.string().trim().max(200, "Keep it under 200 characters").optional().default(""),
  requester: z.string().trim().max(60, "That's too long").optional().default(""),
  source: z.enum(["store3d", "web"]).optional().default("web"),
});

/**
 * Asks the store to sell something. Saved by the database function
 * request_item, which only this server code may call (so it can limit how
 * many one device sends). Signed-in students and teachers are linked to it.
 */
export async function requestItem(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Please fix the highlighted fields." };
  const r = parsed.data;

  const { data: login } = await (await createClient()).auth.getClaims();
  const userId = (login?.claims?.sub as string | undefined) ?? undefined;
  const account = userId ? await getAccount() : null;

  const { data, error } = await createSecretClient().rpc("request_item", {
    p_item: r.item,
    p_category: r.category,
    p_note: r.note,
    p_requester: r.requester || account?.profile?.first_name || account?.teacher?.first_name || "",
    p_ip_hash: await deviceHash(),
    p_source: r.source,
    p_customer_id: account?.profile && !account.staff ? userId : undefined,
    p_teacher_id: isTeacher(account) ? userId : undefined,
  });
  if (error) {
    // The full reason goes to the server log (Vercel → Logs).
    console.error("[request item] failed:", error.code, error.message);
    if (error.code === "PGRST202" || /request_item|item_requests/.test(error.message)) {
      return { message: "Requests aren't switched on yet. (Store staff: run database update 12.)" };
    }
    return { message: error.hint || `Couldn't send that: ${error.message}` };
  }
  revalidatePath("/admin/requests");
  return { done: data as RequestState["done"] };
}
