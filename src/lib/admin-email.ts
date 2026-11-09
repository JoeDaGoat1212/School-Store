import "server-only";

import { createSecretClient } from "@/lib/supabase/server";

/**
 * The email of the store's admin account, so sign-in only has to ask for the
 * password (or, on a locked store tablet, the manager code).
 *
 * Uses ADMIN_EMAIL if it's set (Vercel → Settings → Environment Variables);
 * otherwise looks up the one account in the `admins` table.
 */
export async function adminEmail(): Promise<string | null> {
  const fromEnv = process.env.ADMIN_EMAIL?.trim();
  if (fromEnv) return fromEnv;

  const secret = createSecretClient();
  const { data: admin } = await secret.from("admins").select("user_id").limit(1).maybeSingle();
  if (!admin) return null;

  const { data } = await secret.auth.admin.getUserById(admin.user_id);
  return data.user?.email ?? null;
}
