"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createSecretClient } from "@/lib/supabase/server";
import { GRADES } from "@/lib/validation";

/*
 * Rewards account sign-in, step by step:
 *   1. sendCode    — Supabase emails a 6-digit code (and makes the account if it's new)
 *   2. verifyCode  — checks the code and signs the student in (sets the login cookie)
 *   3. saveProfile — the first time only: name and grade
 */

export type SignInState = {
  step: "email" | "code";
  email?: string;
  message?: string;
  /** Bumps each time a code is sent, so the page can say "sent again". */
  sentAt?: number;
};

const emailSchema = z.email({ message: "Enter a real email address" }).trim().toLowerCase().max(120);

export async function sendCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { step: "email", email: String(formData.get("email") ?? ""), message: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { step: "email", email: parsed.data, message: friendlyAuthError(error.message, error.status) };
  }
  return { step: "code", email: parsed.data, sentAt: Date.now() };
}

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!email.success) return { step: "email", message: "Start again with your email address." };
  if (code.length !== 6) {
    return { step: "code", email: email.data, message: "The code is 6 numbers. Check your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code, type: "email" });
  if (error) {
    return { step: "code", email: email.data, message: friendlyAuthError(error.message, error.status) };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export type ProfileState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(40, "First name is too long"),
  last_name: z.string().trim().min(1, "Enter your last name").max(40, "Last name is too long"),
  grade: z.enum(GRADES, { message: "Choose your grade" }),
});

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const values = Object.fromEntries(["first_name", "last_name", "grade"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_profile", {
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_grade: parsed.data.grade,
  });
  if (error) return { message: error.hint || "Couldn't save. Please try again.", values };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Deletes the student's account and all their points. Their past orders stay (without the link to them). */
export async function deleteAccount() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/account");

  // Never let this delete the staff login.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) redirect("/account");

  await supabase.auth.signOut();
  await createSecretClient().auth.admin.deleteUser(userId);
  revalidatePath("/", "layout");
  redirect("/?account=deleted");
}

/** Only go back to a page on this site (never "//other-site.com"). */
function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

/** Supabase's error messages, in plain words. */
function friendlyAuthError(message: string, status?: number) {
  const m = message.toLowerCase();
  if (status === 429 || m.includes("rate limit") || m.includes("security purposes")) {
    return "Too many codes were sent. Wait a minute, then try again.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return "That code didn't work. Check the newest email, or send a new code.";
  }
  if (m.includes("signups not allowed") || m.includes("signup")) {
    return "New accounts are turned off right now. Ask at the store window.";
  }
  if (m.includes("sending") || m.includes("smtp") || m.includes("email")) {
    return "We couldn't send the email. Try again in a minute.";
  }
  return "Something went wrong. Please try again.";
}
