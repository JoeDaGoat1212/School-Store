"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createSecretClient } from "@/lib/supabase/server";
import { GRADES } from "@/lib/validation";

/*
 * Rewards accounts.
 *
 *   Make an account:  signUp → (Supabase emails a code) → confirmSignUp → saveProfile (name, grade, username)
 *   Sign back in:     signInWithPassword — username (or email) and password
 *   Forgot password:  sendCode → verifyCode (signs in with an emailed code) → setPassword
 *
 * Accounts made before passwords existed sign in the "forgot password" way
 * once, then set a username and password on their account page.
 */

export type SignInState = {
  step: "email" | "code";
  email?: string;
  message?: string;
  /** Bumps each time a code is sent, so the page can say "sent again". */
  sentAt?: number;
};

export type AuthState = {
  /** Which part of the card to show. */
  view: "signin" | "signup" | "confirm";
  email?: string;
  values?: Record<string, string>;
  errors?: Record<string, string>;
  message?: string;
  sentAt?: number;
};

const USERNAME = /^[A-Za-z0-9_.]{3,20}$/;
const usernameSchema = z.string().trim().regex(USERNAME, { message: "3 to 20 letters, numbers, dots or underscores (no spaces)" });
const passwordSchema = z.string().min(8, { message: "Use at least 8 characters" }).max(72, { message: "That password is too long" });

const emailSchema = z.email({ message: "Enter a real email address" }).trim().toLowerCase().max(120);

