import "server-only";

import { randomBytes } from "node:crypto";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * Manager accounts (database update 23). The owner and every manager are rows
 * in `admins`; managers have a name they sign in with and role 'manager'.
 * Their login email is made up (nobody types it, and no email is ever sent).
 */

export type Manager = { userId: string; name: string; createdAt: string };

/** True when update 23 hasn't been run yet (no name/role columns). */
export const notReady = (message?: string) => !!message && /column .*(role|name)|admins\.(role|name)/i.test(message);

/** The owner? (Before update 23 every admin is the owner.) */
export async function isOwner(userId: string) {
  const { data, error } = await createSecretClient().from("admins").select("role").eq("user_id", userId).maybeSingle();
  if (error) return notReady(error.message);
  return data?.role !== "manager";
}

/** Who's signed in, for showing "Signed in as Matthew (manager)". */
export async function adminWho(userId: string): Promise<{ name: string | null; owner: boolean }> {
  const { data, error } = await createSecretClient().from("admins").select("name, role").eq("user_id", userId).maybeSingle();
  if (error || !data) return { name: null, owner: true };
  return { name: data.name, owner: data.role !== "manager" };
}

/** The login email for a manager's name, or null if there's no such manager. */
export async function managerEmail(name: string): Promise<string | null> {
  const db = createSecretClient();
  const { data, error } = await db.from("admins").select("user_id").eq("role", "manager").ilike("name", name.trim()).maybeSingle();
  if (error || !data) return null;
  const { data: u } = await db.auth.admin.getUserById(data.user_id);
  return u.user?.email ?? null;
}

export async function listManagers(): Promise<{ managers: Manager[]; ready: boolean }> {
  const { data, error } = await createSecretClient()
    .from("admins")
    .select("user_id, name, created_at")
    .eq("role", "manager")
    .order("created_at");
  if (error) return { managers: [], ready: !notReady(error.message) };
  return { managers: (data ?? []).map((m) => ({ userId: m.user_id, name: m.name ?? "Manager", createdAt: m.created_at })), ready: true };
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "manager";

export async function addManager(name: string, password: string): Promise<{ error?: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) return { error: "Type their name (2 to 40 letters)." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  const db = createSecretClient();
  const { data: taken } = await db.from("admins").select("user_id").ilike("name", clean).maybeSingle();
  if (taken) return { error: `There's already a manager named ${clean}.` };

  const email = `manager.${slug(clean)}.${randomBytes(3).toString("hex")}@firebirdnest.store`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: clean, role: "manager" } });
  if (error || !data.user) return { error: error?.message ?? "Couldn't make the account." };
  const { error: rowError } = await db.from("admins").insert({ user_id: data.user.id, name: clean, role: "manager" });
  if (rowError) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: notReady(rowError.message) ? "Run database update 23 first (Supabase → SQL Editor)." : rowError.message };
  }
  return {};
}

/** Only ever touches manager rows, so the owner's account can't be changed here. */
async function managerRow(userId: string) {
  const { data } = await createSecretClient().from("admins").select("user_id").eq("user_id", userId).eq("role", "manager").maybeSingle();
  return data;
}

export async function setManagerPassword(userId: string, password: string): Promise<{ error?: string }> {
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (!(await managerRow(userId))) return { error: "That manager wasn't found." };
  const { error } = await createSecretClient().auth.admin.updateUserById(userId, { password });
  return error ? { error: error.message } : {};
}

export async function removeManager(userId: string): Promise<{ error?: string }> {
  if (!(await managerRow(userId))) return { error: "That manager wasn't found." };
  // Deleting the login also removes the admins row (on delete cascade).
  const { error } = await createSecretClient().auth.admin.deleteUser(userId);
  return error ? { error: error.message } : {};
}
