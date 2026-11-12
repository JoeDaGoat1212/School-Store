import "server-only";

import { createSecretClient } from "@/lib/supabase/server";

/**
 * The email of the store's admin account, so sign-in only has to ask for the
 * password (or, on a locked store tablet, the manager code).
 *
 * Uses ADMIN_EMAIL if it's set (Vercel → Settings → Environment Variables);
 * otherwise looks up the owner in the `admins` table (managers sign in with
 * their name instead; database update 23).
 */
export async function adminEmail(): Promise<string | null> {
  const fromEnv = process.env.ADMIN_EMAIL?.trim();
  if (fromEnv) return fromEnv;

  const secret = createSecretClient();
  const owner = await secret.from("admins").select("user_id").eq("role", "owner").order("created_at").limit(1).maybeSingle();
  // Before update 23 there's no role column: the one admin is the owner.
  const { data: admin } = owner.error ? await secret.from("admins").select("user_id").order("created_at").limit(1).maybeSingle() : owner;
  if (!admin) return null;

  const { data } = await secret.auth.admin.getUserById(admin.user_id);
  return data.user?.email ?? null;
}