export async function sendCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { step: "email", email: String(formData.get("email") ?? ""), message: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    // Codes are for existing accounts (forgot password); new accounts sign up with a password.
    options: { shouldCreateUser: false },
  });

  if (error) {
    // The full error goes to the Terminal running `npm run dev` (and Vercel's logs).
    console.error("[rewards sign-in] Supabase couldn't send the code:", error.status, error.code, error.message);
    return { step: "email", email: parsed.data, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }
  return { step: "code", email: parsed.data, sentAt: Date.now() };
}

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!email.success) return { step: "email", message: "Start again with your email address." };
  // Supabase's codes are 6 to 10 numbers long, depending on the project's "Email OTP length" setting.
  if (code.length < 6 || code.length > 10) {
    return { step: "code", email: email.data, message: "Type the whole code from the email (just the numbers)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code, type: "email" });
  if (error) {
    console.error("[rewards sign-in] Code check failed:", error.status, error.code, error.message);
    return { step: "code", email: email.data, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }

  // Signed in with a code: offer to set a (new) password on the account page.
  revalidatePath("/", "layout");
  redirect("/account?password=new");
}

// ---- Make an account ------------------------------------------------------------------

const signUpSchema = z.object({ username: usernameSchema, email: emailSchema, password: passwordSchema });

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { username: String(formData.get("username") ?? "").trim(), email: String(formData.get("email") ?? "").trim() };
  const parsed = signUpSchema.safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { view: "signup", values, errors: fieldErrors(parsed.error.issues) };
  const { username, email, password } = parsed.data;

  const supabase = await createClient();
  const { data: free, error: checkError } = await supabase.rpc("username_available", { p_username: username });
  if (checkError) console.error("[rewards sign-up] Username check failed:", checkError.message);
  if (free === false) return { view: "signup", values, errors: { username: "That username is taken. Try another one." } };

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
  if (error) {
    console.error("[rewards sign-up] Supabase couldn't make the account:", error.status, error.code, error.message);
    const m = error.message.toLowerCase();
    if (m.includes("already")) return { view: "signup", values, errors: { email: "That email already has an account. Sign in instead." } };
    if (m.includes("password")) return { view: "signup", values, errors: { password: "Pick a stronger password (longer, with a number or symbol)." } };
    return { view: "signup", values, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }
  // Supabase hides "this email is taken" by returning a user with no sign-in methods.
  if (data.user && data.user.identities?.length === 0) {
    return { view: "signup", values, errors: { email: "That email already has an account. Sign in instead, or use “Forgot password”." } };
  }
  // Email confirmation turned off in Supabase: they're signed in already.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(safeNext(formData.get("next")));
  }
  return { view: "confirm", email, values, sentAt: Date.now() };
}

/** The code from the "confirm your email" message finishes making the account. */
export async function confirmSignUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!email.success) return { view: "signup", message: "Start again with your email address." };
  if (code.length < 6 || code.length > 10) {
    return { view: "confirm", email: email.data, message: "Type the whole code from the email (just the numbers)." };
  }

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email: email.data, token: code, type: "signup" });
  // Some Supabase projects send the sign-up code as a plain "email" code.
  if (error) ({ error } = await supabase.auth.verifyOtp({ email: email.data, token: code, type: "email" }));
  if (error) {
    console.error("[rewards sign-up] Code check failed:", error.status, error.code, error.message);
    return { view: "confirm", email: email.data, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function resendSignUpCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { view: "signup", message: "Start again with your email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: email.data });
  if (error) {
    console.error("[rewards sign-up] Couldn't resend:", error.status, error.message);
    return { view: "confirm", email: email.data, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }
  return { view: "confirm", email: email.data, sentAt: Date.now() };
}

// ---- Sign back in -------------------------------------------------------------------------

export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const values = { login };
  if (!login) return { view: "signin", values, errors: { login: "Enter your username or email" } };
  if (!password) return { view: "signin", values, errors: { password: "Enter your password" } };

  // A username: look up its email (on the server only, so nobody can find out someone's email).
  let email = login.toLowerCase();
  if (!login.includes("@")) {
    const { data } = await createSecretClient().from("customers").select("email").eq("username_key", login.toLowerCase()).maybeSingle();
    if (!data) return { view: "signin", values, message: "That username or password isn't right." };
    email = data.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("not confirmed")) {
      // They never typed the code from the sign-up email: send a fresh one.
      await supabase.auth.resend({ type: "signup", email });
      return { view: "confirm", email, sentAt: Date.now(), message: "Confirm your email first: we just sent you a new code." };
    }
    if (m.includes("invalid")) return { view: "signin", values, message: "That username or password isn't right." };
    console.error("[rewards sign-in] Password sign-in failed:", error.status, error.code, error.message);
    return { view: "signin", values, message: friendlyAuthError(error.message, error.status) + devDetail(error.message) };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

// ---- New password (after "forgot password", or from the account page) --------------------

export type PasswordState = { ok?: boolean; error?: string };

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    console.error("[rewards] Couldn't set password:", error.status, error.message);
    const m = error.message.toLowerCase();
    if (m.includes("different") || m.includes("same")) return { error: "That's already your password. Pick a new one." };
    if (m.includes("weak") || m.includes("password")) return { error: "Pick a stronger password (longer, with a number or symbol)." };
    return { error: "Couldn't save your password. Please try again." + devDetail(error.message) };
  }
  return { ok: true };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

export type ProfileState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(40, "First name is too long"),
  last_name: z.string().trim().min(1, "Enter your last name").max(40, "Last name is too long"),
  grade: z.enum(GRADES, { message: "Choose your grade" }),
  username: usernameSchema,
});

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const values = Object.fromEntries(["first_name", "last_name", "grade", "username"].map((k) => [k, String(formData.get(k) ?? "")]));
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
    p_username: parsed.data.username,
  });
  if (error) {
    if (error.message.includes("USERNAME_TAKEN")) return { errors: { username: "That username is taken. Try another one." }, values };
    return { message: error.hint || "Couldn't save. Please try again.", values };
  }

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

/** While testing on your computer (npm run dev), also show Supabase's exact words. */
function devDetail(message: string) {
  return process.env.NODE_ENV === "development" ? ` (Supabase says: ${message})` : "";
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
  if (m.includes("not allowed for otp") || m.includes("user not found")) {
    return "No account uses that email yet. Make one with “Create account”.";
  }
  if (m.includes("signups not allowed") || m.includes("signup")) {
    return "New accounts are turned off right now. Ask at the store window.";
  }
  if (m.includes("sending") || m.includes("smtp") || m.includes("email")) {
    return "We couldn't send the email. Try again in a minute.";
  }
  return "Something went wrong. Please try again.";
}
