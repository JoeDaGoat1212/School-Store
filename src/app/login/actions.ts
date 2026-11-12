"use server";

import { redirect } from "next/navigation";
import { adminEmail } from "@/lib/admin-email";
import { managerEmail } from "@/lib/managers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/**
 * Logs a manager in. Called by the form on /login.
 *   - name left blank: the owner, with the admin password;
 *   - a name (like "Matthew"): that manager, with their own password.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!password) {
    return { error: "Enter your password." };
  }

  const email = name ? await managerEmail(name) : await adminEmail();
  if (!email) {
    return { error: name ? `There's no manager named ${name}. Check the spelling, or leave the name blank if you're the owner.` : "No admin account is set up yet. Run `npm run create-admin` first." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: name ? `Wrong password for ${name}. Try again.` : "Wrong password. Try again." };
  }

  // Make sure this account is the store admin, not just any account.
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    return { error: "This account isn't the store admin." };
  }

  // Only allow redirects inside the staff area (or back to the employee app).
  redirect(next.startsWith("/admin") || next === "/work" ? next : "/admin");
}

/** Logs out and goes back to the login page. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
