"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ipHashSalt } from "@/lib/env";
import type { PortalData, PunchResult } from "@/lib/staff";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * The employee app (/work). Employees sign in with their name and time clock
 * PIN. That makes a session: a long random token in a cookie on their phone.
 * The database only keeps a hash of the token, and every check goes through
 * the staff_portal… functions in database update 16 (which also lock out
 * wrong guesses). Changing someone's PIN or removing them signs them out.
 */

const COOKIE = "fn_work";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function token() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

async function deviceHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ipHashSalt()}:work:${ip}`).digest("hex").slice(0, 32);
}

const OFFLINE = "Couldn't reach the store. Check your internet and try again.";
const NOT_READY = "The employee app isn't set up yet. Ask your manager to run database update 16.";
const notSetUp = (message: string) => /staff_portal|does not exist|schema cache/i.test(message);

/** The signed-in employee's portal, or null when nobody is signed in on this phone. */
export async function loadPortal(): Promise<{ data: PortalData | null; error?: string }> {
  const t = await token();
  if (!t) return { data: null };
  const db = createSecretClient();
  await db.rpc("staff_auto_clock_out");
  const [{ data, error }, { data: settings }] = await Promise.all([
    db.rpc("staff_portal", { p_token_hash: hash(t) }),
    db.from("settings").select("staff_max_shift_minutes").eq("id", 1).maybeSingle(),
  ]);
  if (error) return { data: null, error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  const portal = data as unknown as Omit<PortalData, "maxShiftMinutes"> | null;
  return { data: portal ? { ...portal, maxShiftMinutes: settings?.staff_max_shift_minutes ?? 0 } : null };
}

export async function signIn(name: string, pin: string): Promise<{ ok?: boolean; error?: string }> {
  const t = randomBytes(32).toString("base64url");
  const h = await headers();
  const { data, error } = await createSecretClient().rpc("staff_portal_login", {
    p_name: String(name ?? "").slice(0, 60),
    p_pin: String(pin ?? "").slice(0, 8),
    p_token_hash: hash(t),
    p_ip_hash: await deviceHash(),
    p_user_agent: h.get("user-agent")?.slice(0, 200) ?? null,
  });
  if (error) return { error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  const r = data as unknown as { ok?: boolean; error?: string };
  if (!r.ok) return { error: r.error ?? "Couldn't sign in. Try again." };
  (await cookies()).set(COOKIE, t, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return { ok: true };
}

export async function signOut() {
  const t = await token();
  if (t) await createSecretClient().rpc("staff_portal_logout", { p_token_hash: hash(t) });
  (await cookies()).delete(COOKIE);
}

/** Clock in or out from the phone. */
export async function phonePunch(): Promise<PunchResult | { error: string; code: "SIGNED_OUT" }> {
  const t = await token();
  if (!t) return { error: "You're signed out. Sign in again.", code: "SIGNED_OUT" };
  const { data, error } = await createSecretClient().rpc("staff_portal_punch", { p_token_hash: hash(t) });
  if (error) return { error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  revalidatePath("/admin", "layout");
  return data as unknown as PunchResult;
}

/** Undo a punch made by mistake (within 2 minutes). Only the person holding the undo code can. */
export async function phoneUndo(shiftId: string, undoToken: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await token())) return { error: "You're signed out." };
  const { data, error } = await createSecretClient().rpc("staff_punch_undo", { p_shift_id: shiftId, p_token: undoToken });
  if (error) return { error: OFFLINE };
  revalidatePath("/admin", "layout");
  return data as unknown as { ok?: boolean; error?: string };
}
