import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The store tablet lock (database update 18). Locking keeps a random token in
 * this cookie on the tablet; the database only stores its hash.
 */
export const KIOSK_COOKIE = "fn_kiosk";

export const kioskHash = (token: string) => createHash("sha256").update(`kiosk:${token}`).digest("hex");

/** This device's tablet token, if it has one. */
export async function kioskToken() {
  return (await cookies()).get(KIOSK_COOKIE)?.value ?? null;
}
