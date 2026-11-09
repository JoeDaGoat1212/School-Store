"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { adminEmail } from "@/lib/admin-email";
import { kioskHash, kioskToken } from "@/lib/kiosk";
import { ipHashSalt } from "@/lib/env";
import { storeToday } from "@/lib/format";
import { type ClockBoard, emptyBoard, type PunchResult } from "@/lib/staff";
import { createClient, createSecretClient } from "@/lib/supabase/server";

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

/** The same team numbers the admin dashboard shows. */
export type ClockStats = { scheduledToday: number; weekMinutes: number };

/** Who's on the clock, today's shifts and the upcoming schedule, the auto clock-out limit, and team numbers. */
export async function loadBoard(): Promise<{ board: ClockBoard; maxShiftMinutes: number; stats: ClockStats; error?: string }> {
  const db = createSecretClient();
  // End anyone past the limit first (the database also does this every minute).
  await db.rpc("staff_auto_clock_out");
  const [{ data, error }, { data: settings }, { data: balances }, { count: scheduledToday }] = await Promise.all([
    db.rpc("staff_board"),
    db.from("settings").select("staff_max_shift_minutes").eq("id", 1).maybeSingle(),
    db.rpc("staff_credit_balances"),
    db.from("staff_schedule").select("id", { count: "exact", head: true }).eq("work_date", storeToday()),
  ]);
  const maxShiftMinutes = settings?.staff_max_shift_minutes ?? 0;
  const stats: ClockStats = {
    scheduledToday: scheduledToday ?? 0,
    weekMinutes: ((balances ?? []) as { week_minutes?: number }[]).reduce((t, b) => t + (b.week_minutes ?? 0), 0),
  };
  if (error) return { board: emptyBoard, maxShiftMinutes, stats, error: missingUpdate(error.message) ?? OFFLINE };
  return { board: data as unknown as ClockBoard, maxShiftMinutes, stats };
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

/** Is this device the locked store tablet? */
export async function isLockedTablet() {
  const token = await kioskToken();
  if (!token) return false;
  const { data } = await createSecretClient().rpc("kiosk_is_locked", { p_token_hash: kioskHash(token) });
  return data === true;
}

/**
 * The manager code on the locked store tablet: checks it (5 wrong tries lock
 * the tablet out for 15 minutes), then signs the manager in on this tablet.
 * The page then opens the dashboard.
 */
export async function unlockTablet(code: string): Promise<{ ok?: true; error?: string }> {
  const token = await kioskToken();
  if (!token) return { error: "This device isn't the locked store tablet. Use the admin password." };
  const secret = createSecretClient();
  const { data, error } = await secret.rpc("kiosk_unlock", { p_token_hash: kioskHash(token), p_pin: String(code ?? "").slice(0, 8) });
  if (error) return { error: OFFLINE };
  const r = data as unknown as { ok?: boolean; error?: string };
  if (!r.ok) return { error: r.error ?? "That isn't the manager code." };

  // Sign the manager in here without the password: a one-time sign-in link,
  // made and used on the server (nothing is emailed).
  const email = await adminEmail();
  if (!email) return { error: "No admin account is set up yet." };
  const { data: link, error: linkError } = await secret.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: "Couldn't sign you in. Use the admin password instead." };
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (verifyError) return { error: "Couldn't sign you in. Use the admin password instead." };
  return { ok: true };
}
