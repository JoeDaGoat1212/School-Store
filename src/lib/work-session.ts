import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { ipHashSalt } from "@/lib/env";
import type { PortalData, PunchResult } from "@/lib/staff";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * Employee sessions, shared by the web app (/work, token in a cookie) and the
 * phone app (mobile/, token sent as "Authorization: Bearer …" to /api/app/…).
 * A session is a long random token; the database only keeps its hash, and
 * every check goes through the staff_portal… functions in database update 16
 * (which also lock out wrong PIN guesses). Changing someone's PIN or removing
 * them signs them out everywhere.
 */

export const OFFLINE = "Couldn't reach the store. Check your internet and try again.";
export const NOT_READY = "The employee app isn't set up yet. Ask your manager to run database update 16.";
const notSetUp = (message: string) => /staff_portal|does not exist|schema cache/i.test(message);

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A short, salted hash of where a sign-in came from, for the wrong-PIN lockout. */
export function deviceHashFrom(h: Headers, kind: string) {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ipHashSalt()}:${kind}:${ip}`).digest("hex").slice(0, 32);
}

export async function portalFor(token: string): Promise<{ data: PortalData | null; error?: string }> {
  const db = createSecretClient();
  await db.rpc("staff_auto_clock_out");
  const [{ data, error }, { data: settings }, { data: cap }] = await Promise.all([
    db.rpc("staff_portal", { p_token_hash: hashToken(token) }),
    db.from("settings").select("staff_max_shift_minutes").eq("id", 1).maybeSingle(),
    // The weekly credit cap (database update 22; $10 until it's run).
    db.from("settings").select("staff_credit_week_cap_cents").eq("id", 1).maybeSingle(),
  ]);
  if (error) return { data: null, error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  const portal = data as unknown as Omit<PortalData, "maxShiftMinutes"> | null;
  if (!portal) return { data: null };
  return {
    data: {
      ...portal,
      rule: { ...portal.rule, capCents: cap?.staff_credit_week_cap_cents ?? 1000 },
      maxShiftMinutes: settings?.staff_max_shift_minutes ?? 0,
    },
  };
}

/** Name + PIN → a new session token (or why not). */
export async function startSession(name: string, pin: string, deviceHash: string, userAgent: string | null): Promise<{ token?: string; error?: string }> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await createSecretClient().rpc("staff_portal_login", {
    p_name: String(name ?? "").slice(0, 60),
    p_pin: String(pin ?? "").slice(0, 8),
    p_token_hash: hashToken(token),
    p_ip_hash: deviceHash,
    p_user_agent: userAgent?.slice(0, 200) ?? null,
  });
  if (error) return { error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  const r = data as unknown as { ok?: boolean; error?: string };
  if (!r.ok) return { error: r.error ?? "Couldn't sign in. Try again." };
  return { token };
}

export async function endSession(token: string) {
  await createSecretClient().rpc("staff_portal_logout", { p_token_hash: hashToken(token) });
}

export async function punchFor(token: string): Promise<PunchResult | { error: string; code?: "SIGNED_OUT" }> {
  const { data, error } = await createSecretClient().rpc("staff_portal_punch", { p_token_hash: hashToken(token) });
  if (error) return { error: notSetUp(error.message) ? NOT_READY : OFFLINE };
  return data as unknown as PunchResult;
}

export async function undoPunch(shiftId: string, undoToken: string): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await createSecretClient().rpc("staff_punch_undo", { p_shift_id: shiftId, p_token: undoToken });
  if (error) return { error: OFFLINE };
  return data as unknown as { ok?: boolean; error?: string };
}
