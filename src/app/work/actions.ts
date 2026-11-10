"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { PortalData, PunchResult } from "@/lib/staff";
import { deviceHashFrom, endSession, portalFor, punchFor, startSession, undoPunch } from "@/lib/work-session";

/*
 * The employee web app (/work). Employees sign in with their name and time
 * clock PIN; the session token lives in a cookie on their phone. The logic is
 * shared with the phone app's API in src/lib/work-session.ts.
 */

const COOKIE = "fn_work";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

async function token() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/** The signed-in employee's portal, or null when nobody is signed in on this phone. */
export async function loadPortal(): Promise<{ data: PortalData | null; error?: string }> {
  const t = await token();
  if (!t) return { data: null };
  return portalFor(t);
}

export async function signIn(name: string, pin: string): Promise<{ ok?: boolean; error?: string }> {
  const h = await headers();
  const r = await startSession(name, pin, deviceHashFrom(h, "work"), h.get("user-agent"));
  if (!r.token) return { error: r.error };
  (await cookies()).set(COOKIE, r.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return { ok: true };
}

export async function signOut() {
  const t = await token();
  if (t) await endSession(t);
  (await cookies()).delete(COOKIE);
}

/** Clock in or out from the phone. */
export async function phonePunch(): Promise<PunchResult | { error: string; code?: "SIGNED_OUT" }> {
  const t = await token();
  if (!t) return { error: "You're signed out. Sign in again.", code: "SIGNED_OUT" };
  const r = await punchFor(t);
  revalidatePath("/admin", "layout");
  return r;
}

/** Undo a punch made by mistake (within 2 minutes). Only the person holding the undo code can. */
export async function phoneUndo(shiftId: string, undoToken: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await token())) return { error: "You're signed out." };
  const r = await undoPunch(shiftId, undoToken);
  revalidatePath("/admin", "layout");
  return r;
}
