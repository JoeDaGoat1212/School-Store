"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createSecretClient } from "@/lib/supabase/server";
import type { AuthState } from "../account/actions";

/*
 * Teacher accounts.
 *
 *   Ask for an account:  teacherSignUp (name, room, email, password)
 *                        → the account is made already confirmed (no email
 *                          code) and the request is filed (status "pending")
 *   (confirmTeacherSignUp is only for older accounts that never typed their code.)
 *   Staff approve it in Admin → Teachers. Until then, normal prices.
 *   Sign back in:        the same email + password sign-in as students
 *                        (signInWithPassword in ../account/actions.ts).
 */

const teacherSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(40, "That's too long"),
  last_name: z.string().trim().min(1, "Enter your last name").max(40, "That's too long"),
  room: z.string().trim().min(1, "Enter your room number").max(20, "That's too long"),
});

const signUpSchema = teacherSchema.extend({
  email: z.email({ message: "Enter a real email address" }).trim().toLowerCase().max(120),
  password: z.string().min(8, { message: "Use at least 8 characters" }).max(72, { message: "That password is too long" }),
});

function errorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

/** Files (or updates) the signed-in teacher's request. */
async function fileRequest(details: { first_name: string; last_name: string; room: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_teacher_profile", {
    p_first_name: details.first_name,
    p_last_name: details.last_name,
    p_room: details.room,
  });
  return error;
}

export async function teacherSignUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = Object.fromEntries(["first_name", "last_name", "room", "email"].map((k) => [k, String(formData.get(k) ?? "").trim()]));
  const parsed = signUpSchema.safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { view: "signup", values, errors: errorsOf(parsed.error.issues) };
  const { email, password, ...details } = parsed.data;

  // Teachers skip the "type the code from your email" step: the account is
  // made already confirmed (this needs the secret key, so it only happens here
  // on the server). Staff still have to approve them before teacher prices
  // start, and they can see the email on the Teachers page.
  const { error } = await createSecretClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "teacher", ...details },
  });
  if (error) {
    console.error("[teacher sign-up] Supabase couldn't make the account:", error.status, error.code, error.message);
    const m = error.message.toLowerCase();
    if (m.includes("already")) return { view: "signup", values, errors: { email: "That email already has an account. Sign in instead." } };
    if (m.includes("password")) return { view: "signup", values, errors: { password: "Pick a stronger password (longer, with a number or symbol)." } };
    return { view: "signup", values, message: "Something went wrong. Please try again." };
  }

  // Sign them in, then file the request.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("[teacher sign-up] Sign-in after sign-up failed:", signInError.status, signInError.message);
    return { view: "signin", values: { login: email }, message: "Your account is made. Sign in to send your request." };
  }
  await fileRequest(details);
  revalidatePath("/", "layout");
  redirect("/teacher");
}

/** The code from the email: confirms the account and files the teacher request. */
export async function confirmTeacherSignUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length < 6 || code.length > 10) {
    return { view: "confirm", email, message: "Type the whole code from the email (just the numbers)." };
  }
  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" }));
  if (error) {
    console.error("[teacher sign-up] Code check failed:", error.status, error.message);
    return { view: "confirm", email, message: "That code didn't work. Check the newest email, or send a new code." };
  }

  // File the request with the details typed at sign-up (unless it's already filed).
  const { data: claims } = await supabase.auth.getClaims();
  const meta = (claims?.claims?.user_metadata ?? {}) as Record<string, string>;
  const { data: mine } = await supabase.from("teachers").select("id").maybeSingle();
  const details = teacherSchema.safeParse(meta);
  if (!mine && details.success) await fileRequest(details.data);

  revalidatePath("/", "layout");
  redirect("/teacher");
}

export type TeacherDetailsState = { errors?: Record<string, string>; message?: string; saved?: boolean };

/** Ask for teacher access from an account that's already signed in, or change name / room. */
export async function saveTeacherDetails(_prev: TeacherDetailsState, formData: FormData): Promise<TeacherDetailsState> {
  const parsed = teacherSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error.issues) };
  const error = await fileRequest(parsed.data);
  if (error) return { message: error.hint || "Couldn't save. Please try again." };
  revalidatePath("/", "layout");
  return { saved: true };
}
