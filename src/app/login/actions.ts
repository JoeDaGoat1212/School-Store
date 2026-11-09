"use server";

import { redirect } from "next/navigation";
import { adminEmail } from "@/lib/admin-email";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Logs the admin in with just the admin password. Called by the form on /login. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!password) {
    return { error: "Enter the admin password." };
  }

  const email = await adminEmail();
  if (!email) {
    return { error: "No admin account is set up yet. Run `npm run create-admin` first." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Wrong password. Try again." };
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
