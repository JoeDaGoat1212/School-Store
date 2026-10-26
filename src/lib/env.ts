/**
 * Environment variables, checked in one place so a missing value gives a
 * clear message instead of a confusing crash.
 *
 * Set these in `.env.local` on your computer and in Vercel → Settings →
 * Environment Variables when deployed. See README.md → "Environment variables".
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

// NEXT_PUBLIC_ values are safe to send to the browser.
// They must be written out in full (not process.env[name]) so Next.js can
// put them into the browser code.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

// SERVER ONLY. Never import this from a "use client" file.
export const supabaseSecretKey = () => required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

// Used to hash device IPs for rate limiting (any long random string).
export const ipHashSalt = () => process.env.IP_HASH_SALT ?? "change-me-in-env";
