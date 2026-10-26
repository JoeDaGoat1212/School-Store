import "server-only";

import { cookies } from "next/headers";

/**
 * Remembers a student's recent orders on THEIR device (in a cookie), so the
 * confirmation page can show the order without making them type their last
 * name again. Nothing is stored about other students.
 *
 * The cookie is httpOnly (page scripts can't read it) and expires after 2 days.
 */

const COOKIE = "my_orders";
const MAX_SAVED = 5;

type SavedOrder = { n: number; last: string };

export async function getSavedOrders(): Promise<SavedOrder[]> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((o) => typeof o.n === "number" && typeof o.last === "string") : [];
  } catch {
    return [];
  }
}

/** The last name saved for this order number on this device, if any. */
export async function savedLastName(orderNumber: number) {
  return (await getSavedOrders()).find((o) => o.n === orderNumber)?.last ?? null;
}

/** Only call from a server action (cookies can't be set while rendering a page). */
export async function saveOrder(orderNumber: number, lastName: string) {
  const rest = (await getSavedOrders()).filter((o) => o.n !== orderNumber);
  const next = [{ n: orderNumber, last: lastName }, ...rest].slice(0, MAX_SAVED);
  (await cookies()).set(COOKIE, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 2,
    path: "/",
  });
}
