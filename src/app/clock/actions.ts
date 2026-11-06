"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ipHashSalt } from "@/lib/env";
import { type ClockBoard, emptyBoard, type PunchResult } from "@/lib/staff";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * The time clock at /clock. Nobody logs in to use it: employees type their PIN.
 * Students can't touch the staff tables, so these run on the server with the
 * secret key and call the database functions made for this (they do the real
 * checks, and lock a device out after 8 wrong PINs in 15 minutes).
 */

/** The device's IP address, scrambled (same as for orders): for the rate limits only. */
async function deviceHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ipHashSalt()}:clock:${ip}`).digest("hex").slice(0, 32);
}

const OFFLINE = "Couldn't reach the store database. Check the Wi-Fi and try again.";

/** Who's on the clock, today's shifts and the upcoming schedule. */
export async function loadBoard(): Promise<{ board: ClockBoard; error?: string }> {
  const { data, error } = await createSecretClient().rpc("staff_board");
  if (error) return { board: emptyBoard, error: missingUpdate(error.message) ?? OFFLINE };
  return { board: data as unknown as ClockBoard };
}

/** Clock in or out with a 4-digit PIN or a scanned badge. */
export async function punch(code: string): Promise<PunchResult> {
  const clean = String(code ?? "").trim().slice(0, 40);
  if (!clean) return { error: "Type your PIN first." };
  const { data, error } = await createSecretClient().rpc("staff_punch", { p_code: clean, p_ip_hash: await deviceHash() });
  if (error) return { error: missingUpdate(error.message) ?? OFFLINE };
  revalidatePath("/admin/staff", "layout");
  return data as unknown as PunchResult;
}

/** Undo a punch made by mistake (within 2 minutes). */
export async function undoPunch(shiftId: string, token: string): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await createSecretClient().rpc("staff_punch_undo", { p_shift_id: shiftId, p_token: token });
  if (error) return { error: OFFLINE };
  revalidatePath("/admin/staff", "layout");
  return data as unknown as { ok?: boolean; error?: string };
}

/** "Create account": a new employee picks their own PIN. */
export async function signUp(input: {
  name: string;
  pin: string;
  badge: string;
}): Promise<{ ok?: boolean; pending?: boolean; name?: string; error?: string; field?: string }> {
  const { data, error } = await createSecretClient().rpc("staff_signup", {
    p_name: String(input.name ?? "").slice(0, 60),
    p_pin: String(input.pin ?? "").slice(0, 8),
    p_badge: String(input.badge ?? "").slice(0, 60) || null,
    p_ip_hash: await deviceHash(),
  });
  if (error) return { error: missingUpdate(error.message) ?? OFFLINE };
  revalidatePath("/admin", "layout");
  return data as unknown as { ok?: boolean; pending?: boolean; name?: string; error?: string; field?: string };
}

/** Before database update 15 has been run, say so instead of a confusing error. */
function missingUpdate(message: string) {
  return /staff_|function .* does not exist|schema cache/i.test(message)
    ? "The time clock isn't set up yet: run database update 15 (20261106000015_staff_time_clock.sql) in Supabase."
    : null;
}
