"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { KIOSK_COOKIE, kioskHash, kioskToken } from "@/lib/kiosk";

/*
 * "Lock tablet on time clock" on the dashboard (database update 18).
 */

/** Sets or changes the manager code that unlocks the store tablet. */
export async function setKioskPin(pin: string): Promise<{ ok?: true; error?: string }> {
  const { supabase } = await requireAdmin();
  if (!/^\d{4,6}$/.test(pin)) return { error: "The manager code must be 4 to 6 numbers." };
  const { error } = await supabase.rpc("kiosk_set_pin", { p_pin: pin });
  if (error) {
    return { error: /kiosk_set_pin|does not exist|schema cache/.test(error.message) ? "Run database update 18 first." : error.message.replace(/^.*?ERROR:\s*/, "") };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Locks THIS device on the time clock: remembers it as the store tablet,
 * signs the manager out here, and opens the time clock.
 */
export async function lockThisTablet(): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();
  const token = (await kioskToken()) ?? randomBytes(32).toString("base64url");
  const { error } = await supabase.rpc("kiosk_register", { p_token_hash: kioskHash(token) });
  if (error) return { error: /does not exist|schema cache/.test(error.message) ? "Run database update 18 first." : error.message.replace(/^.*?ERROR:\s*/, "") };
  (await cookies()).set(KIOSK_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  await supabase.auth.signOut();
  redirect("/clock");
}
