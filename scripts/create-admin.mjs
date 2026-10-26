// Creates the store's admin login (or resets its password).
//
//   npm run create-admin -- you@school.org "a-long-password"
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
// The secret key can do anything in your database, so this script only
// runs on your own computer — never put that key in browser code.

import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-admin -- you@school.org "a-long-password"');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Please use a password with at least 10 characters.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1. Find or create the login.
const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (user) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
  console.log(`Updated the password for ${email}.`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log(`Created login ${email}.`);
}

// 2. Make it the admin.
const { error: adminError } = await supabase.from("admins").upsert({ user_id: user.id });
if (adminError) throw adminError;

const { count } = await supabase.from("admins").select("*", { count: "exact", head: true });
console.log(`${email} is now an admin. You can log in at /login.`);
if (count > 1) {
  console.log(`Note: there are ${count} admin accounts. Remove old ones in Supabase → Table editor → admins.`);
}
