import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Call at the top of every admin page and admin server action:
 *
 *   const { supabase, user } = await requireAdmin();
 *
 * Sends the visitor to /login if they aren't the store admin. Returns a
 * Supabase client that acts as the admin.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    redirect("/login");
  }

  // Logged in isn't enough — the account must be in the admins table.
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", claims.sub).maybeSingle();

  if (!admin) {
    redirect("/login?error=not-admin");
  }

  return {
    supabase,
    user: { id: claims.sub, email: (claims.email as string | undefined) ?? "" },
  };
}
